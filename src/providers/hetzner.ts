import type { AuctionProvider, ServerListing, DiskInfo } from "../types.js";
import { getCpuVendor } from "../utils.js";

// ---------- Hetzner-specific API types ----------

export interface ServerDiskData {
  nvme: number[];
  sata: number[];
  hdd: number[];
  general: number[];
}

export interface HetznerAuctionServer {
  id: number;
  cpu: string;
  cpu_count: number;
  ram_size: number;
  ram: string[];
  is_ecc: boolean;
  price: number;
  setup_price: number;
  hourly_price: number;
  hdd_arr: string[];
  hdd_count: number;
  hdd_size: number;
  serverDiskData: ServerDiskData;
  datacenter: string;
  specials: string[];
  description: string[];
  information: string[];
  is_highio: boolean;
  fixed_price: boolean;
  next_reduce: number;
  next_reduce_timestamp: number;
  bandwidth: number;
}

interface HetznerAuctionResponse {
  server: HetznerAuctionServer[];
  serverCount: number;
}

// ---------- Cache ----------

const API_URL =
  "https://www.hetzner.com/_resources/app/data/app/live_data_sb_EUR.json";
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { data: HetznerAuctionServer[]; timestamp: number } | null = null;

async function fetchRawAuctions(): Promise<HetznerAuctionServer[]> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.data;
  }
  const res = await fetch(API_URL);
  if (!res.ok) {
    throw new Error(`Hetzner API returned ${res.status}: ${res.statusText}`);
  }
  const json = (await res.json()) as HetznerAuctionResponse;
  cache = { data: json.server, timestamp: Date.now() };
  return json.server;
}

// ---------- Hetzner helpers ----------

function hasGpu(server: HetznerAuctionServer): boolean {
  return server.specials.some((s) => s.toUpperCase() === "GPU");
}

function getGpuModel(server: HetznerAuctionServer): string | null {
  for (const desc of server.description) {
    const match = desc.match(/GPU\s*-\s*(.+)/i);
    if (match) return match[1].trim();
  }
  return null;
}

function getDatacenterRegion(dc: string): string {
  const match = dc.match(/^([A-Z]+)/i);
  return match ? match[1].toUpperCase() : dc;
}

function getCountry(dc: string): string {
  const region = getDatacenterRegion(dc);
  if (region === "FSN" || region === "NBG") return "DE";
  if (region === "HEL") return "FI";
  return "DE";
}

export function buildDisks(d: ServerDiskData): DiskInfo[] {
  const disks: DiskInfo[] = [];
  const addGroup = (
    sizes: number[],
    type: DiskInfo["type"],
  ) => {
    const groups = new Map<number, number>();
    for (const size of sizes) {
      groups.set(size, (groups.get(size) ?? 0) + 1);
    }
    for (const [size, count] of groups) {
      disks.push({ count, size_gb: size, type });
    }
  };
  addGroup(d.nvme, "nvme");
  addGroup(d.sata, "sata");
  addGroup(d.hdd, "hdd");
  addGroup(d.general, "unknown");
  return disks;
}

export function normalizeServer(
  server: HetznerAuctionServer,
  cores: number | null,
): ServerListing {
  const disks = buildDisks(server.serverDiskData);
  return {
    id: String(server.id),
    provider: "hetzner",
    url: `https://www.hetzner.com/sb?id=${server.id}`,
    name: server.cpu,
    cpu: server.cpu,
    cpu_count: server.cpu_count,
    cpu_cores: cores,
    cpu_vendor: getCpuVendor(server.cpu),
    ram_gb: server.ram_size,
    is_ecc: server.is_ecc,
    disks,
    disk_total_gb: disks.reduce((sum, d) => sum + d.size_gb * d.count, 0),
    disk_count: disks.reduce((sum, d) => sum + d.count, 0),
    bandwidth_mbps: server.bandwidth,
    datacenter: server.datacenter,
    datacenter_region: getDatacenterRegion(server.datacenter),
    country: getCountry(server.datacenter),
    price_monthly_eur: server.price,
    price_setup_eur: server.setup_price,
    price_hourly_eur: server.hourly_price,
    gpu: hasGpu(server),
    gpu_model: getGpuModel(server),
    is_highio: server.is_highio,
    fixed_price: server.fixed_price,
    next_reduce_timestamp: server.fixed_price
      ? null
      : server.next_reduce_timestamp,
    availability: null,
    specials: server.specials,
  };
}

// ---------- CPU core resolution ----------
// Hetzner doesn't include core counts in its API, so we resolve them
// via a static lookup table + GitHub CSV fallback.

