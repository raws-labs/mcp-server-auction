import { describe, it, expect } from "vitest";
import {
  normaliseCpuName,
  extractModelToken,
  parseCsvRow,
  buildDisks,
  normalizeServer,
  KNOWN_CORES,
  resolveCpuCores,
} from "../../src/providers/hetzner.js";
import type {
  ServerDiskData,
  HetznerAuctionServer,
} from "../../src/providers/hetzner.js";

describe("normaliseCpuName", () => {
  it("strips ® and ™ symbols", () => {
    expect(normaliseCpuName("Intel® Xeon™ E3-1270V3")).toBe(
      "intel xeon e3-1270v3",
    );
  });

  it("collapses whitespace", () => {
    expect(normaliseCpuName("Intel  Core   i7-6700")).toBe(
      "intel core i7-6700",
    );
  });

  it("lowercases", () => {
    expect(normaliseCpuName("AMD EPYC 7502P")).toBe("amd epyc 7502p");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normaliseCpuName("  Intel Xeon  ")).toBe("intel xeon");
  });
});

describe("extractModelToken", () => {
  it("extracts i7-6700 from Intel Core i7-6700", () => {
    expect(extractModelToken("Intel Core i7-6700")).toBe("i7-6700");
  });

  it("extracts epyc 7502p from AMD EPYC 7502P", () => {
    expect(extractModelToken("AMD EPYC 7502P")).toBe("epyc 7502p");
  });

  it("extracts gold 5412u from Intel Xeon Gold 5412U", () => {
    expect(extractModelToken("Intel Xeon Gold 5412U")).toBe("gold 5412u");
  });

  it("extracts e3-1270v3 from Intel Xeon E3-1270V3", () => {
    expect(extractModelToken("Intel Xeon E3-1270V3")).toBe("e3-1270v3");
  });

  it("extracts e-2176g from Intel XEON E-2176G", () => {
    expect(extractModelToken("Intel XEON E-2176G")).toBe("e-2176g");
  });

  it("extracts w-2245 from Intel Xeon W-2245", () => {
    expect(extractModelToken("Intel Xeon W-2245")).toBe("w-2245");
  });

  it("extracts ryzen 9 5950x", () => {
    expect(extractModelToken("AMD Ryzen 9 5950X")).toBe("ryzen 9 5950x");
  });

  it("extracts threadripper 2950x", () => {
    expect(extractModelToken("AMD Ryzen Threadripper 2950X")).toBe(
      "threadripper 2950x",
    );
  });

  it("returns null for unrecognized CPU name", () => {
    expect(extractModelToken("Some Random CPU")).toBeNull();
  });
});

