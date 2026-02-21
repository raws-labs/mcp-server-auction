import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerListing } from "./types.js";
import {
  getCpuVendor,
  getDiskType,
  formatDiskSummary,
  formatBandwidth,
  formatNextReduce,
} from "./utils.js";
import { getAllListings, getListingById } from "./providers/registry.js";

const providerEnum = z
  .enum(["hetzner", "ovh", "all"])
  .optional()
  .describe("Provider filter: hetzner, ovh, or all (default: all)");

export function registerTools(server: McpServer): void {
  server.tool(
    "search_auctions",
    "Search and filter dedicated server auction listings by price, RAM, disk, CPU, datacenter, GPU, bandwidth, and more",
    {
      provider: providerEnum,
      max_price: z.number().optional().describe("Maximum monthly price in EUR"),
      min_ram: z.number().optional().describe("Minimum RAM in GB"),
      min_disk_size: z
        .number()
        .optional()
        .describe("Minimum total disk capacity in GB"),
      min_disk_count: z
        .number()
        .optional()
        .describe("Minimum number of disks"),
      disk_type: z
        .enum(["ssd", "nvme", "hdd", "any"])
        .optional()
        .describe("Filter by disk type (ssd matches both SATA SSD and NVMe)"),
      cpu_vendor: z
        .enum(["intel", "amd", "any"])
        .optional()
        .describe("CPU vendor filter"),
      cpu_search: z
        .string()
        .optional()
        .describe(
          "Free-text search within CPU model name (e.g. 'EPYC 7502', 'Xeon E5', 'Ryzen 9')",
        ),
      min_cpu_count: z
        .number()
        .optional()
        .describe("Minimum CPU/socket count"),
      min_cores: z
        .number()
        .optional()
        .describe(
          "Minimum total CPU cores (resolved from model name, accounts for multi-socket)",
        ),
      ecc: z.boolean().optional().describe("Require ECC RAM"),
      datacenter: z
        .string()
        .optional()
        .describe(
          "Datacenter filter (e.g. FSN, NBG, HEL, FRA, GRA, or FSN1-DC1)",
        ),
      gpu: z.boolean().optional().describe("Require GPU"),
      min_bandwidth: z
        .number()
        .optional()
        .describe("Minimum bandwidth in Mbit (e.g. 1000 = 1 Gbit)"),
      fixed_price: z
        .boolean()
        .optional()
        .describe(
          "Filter by pricing type: true = fixed price only, false = auction only",
        ),
      max_setup_price: z
        .number()
        .optional()
        .describe("Maximum setup price in EUR (use 0 for no setup fee)"),
      highio: z
        .boolean()
        .optional()
        .describe("Require high I/O hardware"),
      sort_by: z
        .enum(["price", "ram", "disk_size", "cpu", "cores"])
        .optional()
        .describe("Sort field (default: price)"),
      limit: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .describe("Max results (default: 10)"),
    },
    async (params) => {
      const listings = await getAllListings(params.provider);

      let filtered = listings.filter((s) => {
        if (
          params.max_price !== undefined &&
          s.price_monthly_eur > params.max_price
        )
          return false;
        if (params.min_ram !== undefined && s.ram_gb < params.min_ram)
          return false;
        if (
          params.min_disk_size !== undefined &&
          s.disk_total_gb < params.min_disk_size
        )
          return false;
        if (
          params.min_disk_count !== undefined &&
          s.disk_count < params.min_disk_count
        )
          return false;
        if (params.disk_type !== undefined && params.disk_type !== "any") {
          const dt = getDiskType(s);
          if (params.disk_type === "ssd") {
            if (dt !== "nvme" && dt !== "sata") return false;
          } else if (params.disk_type === "nvme") {
            if (dt !== "nvme") return false;
          } else if (params.disk_type === "hdd") {
            if (dt !== "hdd") return false;
          }
        }
        if (
          params.cpu_vendor !== undefined &&
          params.cpu_vendor !== "any"
        ) {
          if (s.cpu_vendor !== params.cpu_vendor) return false;
        }
        if (params.cpu_search !== undefined) {
          if (
            !s.cpu.toLowerCase().includes(params.cpu_search.toLowerCase())
          )
            return false;
        }
        if (
          params.min_cpu_count !== undefined &&
          s.cpu_count < params.min_cpu_count
        )
          return false;
        if (params.min_cores !== undefined) {
          if (s.cpu_cores === null || s.cpu_cores < params.min_cores)
            return false;
        }
        if (params.ecc === true && !s.is_ecc) return false;
        if (params.datacenter !== undefined) {
          const dcUpper = params.datacenter.toUpperCase();
          // Support comma-separated datacenter lists (e.g. OVH multi-DC)
          const dcs = s.datacenter
            .toUpperCase()
            .split(",")
            .map((d) => d.trim());
          if (!dcs.some((d) => d.startsWith(dcUpper))) return false;
        }
        if (params.gpu === true && !s.gpu) return false;
        if (
          params.min_bandwidth !== undefined &&
          s.bandwidth_mbps < params.min_bandwidth
        )
          return false;
        if (
          params.fixed_price !== undefined &&
          s.fixed_price !== params.fixed_price
        )
          return false;
        if (
          params.max_setup_price !== undefined &&
          s.price_setup_eur > params.max_setup_price
        )
          return false;
        if (params.highio === true && !s.is_highio) return false;
        return true;
      });

      const sortBy = params.sort_by ?? "price";
      filtered.sort((a, b) => {
        switch (sortBy) {
          case "price":
            return a.price_monthly_eur - b.price_monthly_eur;
          case "ram":
            return b.ram_gb - a.ram_gb;
          case "disk_size":
            return b.disk_total_gb - a.disk_total_gb;
          case "cpu":
            return b.cpu_count - a.cpu_count;
          case "cores":
            return (b.cpu_cores ?? 0) - (a.cpu_cores ?? 0);
          default:
            return a.price_monthly_eur - b.price_monthly_eur;
        }
      });

      const limit = params.limit ?? 10;
      const results = filtered.slice(0, limit);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No servers found matching your criteria.",
            },
          ],
        };
      }

      const lines = [
        `Found ${filtered.length} servers matching your criteria (showing top ${results.length}):\n`,
      ];
      for (let i = 0; i < results.length; i++) {
        lines.push(formatServerLine(results[i], i + 1));
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  server.tool(
    "get_auction_stats",
    "Get aggregate statistics about current server auction listings",
    {
      provider: providerEnum,
    },
    async (params) => {
      const listings = await getAllListings(params.provider);
      const prices = listings
        .map((s) => s.price_monthly_eur)
        .sort((a, b) => a - b);
      if (prices.length === 0) {
        return {
          content: [{ type: "text", text: "No listings available." }],
        };
      }
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      const median =
        prices.length % 2 === 0
          ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
          : prices[Math.floor(prices.length / 2)];

      // Provider breakdown
      const providerCounts = new Map<string, number>();
      for (const s of listings) {
        providerCounts.set(
          s.provider,
          (providerCounts.get(s.provider) ?? 0) + 1,
        );
      }
      const providerLines = [...providerCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([p, n]) => `  ${p.charAt(0).toUpperCase() + p.slice(1)}: ${n} servers`);

      // CPU vendor breakdown
      const intelListings = listings.filter((s) => s.cpu_vendor === "intel");
      const amdListings = listings.filter((s) => s.cpu_vendor === "amd");
      const intelAvg =
        intelListings.length > 0
          ? intelListings.reduce((a, s) => a + s.price_monthly_eur, 0) /
            intelListings.length
          : 0;
      const amdAvg =
        amdListings.length > 0
          ? amdListings.reduce((a, s) => a + s.price_monthly_eur, 0) /
            amdListings.length
          : 0;

      // Datacenter/region breakdown
      const dcMap = new Map<string, number>();
      for (const s of listings) {
        const regions = s.datacenter
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean);
        for (const region of regions) {
          const key = `${s.provider.charAt(0).toUpperCase() + s.provider.slice(1)} ${region}`;
          dcMap.set(key, (dcMap.get(key) ?? 0) + 1);
        }
      }
      const dcLines = [...dcMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([dc, n]) => `  ${dc}: ${n} servers`);

      // RAM tier distribution
      const ramTiers = new Map<string, number>();
      for (const s of listings) {
        const tier =
          s.ram_gb >= 256 ? "256+ GB"
          : s.ram_gb >= 128 ? "128-255 GB"
          : s.ram_gb >= 64 ? "64-127 GB"
          : s.ram_gb >= 32 ? "32-63 GB"
          : "<32 GB";
        ramTiers.set(tier, (ramTiers.get(tier) ?? 0) + 1);
      }
      const ramOrder = [
        "<32 GB",
        "32-63 GB",
        "64-127 GB",
        "128-255 GB",
        "256+ GB",
      ];
      const ramLines = ramOrder
        .filter((t) => ramTiers.has(t))
        .map((t) => `  ${t}: ${ramTiers.get(t)} servers`);

      const gpuCount = listings.filter((s) => s.gpu).length;
      const eccCount = listings.filter((s) => s.is_ecc).length;

      const text = [
        `Server Auction — Live Statistics`,
        `=================================`,
        ``,
        `Total listings: ${listings.length}`,
        ``,
        `Provider:`,
        ...providerLines,
        ``,
        `Price (EUR/month):`,
        `  Min: \u20AC${prices[0].toFixed(2)}  Max: \u20AC${prices[prices.length - 1].toFixed(2)}  Avg: \u20AC${avg.toFixed(2)}  Median: \u20AC${median.toFixed(2)}`,
        ``,
        `CPU Vendor:`,
        `  Intel: ${intelListings.length} servers (avg \u20AC${intelAvg.toFixed(2)}/mo)`,
        `  AMD: ${amdListings.length} servers (avg \u20AC${amdAvg.toFixed(2)}/mo)`,
        ``,
        `Datacenter Region:`,
        ...dcLines,
        ``,
        `RAM Tiers:`,
        ...ramLines,
        ``,
        `GPU servers: ${gpuCount}`,
        `ECC servers: ${eccCount}`,
      ];

      return { content: [{ type: "text", text: text.join("\n") }] };
    },
  );

  server.tool(
    "get_auction_server",
    "Get full details of a specific auction server by its ID",
    {
      server_id: z.string().describe("The server ID (numeric for Hetzner, FQN for OVH)"),
      provider: providerEnum,
    },
    async (params) => {
      const listing = await getListingById(params.server_id, params.provider);
      if (!listing) {
        return {
          content: [
            {
              type: "text",
              text: `Server "${params.server_id}" not found in current listings.`,
            },
          ],
        };
      }

      const providerTag = listing.provider.toUpperCase();
      const coreStr =
        listing.cpu_cores !== null ? `, ${listing.cpu_cores} cores` : "";
      const hourlyStr =
        listing.price_hourly_eur !== null
          ? ` (\u20AC${listing.price_hourly_eur.toFixed(4)}/hr)`
          : "";
      const setupStr =
        listing.price_setup_eur > 0
          ? ` + \u20AC${listing.price_setup_eur.toFixed(2)} setup`
          : "";

      const lines = [
        `[${providerTag}] ${listing.id} — Full Details`,
        `${"=".repeat(50)}`,
        ``,
        `CPU: ${listing.cpu} (${listing.cpu_count} socket${listing.cpu_count > 1 ? "s" : ""}${coreStr})`,
        `RAM: ${listing.ram_gb} GB${listing.is_ecc ? " (ECC)" : ""}`,
        `Disks: ${formatDiskSummary(listing)}`,
        `  Total: ${listing.disk_total_gb} GB across ${listing.disk_count} drive${listing.disk_count > 1 ? "s" : ""}`,
        `Datacenter: ${listing.datacenter} (${listing.country})`,
        `Bandwidth: ${formatBandwidth(listing.bandwidth_mbps)}`,
        ...(listing.gpu
          ? [`GPU: ${listing.gpu_model ?? "Yes"}`]
          : []),
        ``,
        `Price: \u20AC${listing.price_monthly_eur.toFixed(2)}/mo${hourlyStr}${setupStr}`,
        `Type: ${formatNextReduce(listing)}`,
        ...(listing.is_highio ? [`High I/O: Yes`] : []),
        ...(listing.availability
          ? [`Availability: ${listing.availability}`]
          : []),
        ...(listing.specials.length > 0
          ? [`Specials: ${listing.specials.join(", ")}`]
          : []),
        ``,
        `View: ${listing.url}`,
      ];

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );
}

function formatServerLine(s: ServerListing, index: number): string {
  const providerTag = `[${s.provider.toUpperCase()}]`;
  const coreStr = s.cpu_cores !== null ? ` (${s.cpu_cores} cores)` : "";
  const ecc = s.is_ecc ? " (ECC)" : "";
  const gpu = s.gpu ? ` | GPU: ${s.gpu_model ?? "Yes"}` : "";
  const disk = formatDiskSummary(s);
  const priceInfo = formatNextReduce(s);
  const hourly =
    s.price_hourly_eur !== null
      ? ` (\u20AC${s.price_hourly_eur.toFixed(4)}/hr)`
      : "";
  return [
    `${index}. ${providerTag} ${s.id} — ${s.cpu}${coreStr} | ${s.ram_gb} GB RAM${ecc} | ${disk} | ${s.datacenter}`,
    `   \u20AC${s.price_monthly_eur.toFixed(2)}/mo${hourly} | ${priceInfo}${gpu}`,
    `   ${s.url}`,
    ``,
  ].join("\n");
}
