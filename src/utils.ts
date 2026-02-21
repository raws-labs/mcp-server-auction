import type { ServerListing } from "./types.js";

export function getCpuVendor(cpu: string): "intel" | "amd" | "unknown" {
  const lower = cpu.toLowerCase();
  if (lower.includes("intel") || lower.includes("xeon") || lower.includes("core i")) return "intel";
  if (lower.includes("amd") || lower.includes("ryzen") || lower.includes("epyc")) return "amd";
  return "unknown";
}

export function formatSize(gb: number): string {
  if (gb >= 1000) return `${(gb / 1000).toFixed(gb % 1000 === 0 ? 0 : 1)} TB`;
  return `${gb} GB`;
}

export function formatDiskSummary(listing: ServerListing): string {
  if (listing.disks.length === 0) return "No disks";
  const parts = listing.disks.map((d) => {
    const typeLabel =
      d.type === "nvme" ? "NVMe"
      : d.type === "sata" ? "SATA SSD"
      : d.type === "hdd" ? "HDD"
      : "Disk";
    return `${d.count}x ${formatSize(d.size_gb)} ${typeLabel}`;
  });
  return parts.join(" + ");
}

export function getDiskType(
  listing: ServerListing,
): "nvme" | "sata" | "hdd" | "mixed" | "none" {
  const types = new Set(
    listing.disks.map((d) => d.type).filter((t) => t !== "unknown"),
  );
  if (types.size === 0) return "none";
  if (types.size > 1) return "mixed";
  return types.values().next().value as "nvme" | "sata" | "hdd";
}

export function formatBandwidth(mbps: number): string {
  if (mbps >= 1000) return `${mbps / 1000} Gbit`;
  return `${mbps} Mbit`;
}

export function formatNextReduce(listing: ServerListing): string {
  if (listing.fixed_price || listing.next_reduce_timestamp === null)
    return "Fixed price";
  const remaining = listing.next_reduce_timestamp * 1000 - Date.now();
  if (remaining <= 0) return "Reduction imminent";
  const hours = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  if (hours > 0) return `Next reduction in ${hours}h ${mins}m`;
  return `Next reduction in ${mins}m`;
}
