import type { AuctionProvider, ServerListing, DiskInfo } from "../types.js";
import { getCpuVendor } from "../utils.js";

// ---------- OVH API types ----------

export interface OvhCpuBlob {
  brand?: string;
  model?: string;
  cores?: number;
  threads?: number;
  frequency?: number;
}

interface OvhProduct {
  name: string;
  blobs?: {
    technical?: {
      server?: { cpu?: OvhCpuBlob };
      memory?: { size?: number; ecc?: boolean; type?: string };
      storage?: {
        disks?: Array<{
          number?: number;
          capacity?: number;
          interface?: string;
          technology?: string;
        }>;
      };
      bandwidth?: { level?: number };
    };
  };
}

export interface OvhPlan {
  planCode: string;
  invoiceName?: string;
  product: string;
  pricings: Array<{
    price: number;
    capacities: string[];
    interval?: number;
  }>;
  addonFamilies?: Array<{
    name: string;
    addons?: string[];
  }>;
}

interface OvhCatalog {
  products: OvhProduct[];
  plans: OvhPlan[];
}

export interface OvhAvailabilityEntry {
  fqn: string;
  planCode: string;
  memory: string;
  storage: string;
  gpu?: string;
  datacenters: Array<{
    datacenter: string;
    availability: string;
  }>;
}

// ---------- Cache ----------

const CATALOG_URL =
  "https://eu.api.ovh.com/v1/order/catalog/public/eco?ovhSubsidiary=DE";
const AVAILABILITY_URL =
  "https://eu.api.ovh.com/v1/dedicated/server/datacenter/availabilities";
const CACHE_TTL_MS = 5 * 60 * 1000;

let catalogCache: { data: OvhCatalog; timestamp: number } | null = null;
let availabilityCache: {
  data: OvhAvailabilityEntry[];
  timestamp: number;
} | null = null;

