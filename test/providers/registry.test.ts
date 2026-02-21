import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ServerListing } from "../../src/types.js";

function makeListing(overrides: Partial<ServerListing> = {}): ServerListing {
  return {
    id: "1",
    provider: "hetzner",
    url: "",
    name: "",
    cpu: "Intel Xeon E3-1270V3",
    cpu_count: 1,
    cpu_cores: 4,
    cpu_vendor: "intel",
    ram_gb: 32,
    is_ecc: true,
    disks: [{ count: 2, size_gb: 512, type: "nvme" }],
    disk_total_gb: 1024,
    disk_count: 2,
    bandwidth_mbps: 1000,
    datacenter: "FSN1-DC1",
    datacenter_region: "FSN",
    country: "DE",
    price_monthly_eur: 39.99,
    price_setup_eur: 0,
    price_hourly_eur: 0.06,
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

const hetznerListing = makeListing({ id: "h1", provider: "hetzner" });
const ovhListing = makeListing({
  id: "ovh-fqn-1",
  provider: "ovh",
  cpu: "AMD EPYC 7502P",
  cpu_vendor: "amd",
});

vi.mock("../../src/providers/hetzner.js", () => ({
  hetznerProvider: {
    name: "hetzner",
    displayName: "Hetzner",
    fetchListings: vi.fn(),
  },
}));

vi.mock("../../src/providers/ovh.js", () => ({
  ovhProvider: {
    name: "ovh",
    displayName: "OVH",
    fetchListings: vi.fn(),
  },
}));

// Import AFTER mocks are set up
const { getAllListings, getListingById } = await import(
  "../../src/providers/registry.js"
);
const { hetznerProvider } = await import("../../src/providers/hetzner.js");
const { ovhProvider } = await import("../../src/providers/ovh.js");

beforeEach(() => {
  vi.mocked(hetznerProvider.fetchListings).mockResolvedValue([hetznerListing]);
  vi.mocked(ovhProvider.fetchListings).mockResolvedValue([ovhListing]);
});

describe("getAllListings", () => {
  it("returns combined results from all providers", async () => {
    const listings = await getAllListings();
    expect(listings).toHaveLength(2);
    expect(listings.map((l) => l.id)).toContain("h1");
    expect(listings.map((l) => l.id)).toContain("ovh-fqn-1");
  });

  it("returns only hetzner when filtered", async () => {
    const listings = await getAllListings("hetzner");
    expect(listings).toHaveLength(1);
    expect(listings[0].id).toBe("h1");
  });

  it("returns only ovh when filtered", async () => {
    const listings = await getAllListings("ovh");
    expect(listings).toHaveLength(1);
    expect(listings[0].id).toBe("ovh-fqn-1");
  });

  it("still returns results when one provider throws", async () => {
    vi.mocked(hetznerProvider.fetchListings).mockRejectedValue(
      new Error("Network error"),
    );
    const listings = await getAllListings();
    expect(listings).toHaveLength(1);
    expect(listings[0].id).toBe("ovh-fqn-1");
  });

  it("treats 'all' the same as no filter", async () => {
    const listings = await getAllListings("all");
    expect(listings).toHaveLength(2);
  });
});

describe("getListingById", () => {
  it("finds listing by id", async () => {
    const listing = await getListingById("h1");
    expect(listing).toBeDefined();
    expect(listing!.id).toBe("h1");
  });

  it("returns undefined for non-existent id", async () => {
    const listing = await getListingById("nonexistent");
    expect(listing).toBeUndefined();
  });

  it("respects provider filter", async () => {
    const listing = await getListingById("h1", "ovh");
    expect(listing).toBeUndefined();
  });
});
