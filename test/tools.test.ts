import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ServerListing } from "../src/types.js";

// --- Mock listings ---

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

const listings: ServerListing[] = [
  makeListing({
    id: "1",
    cpu: "Intel Xeon E3-1270V3",
    cpu_vendor: "intel",
    cpu_cores: 4,
    ram_gb: 32,
    is_ecc: true,
    disks: [{ count: 2, size_gb: 512, type: "nvme" }],
    disk_total_gb: 1024,
    disk_count: 2,
    bandwidth_mbps: 1000,
    datacenter: "FSN1-DC1",
    price_monthly_eur: 39.99,
    price_setup_eur: 0,
    gpu: false,
    is_highio: false,
    fixed_price: false,
  }),
  makeListing({
    id: "2",
    cpu: "AMD EPYC 7502P",
    cpu_vendor: "amd",
    cpu_cores: 32,
    ram_gb: 128,
    is_ecc: true,
    disks: [{ count: 2, size_gb: 2000, type: "hdd" }],
    disk_total_gb: 4000,
    disk_count: 2,
    bandwidth_mbps: 1000,
    datacenter: "HEL1-DC1",
    price_monthly_eur: 89.99,
    price_setup_eur: 50,
    gpu: false,
    is_highio: true,
    fixed_price: true,
  }),
  makeListing({
    id: "3",
    provider: "ovh",
    cpu: "Intel Xeon Gold 5412U",
    cpu_vendor: "intel",
    cpu_cores: 24,
    ram_gb: 64,
    is_ecc: false,
    disks: [{ count: 2, size_gb: 960, type: "sata" }],
    disk_total_gb: 1920,
    disk_count: 2,
    bandwidth_mbps: 500,
    datacenter: "FRA, GRA",
    price_monthly_eur: 59.99,
    price_setup_eur: 0,
    gpu: false,
    is_highio: false,
    fixed_price: true,
  }),
  makeListing({
    id: "4",
    cpu: "AMD Ryzen 9 5950X",
    cpu_vendor: "amd",
    cpu_cores: 16,
    ram_gb: 64,
    is_ecc: false,
    disks: [
      { count: 1, size_gb: 512, type: "nvme" },
      { count: 2, size_gb: 2000, type: "hdd" },
    ],
    disk_total_gb: 4512,
    disk_count: 3,
    bandwidth_mbps: 1000,
    datacenter: "NBG1-DC1",
    price_monthly_eur: 49.99,
    price_setup_eur: 10,
    gpu: true,
    gpu_model: "NVIDIA RTX 4000",
    is_highio: false,
    fixed_price: false,
  }),
  makeListing({
    id: "5",
    cpu: "Intel Core i7-6700",
    cpu_vendor: "intel",
    cpu_cores: 4,
    ram_gb: 16,
    is_ecc: false,
    disks: [{ count: 1, size_gb: 256, type: "nvme" }],
    disk_total_gb: 256,
    disk_count: 1,
    bandwidth_mbps: 1000,
    datacenter: "FSN1-DC1",
    price_monthly_eur: 24.99,
    price_setup_eur: 0,
    gpu: false,
    is_highio: false,
    fixed_price: false,
  }),
];

// --- Mock the registry so tools don't make real API calls ---

vi.mock("../src/providers/registry.js", () => ({
  getAllListings: vi.fn(),
  getListingById: vi.fn(),
}));

const { getAllListings, getListingById } = await import(
  "../src/providers/registry.js"
);

// --- Import the filter/sort logic by registering tools on a mock McpServer ---
// Instead of importing internal filter logic, we test through the tool handler.

import { registerTools } from "../src/tools.js";

// Capture tool handlers by providing a mock McpServer
const toolHandlers = new Map<string, (params: Record<string, unknown>) => Promise<unknown>>();

const mockServer = {
  tool(
    name: string,
    _description: string,
    _schema: unknown,
    handler: (params: Record<string, unknown>) => Promise<unknown>,
  ) {
    toolHandlers.set(name, handler);
  },
} as Parameters<typeof registerTools>[0];