describe("parseCsvRow", () => {
  it("parses simple comma-separated values", () => {
    expect(parseCsvRow("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("handles quoted fields containing commas", () => {
    expect(parseCsvRow('"a,b",c')).toEqual(["a,b", "c"]);
  });

  it("handles escaped quotes within quoted fields", () => {
    expect(parseCsvRow('"a""b"')).toEqual(['a"b']);
  });

  it("handles empty fields", () => {
    expect(parseCsvRow("a,,c")).toEqual(["a", "", "c"]);
  });

  it("handles single field", () => {
    expect(parseCsvRow("hello")).toEqual(["hello"]);
  });
});

describe("buildDisks", () => {
  it("groups identical NVMe disks", () => {
    const data: ServerDiskData = {
      nvme: [512, 512],
      sata: [],
      hdd: [],
      general: [],
    };
    const disks = buildDisks(data);
    expect(disks).toEqual([{ count: 2, size_gb: 512, type: "nvme" }]);
  });

  it("separates different NVMe sizes", () => {
    const data: ServerDiskData = {
      nvme: [512, 1024],
      sata: [],
      hdd: [],
      general: [],
    };
    const disks = buildDisks(data);
    expect(disks).toHaveLength(2);
    expect(disks).toContainEqual({ count: 1, size_gb: 512, type: "nvme" });
    expect(disks).toContainEqual({ count: 1, size_gb: 1024, type: "nvme" });
  });

  it("handles mixed disk types", () => {
    const data: ServerDiskData = {
      nvme: [512],
      sata: [],
      hdd: [2000, 2000],
      general: [],
    };
    const disks = buildDisks(data);
    expect(disks).toContainEqual({ count: 1, size_gb: 512, type: "nvme" });
    expect(disks).toContainEqual({ count: 2, size_gb: 2000, type: "hdd" });
  });

  it("returns empty array for no disks", () => {
    const data: ServerDiskData = {
      nvme: [],
      sata: [],
      hdd: [],
      general: [],
    };
    expect(buildDisks(data)).toEqual([]);
  });
});

describe("normalizeServer", () => {
  const mockServer: HetznerAuctionServer = {
    id: 12345,
    cpu: "Intel Xeon E3-1270V3",
    cpu_count: 1,
    ram_size: 32,
    ram: ["32GB DDR3"],
    is_ecc: true,
    price: 39.99,
    setup_price: 0,
    hourly_price: 0.06,
    hdd_arr: ["2x 512GB NVMe"],
    hdd_count: 2,
    hdd_size: 1024,
    serverDiskData: { nvme: [512, 512], sata: [], hdd: [], general: [] },
    datacenter: "FSN1-DC14",
    specials: [],
    description: [],
    information: [],
    is_highio: false,
    fixed_price: false,
    next_reduce: 3600,
    next_reduce_timestamp: 1700000000,
    bandwidth: 1000,
  };

  it("converts id to string", () => {
    const listing = normalizeServer(mockServer, 4);
    expect(listing.id).toBe("12345");
  });

  it("sets provider to hetzner", () => {
    const listing = normalizeServer(mockServer, 4);
    expect(listing.provider).toBe("hetzner");
  });

  it("maps datacenter to correct country", () => {
    const listing = normalizeServer(mockServer, 4);
    expect(listing.country).toBe("DE");
  });

  it("extracts datacenter region", () => {
    const listing = normalizeServer(mockServer, 4);
    expect(listing.datacenter_region).toBe("FSN");
  });

  it("builds disks correctly", () => {
    const listing = normalizeServer(mockServer, 4);
    expect(listing.disks).toEqual([
      { count: 2, size_gb: 512, type: "nvme" },
    ]);
    expect(listing.disk_total_gb).toBe(1024);
    expect(listing.disk_count).toBe(2);
  });

  it("passes through core count", () => {
    const listing = normalizeServer(mockServer, 4);
    expect(listing.cpu_cores).toBe(4);
  });

  it("handles null core count", () => {
    const listing = normalizeServer(mockServer, null);
    expect(listing.cpu_cores).toBeNull();
  });

  it("detects CPU vendor", () => {
    const listing = normalizeServer(mockServer, 4);
    expect(listing.cpu_vendor).toBe("intel");
  });

  it("maps HEL datacenter to FI", () => {
    const helServer = { ...mockServer, datacenter: "HEL1-DC1" };
    const listing = normalizeServer(helServer, 4);
    expect(listing.country).toBe("FI");
    expect(listing.datacenter_region).toBe("HEL");
  });

  it("detects GPU from specials", () => {
    const gpuServer = {
      ...mockServer,
      specials: ["GPU"],
      description: ["GPU - NVIDIA RTX 4000"],
    };
    const listing = normalizeServer(gpuServer, 4);
    expect(listing.gpu).toBe(true);
    expect(listing.gpu_model).toBe("NVIDIA RTX 4000");
  });
});

describe("KNOWN_CORES", () => {
  it("has entry for Intel Xeon E3-1270V3", () => {
    expect(KNOWN_CORES["Intel Xeon E3-1270V3"]).toBe(4);
  });

  it("has entry for AMD EPYC 7502P", () => {
    expect(KNOWN_CORES["AMD EPYC 7502P"]).toBe(32);
  });

  it("has entry for AMD Ryzen 9 5950X", () => {
    expect(KNOWN_CORES["AMD Ryzen 9 5950X"]).toBe(16);
  });
});

describe("resolveCpuCores", () => {
  it("resolves exact match from KNOWN_CORES", async () => {
    expect(await resolveCpuCores("Intel Xeon E3-1270V3")).toBe(4);
  });

  it("resolves case-insensitive match", async () => {
    expect(await resolveCpuCores("intel xeon e3-1270v3")).toBe(4);
  });

  it("returns null for completely unknown CPU (without CSV fetch)", async () => {
    // This will attempt CSV fetch but for a totally bogus name it won't find anything
    const result = await resolveCpuCores("Totally Unknown CPU 9999XYZ");
    expect(result).toBeNull();
  });
});
