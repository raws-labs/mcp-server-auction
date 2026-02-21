import { describe, it, expect } from "vitest";
import {
  parseMemoryCode,
  parseStorageCode,
  extractMonthlyPrice,
  extractSetupPrice,
  dcToCountry,
  dcToRegion,
  buildListing,
} from "../../src/providers/ovh.js";
import type {
  OvhPlan,
  OvhAvailabilityEntry,
  OvhCpuBlob,
} from "../../src/providers/ovh.js";

describe("parseMemoryCode", () => {
  it("parses ECC memory code", () => {
    expect(parseMemoryCode("ram-32g-ecc-3200")).toEqual({
      size_gb: 32,
      is_ecc: true,
    });
  });

  it("parses non-ECC memory code", () => {
    expect(parseMemoryCode("ram-64g-noecc-2400")).toEqual({
      size_gb: 64,
      is_ecc: false,
    });
  });

  it("returns null for invalid code", () => {
    expect(parseMemoryCode("invalid")).toBeNull();
  });

  it("parses large memory size", () => {
    expect(parseMemoryCode("ram-128g-ecc-2666")).toEqual({
      size_gb: 128,
      is_ecc: true,
    });
  });
});

describe("parseStorageCode", () => {
  it("parses NVMe storage code", () => {
    expect(parseStorageCode("softraid-2x512nvme")).toEqual([
      { count: 2, size_gb: 512, type: "nvme" },
    ]);
  });

  it("parses SA (HDD) storage code", () => {
    expect(parseStorageCode("softraid-2x2000sa")).toEqual([
      { count: 2, size_gb: 2000, type: "hdd" },
    ]);
  });

  it("parses SATA SSD storage code", () => {
    expect(parseStorageCode("softraid-4x960ssd")).toEqual([
      { count: 4, size_gb: 960, type: "sata" },
    ]);
  });

  it("returns empty array for invalid code", () => {
    expect(parseStorageCode("invalid")).toEqual([]);
  });

  it("parses raid-prefixed codes", () => {
    expect(parseStorageCode("raid1-2x512nvme")).toEqual([
      { count: 2, size_gb: 512, type: "nvme" },
    ]);
  });
});

describe("extractMonthlyPrice", () => {
  it("extracts renew price in OVH cent format", () => {
    const plan: OvhPlan = {
      planCode: "test",
      product: "test",
      pricings: [
        {
          price: 4999000000,
          capacities: ["renew"],
          interval: 1,
        },
      ],
    };
    expect(extractMonthlyPrice(plan)).toBeCloseTo(49.99, 2);
  });

  it("returns 0 when no renew pricing exists", () => {
    const plan: OvhPlan = {
      planCode: "test",
      product: "test",
      pricings: [
        {
          price: 5000000000,
          capacities: ["installation"],
        },
      ],
    };
    expect(extractMonthlyPrice(plan)).toBe(0);
  });

  it("handles interval-less pricing with renew capacity", () => {
    const plan: OvhPlan = {
      planCode: "test",
      product: "test",
      pricings: [
        {
          price: 3999000000,
          capacities: ["renew"],
        },
      ],
    };
    expect(extractMonthlyPrice(plan)).toBeCloseTo(39.99, 2);
  });
});

describe("extractSetupPrice", () => {
  it("extracts installation price", () => {
    const plan: OvhPlan = {
      planCode: "test",
      product: "test",
      pricings: [
        {
          price: 9900000000,
          capacities: ["installation"],
        },
      ],
    };
    expect(extractSetupPrice(plan)).toBeCloseTo(99.0, 2);
  });

  it("returns 0 when no installation pricing exists", () => {
    const plan: OvhPlan = {
      planCode: "test",
      product: "test",
      pricings: [
        {
          price: 5000000000,
          capacities: ["renew"],
          interval: 1,
        },
      ],
    };
    expect(extractSetupPrice(plan)).toBe(0);
  });
});

