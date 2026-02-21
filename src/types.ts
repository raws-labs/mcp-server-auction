export interface DiskInfo {
  count: number;
  size_gb: number;
  type: "nvme" | "sata" | "hdd" | "unknown";
}

export interface ServerListing {
  // Identity
  id: string;
  provider: string;
  url: string;
  name: string;
  // CPU
  cpu: string;
  cpu_count: number;
  cpu_cores: number | null;
  cpu_vendor: "intel" | "amd" | "unknown";
  // Memory
  ram_gb: number;
  is_ecc: boolean;
  // Storage
  disks: DiskInfo[];
  disk_total_gb: number;
  disk_count: number;
  // Network
  bandwidth_mbps: number;
  // Location
  datacenter: string;
  datacenter_region: string;
  country: string;
  // Pricing
  price_monthly_eur: number;
  price_setup_eur: number;
  price_hourly_eur: number | null;
  // Flags
  gpu: boolean;
  gpu_model: string | null;
  is_highio: boolean;
  // Provider-specific (with defaults)
  fixed_price: boolean;
  next_reduce_timestamp: number | null;
  availability: string | null;
  specials: string[];
}

export interface AuctionProvider {
  name: string;
  displayName: string;
  fetchListings(): Promise<ServerListing[]>;
}