export const KNOWN_CORES: Record<string, number> = {
  "AMD EPYC 7401P": 24,
  "AMD EPYC 7502": 32,
  "AMD EPYC 7502P": 32,
  "AMD Ryzen 5 3600": 6,
  "AMD Ryzen 7 1700X": 8,
  "AMD Ryzen 7 3700X": 8,
  "AMD Ryzen 7 7700": 8,
  "AMD Ryzen 7 PRO 1700X": 8,
  "AMD Ryzen 9 3900": 12,
  "AMD Ryzen 9 5950X": 16,
  "AMD Ryzen Threadripper 2950X": 16,
  "Intel Core i5-12500": 6,
  "Intel Core i7-6700": 4,
  "Intel Core i7-7700": 4,
  "Intel Core i7-8700": 6,
  "Intel Core i9-9900K": 8,
  "Intel Core i9-12900K": 16,
  "Intel Core i9-13900": 24,
  "Intel Xeon E3-1270V3": 4,
  "Intel Xeon E3-1271V3": 4,
  "Intel Xeon E3-1275v5": 4,
  "Intel Xeon E3-1275V6": 4,
  "Intel Xeon E5-1650V3": 6,
  "Intel XEON E-2176G": 6,
  "Intel XEON E-2276G": 6,
  "Intel Xeon W-2145": 8,
  "Intel Xeon W-2245": 8,
  "Intel Xeon W-2295": 18,
  "Intel Xeon Gold 5412U": 24,
};

export function normaliseCpuName(name: string): string {
  return name
    .replace(/[®™]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function extractModelToken(name: string): string | null {
  const cleaned = normaliseCpuName(name);
  const m = cleaned.match(
    /(?:i[3579]-\d{4,5}[a-z]*|e[35]-\d{4}\s*v?\d*|e-\d{4}[a-z]*|w-\d{4,5}[a-z]*|gold \d{4}[a-z]*|epyc \d{4}[a-z]*|ryzen \d+ (?:pro )?\d{4}[a-z]*|threadripper \d{4,5}[a-z]*)/,
  );
  return m ? m[0] : null;
}

export function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

const INTEL_CSV_URL =
  "https://raw.githubusercontent.com/felixsteinke/cpu-spec-dataset/main/dataset/intel-cpus.csv";
const AMD_CSV_URL =
  "https://raw.githubusercontent.com/felixsteinke/cpu-spec-dataset/main/dataset/amd-cpus.csv";
const CSV_CACHE_TTL_MS = 5 * 60 * 1000;

let csvCache: { map: Map<string, number>; timestamp: number } | null = null;

async function fetchCsvCoreMap(): Promise<Map<string, number>> {
  if (csvCache && Date.now() - csvCache.timestamp < CSV_CACHE_TTL_MS) {
    return csvCache.map;
  }

  const map = new Map<string, number>();

  try {
    const [intelRes, amdRes] = await Promise.all([
      fetch(INTEL_CSV_URL),
      fetch(AMD_CSV_URL),
    ]);

    for (const { res, nameCol, coreCol } of [
      { res: intelRes, nameCol: "CpuName", coreCol: "CoreCount" },
      { res: amdRes, nameCol: "Model", coreCol: "# of CPU Cores" },
    ]) {
      if (!res.ok) continue;
      const text = await res.text();
      const lines = text.split("\n");
      const header = parseCsvRow(lines[0]);
      const nameIdx = header.indexOf(nameCol);
      const coreIdx = header.indexOf(coreCol);
      if (nameIdx < 0 || coreIdx < 0) continue;
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const row = parseCsvRow(lines[i]);
        const cores = parseInt(row[coreIdx], 10);
        if (!isNaN(cores) && row[nameIdx]) {
          const token = extractModelToken(row[nameIdx]);
          if (token && !map.has(token)) map.set(token, cores);
        }
      }
    }
  } catch {
    // Network failure — return whatever we have.
  }

  csvCache = { map, timestamp: Date.now() };
  return map;
}

export async function resolveCpuCores(cpuName: string): Promise<number | null> {
  if (cpuName in KNOWN_CORES) return KNOWN_CORES[cpuName];

  const norm = normaliseCpuName(cpuName);
  for (const [key, cores] of Object.entries(KNOWN_CORES)) {
    if (normaliseCpuName(key) === norm) return cores;
  }

  const token = extractModelToken(cpuName);
  if (token) {
    const csvMap = await fetchCsvCoreMap();
    const csvCores = csvMap.get(token);
    if (csvCores !== undefined) return csvCores;
  }

  return null;
}

async function resolveCpuCoresBulk(
  cpuNames: string[],
): Promise<Map<string, number | null>> {
  const unique = [...new Set(cpuNames)];
  const result = new Map<string, number | null>();
  for (const name of unique) {
    result.set(name, await resolveCpuCores(name));
  }
  return result;
}

// ---------- Provider ----------

export const hetznerProvider: AuctionProvider = {
  name: "hetzner",
  displayName: "Hetzner",
  async fetchListings(): Promise<ServerListing[]> {
    const servers = await fetchRawAuctions();
    const coreMap = await resolveCpuCoresBulk(servers.map((s) => s.cpu));
    return servers.map((s) => {
      const perSocket = coreMap.get(s.cpu) ?? null;
      const cores = perSocket !== null ? perSocket * s.cpu_count : null;
      return normalizeServer(s, cores);
    });
  },
};