describe("dcToCountry", () => {
  it("maps fra to DE", () => {
    expect(dcToCountry("fra1")).toBe("DE");
  });

  it("maps gra to FR", () => {
    expect(dcToCountry("gra2")).toBe("FR");
  });

  it("maps lon to GB", () => {
    expect(dcToCountry("lon1")).toBe("GB");
  });

  it("maps waw to PL", () => {
    expect(dcToCountry("waw1")).toBe("PL");
  });

  it("maps bhs to CA", () => {
    expect(dcToCountry("bhs1")).toBe("CA");
  });

  it("defaults unknown to FR", () => {
    expect(dcToCountry("xyz1")).toBe("FR");
  });

  it("handles uppercase input", () => {
    expect(dcToCountry("FRA1")).toBe("DE");
  });
});

describe("dcToRegion", () => {
  it("converts fra1 to FRA", () => {
    expect(dcToRegion("fra1")).toBe("FRA");
  });

  it("converts gra2 to GRA", () => {
    expect(dcToRegion("gra2")).toBe("GRA");
  });

  it("converts lon1 to LON", () => {
    expect(dcToRegion("lon1")).toBe("LON");
  });

  it("handles no trailing number", () => {
    expect(dcToRegion("fra")).toBe("FRA");
  });
});

describe("buildListing", () => {
  const mockEntry: OvhAvailabilityEntry = {
    fqn: "24ska01.ram-32g-ecc-3200.softraid-2x512nvme",
    planCode: "24ska01",
    memory: "ram-32g-ecc-3200",
    storage: "softraid-2x512nvme",
    datacenters: [
      { datacenter: "fra1", availability: "available" },
      { datacenter: "gra2", availability: "1H" },
    ],
  };

  const mockCpu: OvhCpuBlob = {
    brand: "Intel",
    model: "Xeon E-2386G",
    cores: 6,
  };

  const pricing = { monthly: 49.99, setup: 0 };
  const planName = "KS-A Server";

  it("creates listing with correct id", () => {
    const listing = buildListing(
      mockEntry,
      mockCpu,
      pricing,
      planName,
      mockEntry.datacenters,
    );
    expect(listing.id).toBe(mockEntry.fqn);
  });

  it("sets provider to ovh", () => {
    const listing = buildListing(
      mockEntry,
      mockCpu,
      pricing,
      planName,
      mockEntry.datacenters,
    );
    expect(listing.provider).toBe("ovh");
  });

  it("parses memory from entry", () => {
    const listing = buildListing(
      mockEntry,
      mockCpu,
      pricing,
      planName,
      mockEntry.datacenters,
    );
    expect(listing.ram_gb).toBe(32);
    expect(listing.is_ecc).toBe(true);
  });

  it("parses disks from entry", () => {
    const listing = buildListing(
      mockEntry,
      mockCpu,
      pricing,
      planName,
      mockEntry.datacenters,
    );
    expect(listing.disks).toEqual([
      { count: 2, size_gb: 512, type: "nvme" },
    ]);
    expect(listing.disk_total_gb).toBe(1024);
  });

  it("builds CPU name from brand + model", () => {
    const listing = buildListing(
      mockEntry,
      mockCpu,
      pricing,
      planName,
      mockEntry.datacenters,
    );
    expect(listing.cpu).toBe("Intel Xeon E-2386G");
  });

  it("uses plan name when no CPU info available", () => {
    const listing = buildListing(
      mockEntry,
      null,
      pricing,
      planName,
      mockEntry.datacenters,
    );
    expect(listing.cpu).toBe("KS-A Server");
  });

  it("aggregates datacenter regions", () => {
    const listing = buildListing(
      mockEntry,
      mockCpu,
      pricing,
      planName,
      mockEntry.datacenters,
    );
    expect(listing.datacenter).toBe("FRA, GRA");
  });

  it("sets fixed_price to true", () => {
    const listing = buildListing(
      mockEntry,
      mockCpu,
      pricing,
      planName,
      mockEntry.datacenters,
    );
    expect(listing.fixed_price).toBe(true);
  });

  it("detects GPU when present", () => {
    const gpuEntry = { ...mockEntry, gpu: "NVIDIA T1000" };
    const listing = buildListing(
      gpuEntry,
      mockCpu,
      pricing,
      planName,
      gpuEntry.datacenters,
    );
    expect(listing.gpu).toBe(true);
    expect(listing.gpu_model).toBe("NVIDIA T1000");
  });

  it("picks best availability", () => {
    const listing = buildListing(
      mockEntry,
      mockCpu,
      pricing,
      planName,
      mockEntry.datacenters,
    );
    expect(listing.availability).toBe("available");
  });
});
