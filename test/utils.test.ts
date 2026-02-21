import { describe, it, expect } from "vitest";
import {
  getCpuVendor,
  formatSize,
  getDiskType,
  formatDiskSummary,
  formatBandwidth,
  formatNextReduce,
} from "../src/utils.js";
import type { ServerListing } from "../src/types.js";

function makeListing(overrides: Partial<ServerListing> = {}): ServerListing {
  return {
    id: "1",
    provider: "hetzner",
    url: "",
    name: "",
    cpu: "",
    cpu_count: 1,
    cpu_cores: null,
    cpu_vendor: "intel",
    ram_gb: 32,
    is_ecc: false,
    disks: [],
    disk_total_gb: 0,
    disk_count: 0,
    bandwidth_mbps: 1000,
    datacenter: "FSN1-DC1",
    datacenter_region: "FSN",
    country: "DE",
    price_monthly_eur: 50,
    price_setup_eur: 0,
    price_hourly_eur: null,
    gpu: false,
    gpu_model: null,
    is_highio: false,
    fixed_price: false,
    next_reduce_timestamp: null,
    availability: null,
    specials: [],
    ...overrides,
  };
}

describe("getCpuVendor", () => {
  it("detects Intel from full CPU name", () => {
    expect(getCpuVendor("Intel Xeon E3-1270V3")).toBe("intel");
  });

  it("detects AMD from full CPU name", () => {
    expect(getCpuVendor("AMD EPYC 7502P")).toBe("amd");
  });

  it("returns unknown for unrecognized CPU", () => {
    expect(getCpuVendor("Unknown CPU")).toBe("unknown");
  });

  it("detects Intel from partial match (Xeon)", () => {
    expect(getCpuVendor("Xeon E5-1650")).toBe("intel");
  });

  it("detects Intel from partial match (Core i)", () => {
    expect(getCpuVendor("Core i7-6700")).toBe("intel");
  });

  it("detects AMD from partial match (Ryzen)", () => {
    expect(getCpuVendor("Ryzen 9 5950X")).toBe("amd");
  });

  it("detects AMD from partial match (EPYC)", () => {
    expect(getCpuVendor("EPYC 7502P")).toBe("amd");
  });
});

describe("formatSize", () => {
  it("formats GB values under 1000", () => {
    expect(formatSize(512)).toBe("512 GB");
  });

  it("formats exact TB values", () => {
    expect(formatSize(1000)).toBe("1 TB");
  });

  it("formats fractional TB values", () => {
    expect(formatSize(1500)).toBe("1.5 TB");
  });

  it("formats 2 TB", () => {
    expect(formatSize(2000)).toBe("2 TB");
  });
});

describe("getDiskType", () => {
  it("returns nvme for single nvme disk group", () => {
    const listing = makeListing({
      disks: [{ count: 2, size_gb: 512, type: "nvme" }],
    });
    expect(getDiskType(listing)).toBe("nvme");
  });

  it("returns mixed for nvme + hdd", () => {
    const listing = makeListing({
      disks: [
        { count: 1, size_gb: 512, type: "nvme" },
        { count: 2, size_gb: 2000, type: "hdd" },
      ],
    });
    expect(getDiskType(listing)).toBe("mixed");
  });

  it("returns none for empty disks", () => {
    const listing = makeListing({ disks: [] });
    expect(getDiskType(listing)).toBe("none");
  });

  it("returns hdd for only HDD disks", () => {
    const listing = makeListing({
      disks: [{ count: 2, size_gb: 2000, type: "hdd" }],
    });
    expect(getDiskType(listing)).toBe("hdd");
  });

  it("returns sata for only SATA SSD disks", () => {
    const listing = makeListing({
      disks: [{ count: 2, size_gb: 480, type: "sata" }],
    });
    expect(getDiskType(listing)).toBe("sata");
  });
});

describe("formatDiskSummary", () => {
  it("formats multi-type disk listing", () => {
    const listing = makeListing({
      disks: [
        { count: 2, size_gb: 512, type: "nvme" },
        { count: 1, size_gb: 2000, type: "hdd" },
      ],
    });
    expect(formatDiskSummary(listing)).toBe("2x 512 GB NVMe + 1x 2 TB HDD");
  });

  it("returns No disks for empty array", () => {
    const listing = makeListing({ disks: [] });
    expect(formatDiskSummary(listing)).toBe("No disks");
  });

  it("formats SATA SSD label", () => {
    const listing = makeListing({
      disks: [{ count: 4, size_gb: 960, type: "sata" }],
    });
    expect(formatDiskSummary(listing)).toBe("4x 960 GB SATA SSD");
  });
});

describe("formatBandwidth", () => {
  it("formats sub-Gbit as Mbit", () => {
    expect(formatBandwidth(500)).toBe("500 Mbit");
  });

  it("formats 1000 Mbit as 1 Gbit", () => {
    expect(formatBandwidth(1000)).toBe("1 Gbit");
  });

  it("formats 10000 Mbit as 10 Gbit", () => {
    expect(formatBandwidth(10000)).toBe("10 Gbit");
  });
});

describe("formatNextReduce", () => {
  it("returns Fixed price for fixed_price listings", () => {
    const listing = makeListing({ fixed_price: true });
    expect(formatNextReduce(listing)).toBe("Fixed price");
  });

  it("returns Fixed price when next_reduce_timestamp is null", () => {
    const listing = makeListing({
      fixed_price: false,
      next_reduce_timestamp: null,
    });
    expect(formatNextReduce(listing)).toBe("Fixed price");
  });

  it("returns Reduction imminent for past timestamps", () => {
    const listing = makeListing({
      fixed_price: false,
      next_reduce_timestamp: Math.floor(Date.now() / 1000) - 100,
    });
    expect(formatNextReduce(listing)).toBe("Reduction imminent");
  });
});