async function fetchCatalog(): Promise<OvhCatalog> {
  if (catalogCache && Date.now() - catalogCache.timestamp < CACHE_TTL_MS) {
    return catalogCache.data;
  }
  const res = await fetch(CATALOG_URL);
  if (!res.ok) {
    throw new Error(`OVH Catalog API returned ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as OvhCatalog;
  catalogCache = { data, timestamp: Date.now() };
  return data;
}

async function fetchAvailability(): Promise<OvhAvailabilityEntry[]> {
  if (
    availabilityCache &&
    Date.now() - availabilityCache.timestamp < CACHE_TTL_MS
  ) {
    return availabilityCache.data;
  }
  const res = await fetch(AVAILABILITY_URL);
  if (!res.ok) {
    throw new Error(
      `OVH Availability API returned ${res.status}: ${res.statusText}`,
    );
  }
  const data = (await res.json()) as OvhAvailabilityEntry[];
  availabilityCache = { data, timestamp: Date.now() };
  return data;
}

// ---------- DC mapping ----------

const DC_COUNTRY: Record<string, string> = {
  fra: "DE",
  gra: "FR",
  rbx: "FR",
  sbg: "FR",
  lon: "GB",
  waw: "PL",
  bhs: "CA",
};

export function dcToCountry(dc: string): string {
  const prefix = dc.replace(/\d+$/, "").toLowerCase();
  return DC_COUNTRY[prefix] ?? "FR";
}

export function dcToRegion(dc: string): string {
  return dc.replace(/\d+$/, "").toUpperCase();
}

// ---------- Addon code parsers ----------

interface ParsedMemory {
  size_gb: number;
  is_ecc: boolean;
}

export function parseMemoryCode(code: string): ParsedMemory | null {
  // e.g. "ram-32g-ecc-3200", "ram-64g-noecc-2400"
  const match = code.match(/ram-(\d+)g/i);
  if (!match) return null;
  return {
    size_gb: parseInt(match[1], 10),
    is_ecc: code.toLowerCase().includes("ecc") && !code.toLowerCase().includes("noecc"),
  };
}

export function parseStorageCode(code: string): DiskInfo[] {
  // e.g. "softraid-2x512nvme", "softraid-2x2000sa", "softraid-4x960ssd"
  // Also handle "raid" variants: "raid1-2x512nvme"
  const match = code.match(/(\d+)x(\d+)(nvme|ssd|sa|hdd)/i);
  if (!match) return [];
  const count = parseInt(match[1], 10);
  const size = parseInt(match[2], 10);
  const rawType = match[3].toLowerCase();
  const type: DiskInfo["type"] =
    rawType === "nvme" ? "nvme"
    : rawType === "ssd" ? "sata"
    : rawType === "sa" ? "hdd"
    : rawType === "hdd" ? "hdd"
    : "unknown";
  return [{ count, size_gb: size, type }];
}

// ---------- Price normalization ----------

export function extractMonthlyPrice(plan: OvhPlan): number {
  // Look for monthly renew pricing
  const renew = plan.pricings.find(
    (p) => p.capacities.includes("renew") && (p.interval === 1 || p.interval === undefined),
  );
  if (!renew) return 0;
  // OVH catalog prices are in cents (hundredths of EUR)
  const priceEur = renew.price / 100_000_000;
  // Sanity check: if price seems too low after division, try cents
  if (priceEur < 1 && renew.price > 100) return renew.price / 100;
  return priceEur;
}

export function extractSetupPrice(plan: OvhPlan): number {
  const install = plan.pricings.find((p) =>
    p.capacities.includes("installation"),
  );
  if (!install) return 0;
  const priceEur = install.price / 100_000_000;
  if (priceEur < 0.01 && install.price > 100) return install.price / 100;
  return priceEur;
}

// ---------- Normalization ----------

export function buildListing(
  entry: OvhAvailabilityEntry,
  cpuInfo: OvhCpuBlob | null,
  pricing: { monthly: number; setup: number },
  planName: string,
  availableDcs: Array<{ datacenter: string; availability: string }>,
): ServerListing {
  const mem = parseMemoryCode(entry.memory);
  const disks = parseStorageCode(entry.storage);

  const cpuName = cpuInfo
    ? `${cpuInfo.brand ?? ""} ${cpuInfo.model ?? ""}`.trim()
    : planName;
  const cpuCores = cpuInfo?.cores ?? null;

  const firstDc = availableDcs[0];
  const dcList = availableDcs.map((d) => dcToRegion(d.datacenter));
  const uniqueDcs = [...new Set(dcList)];

  // Best availability (prefer "available" over time-based like "1H", "24H", etc.)
  const bestAvail =
    availableDcs.find((d) => d.availability === "available")?.availability ??
    availableDcs[0]?.availability ??
    "unknown";

  return {
    id: entry.fqn,
    provider: "ovh",
    url: "https://eco.ovhcloud.com/en/",
    name: planName,
    cpu: cpuName,
    cpu_count: 1,
    cpu_cores: cpuCores,
    cpu_vendor: getCpuVendor(cpuName),
    ram_gb: mem?.size_gb ?? 0,
    is_ecc: mem?.is_ecc ?? false,
    disks,
    disk_total_gb: disks.reduce((sum, d) => sum + d.size_gb * d.count, 0),
    disk_count: disks.reduce((sum, d) => sum + d.count, 0),
    bandwidth_mbps: 1000, // OVH ECO default: 1 Gbit
    datacenter: uniqueDcs.join(", "),
    datacenter_region: uniqueDcs[0] ?? "",
    country: firstDc ? dcToCountry(firstDc.datacenter) : "FR",
    price_monthly_eur: pricing.monthly,
    price_setup_eur: pricing.setup,
    price_hourly_eur: null,
    gpu: entry.gpu !== undefined && entry.gpu !== null && entry.gpu !== "",
    gpu_model: entry.gpu || null,
    is_highio: false,
    fixed_price: true,
    next_reduce_timestamp: null,
    availability: bestAvail,
    specials: [],
  };
}

// ---------- Provider ----------

export const ovhProvider: AuctionProvider = {
  name: "ovh",
  displayName: "OVH",
  async fetchListings(): Promise<ServerListing[]> {
    const [catalog, availability] = await Promise.all([
      fetchCatalog(),
      fetchAvailability(),
    ]);

    // Build CPU info lookup: planCode → CPU specs (from first matching product)
    const cpuByPlan = new Map<string, OvhCpuBlob>();
    for (const product of catalog.products) {
      const planCode = product.name.split(".")[0];
      if (
        !cpuByPlan.has(planCode) &&
        product.blobs?.technical?.server?.cpu
      ) {
        cpuByPlan.set(planCode, product.blobs.technical.server.cpu);
      }
    }

    // Build pricing lookup: planCode → { monthly, setup }
    const pricingByPlan = new Map<
      string,
      { monthly: number; setup: number; name: string }
    >();
    for (const plan of catalog.plans) {
      if (!pricingByPlan.has(plan.planCode)) {
        pricingByPlan.set(plan.planCode, {
          monthly: extractMonthlyPrice(plan),
          setup: extractSetupPrice(plan),
          name: plan.invoiceName ?? plan.planCode,
        });
      }
    }

    // Group availability entries by FQN (deduplicate)
    const byFqn = new Map<
      string,
      {
        entry: OvhAvailabilityEntry;
        dcs: Array<{ datacenter: string; availability: string }>;
      }
    >();
    for (const entry of availability) {
      const availDcs = entry.datacenters.filter(
        (d) => d.availability !== "unavailable",
      );
      if (availDcs.length === 0) continue;

      const existing = byFqn.get(entry.fqn);
      if (existing) {
        // Merge DCs
        for (const dc of availDcs) {
          if (!existing.dcs.some((d) => d.datacenter === dc.datacenter)) {
            existing.dcs.push(dc);
          }
        }
      } else {
        byFqn.set(entry.fqn, { entry, dcs: availDcs });
      }
    }

    // Build listings
    const listings: ServerListing[] = [];
    for (const { entry, dcs } of byFqn.values()) {
      const cpuInfo = cpuByPlan.get(entry.planCode) ?? null;
      const planInfo = pricingByPlan.get(entry.planCode);
      if (!planInfo) continue; // Skip entries without pricing info

      listings.push(
        buildListing(
          entry,
          cpuInfo,
          { monthly: planInfo.monthly, setup: planInfo.setup },
          planInfo.name,
          dcs,
        ),
      );
    }

    return listings;
  },
};