registerTools(mockServer);

const searchAuctions = toolHandlers.get("search_auctions")!;

beforeEach(() => {
  vi.mocked(getAllListings).mockResolvedValue([...listings]);
  vi.mocked(getListingById).mockImplementation(async (id: string) =>
    listings.find((l) => l.id === id),
  );
});

// --- Tests ---

describe("search_auctions filters", () => {
  it("filters by max_price", async () => {
    const result = (await searchAuctions({ max_price: 40 })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("24.99");
    expect(result.content[0].text).toContain("39.99");
    expect(result.content[0].text).not.toContain("89.99");
  });

  it("filters by min_ram", async () => {
    const result = (await searchAuctions({ min_ram: 64 })) as {
      content: Array<{ text: string }>;
    };
    // Should include listings with 64 and 128 GB RAM
    expect(result.content[0].text).toContain("128 GB RAM");
    expect(result.content[0].text).toContain("64 GB RAM");
    expect(result.content[0].text).not.toContain("16 GB RAM");
    expect(result.content[0].text).not.toContain("32 GB RAM");
  });

  it("filters by min_disk_size", async () => {
    const result = (await searchAuctions({ min_disk_size: 2000 })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).not.toContain("i7-6700");
  });

  it("filters by disk_type ssd (matches nvme and sata)", async () => {
    const result = (await searchAuctions({ disk_type: "ssd" })) as {
      content: Array<{ text: string }>;
    };
    // Should include NVMe and SATA, but not pure HDD
    expect(result.content[0].text).toContain("E3-1270V3");
    expect(result.content[0].text).toContain("Gold 5412U");
    expect(result.content[0].text).toContain("i7-6700");
    expect(result.content[0].text).not.toContain("EPYC 7502P");
  });

  it("filters by disk_type nvme", async () => {
    const result = (await searchAuctions({ disk_type: "nvme" })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("E3-1270V3");
    expect(result.content[0].text).toContain("i7-6700");
    expect(result.content[0].text).not.toContain("Gold 5412U"); // sata
    expect(result.content[0].text).not.toContain("EPYC 7502P"); // hdd
  });

  it("filters by cpu_vendor intel", async () => {
    const result = (await searchAuctions({ cpu_vendor: "intel" })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("E3-1270V3");
    expect(result.content[0].text).not.toContain("EPYC");
    expect(result.content[0].text).not.toContain("Ryzen");
  });

  it("filters by cpu_vendor amd", async () => {
    const result = (await searchAuctions({ cpu_vendor: "amd" })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("EPYC");
    expect(result.content[0].text).not.toContain("E3-1270V3");
  });

  it("filters by cpu_search", async () => {
    const result = (await searchAuctions({ cpu_search: "EPYC" })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("EPYC 7502P");
    expect(result.content[0].text).not.toContain("E3-1270V3");
  });

  it("cpu_search is case insensitive", async () => {
    const result = (await searchAuctions({ cpu_search: "epyc" })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("EPYC 7502P");
  });

  it("filters by min_cores", async () => {
    const result = (await searchAuctions({ min_cores: 16 })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("EPYC 7502P"); // 32 cores
    expect(result.content[0].text).toContain("Gold 5412U"); // 24 cores
    expect(result.content[0].text).toContain("Ryzen 9 5950X"); // 16 cores
    expect(result.content[0].text).not.toContain("E3-1270V3"); // 4 cores
  });

  it("filters by ecc", async () => {
    const result = (await searchAuctions({ ecc: true })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("E3-1270V3");
    expect(result.content[0].text).toContain("EPYC 7502P");
    expect(result.content[0].text).not.toContain("Ryzen 9 5950X");
  });

  it("filters by datacenter", async () => {
    const result = (await searchAuctions({ datacenter: "FSN" })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("E3-1270V3");
    expect(result.content[0].text).toContain("i7-6700");
    expect(result.content[0].text).not.toContain("EPYC 7502P");
  });

  it("filters by datacenter matching comma-separated OVH DCs", async () => {
    const result = (await searchAuctions({ datacenter: "FRA" })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("Gold 5412U");
  });

  it("filters by gpu", async () => {
    const result = (await searchAuctions({ gpu: true })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("Ryzen 9 5950X");
    expect(result.content[0].text).not.toContain("E3-1270V3");
  });

  it("filters by min_bandwidth", async () => {
    const result = (await searchAuctions({ min_bandwidth: 1000 })) as {
      content: Array<{ text: string }>;
    };
    // listing #3 has 500 Mbit
    expect(result.content[0].text).not.toContain("Gold 5412U");
  });

  it("filters by fixed_price true", async () => {
    const result = (await searchAuctions({ fixed_price: true })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("EPYC 7502P");
    expect(result.content[0].text).toContain("Gold 5412U");
    expect(result.content[0].text).not.toContain("E3-1270V3");
  });

  it("filters by fixed_price false", async () => {
    const result = (await searchAuctions({ fixed_price: false })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("E3-1270V3");
    expect(result.content[0].text).not.toContain("EPYC 7502P");
  });

  it("filters by max_setup_price", async () => {
    const result = (await searchAuctions({ max_setup_price: 0 })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).not.toContain("EPYC 7502P"); // setup_price: 50
    expect(result.content[0].text).not.toContain("Ryzen 9 5950X"); // setup_price: 10
    expect(result.content[0].text).toContain("E3-1270V3"); // setup_price: 0
  });

  it("filters by highio", async () => {
    const result = (await searchAuctions({ highio: true })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("EPYC 7502P");
    expect(result.content[0].text).not.toContain("E3-1270V3");
  });

  it("returns empty message when no results match", async () => {
    const result = (await searchAuctions({
      max_price: 1,
    })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("No servers found");
  });
});

describe("search_auctions sorting", () => {
  it("sorts by price ascending (default)", async () => {
    const result = (await searchAuctions({})) as {
      content: Array<{ text: string }>;
    };
    const text = result.content[0].text;
    const pricePositions = [24.99, 39.99, 49.99, 59.99, 89.99].map((p) =>
      text.indexOf(p.toFixed(2)),
    );
    for (let i = 1; i < pricePositions.length; i++) {
      expect(pricePositions[i]).toBeGreaterThan(pricePositions[i - 1]);
    }
  });

  it("sorts by ram descending", async () => {
    const result = (await searchAuctions({ sort_by: "ram" })) as {
      content: Array<{ text: string }>;
    };
    const text = result.content[0].text;
    // 128 GB should appear before 64 GB, which should appear before 32 GB
    expect(text.indexOf("128 GB RAM")).toBeLessThan(
      text.indexOf("64 GB RAM"),
    );
  });

  it("sorts by cores descending", async () => {
    const result = (await searchAuctions({ sort_by: "cores" })) as {
      content: Array<{ text: string }>;
    };
    const text = result.content[0].text;
    // 32 cores (EPYC) should appear before 24 cores (Gold)
    expect(text.indexOf("32 cores")).toBeLessThan(text.indexOf("24 cores"));
  });
});

describe("search_auctions limit", () => {
  it("limits results", async () => {
    const result = (await searchAuctions({ limit: 2 })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("showing top 2");
  });

  it("defaults to 10 results", async () => {
    const result = (await searchAuctions({})) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("showing top 5");
  });
});

describe("search_auctions combined filters", () => {
  it("combines cpu_vendor + min_ram", async () => {
    const result = (await searchAuctions({
      cpu_vendor: "amd",
      min_ram: 64,
    })) as { content: Array<{ text: string }> };
    expect(result.content[0].text).toContain("EPYC 7502P");
    expect(result.content[0].text).toContain("Ryzen 9 5950X");
    expect(result.content[0].text).not.toContain("E3-1270V3");
    expect(result.content[0].text).not.toContain("Gold 5412U");
  });
});
