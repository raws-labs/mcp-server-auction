# MCP Server Auction

MCP server for dedicated server auctions and listings. Enables LLMs to search, filter, and analyze real-time dedicated server listings from multiple providers through a unified interface.

[![npm version](https://img.shields.io/npm/v/mcp-server-auction)](https://www.npmjs.com/package/mcp-server-auction)
[![CI](https://github.com/raws-labs/mcp-server-auction/actions/workflows/ci.yml/badge.svg)](https://github.com/raws-labs/mcp-server-auction/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Features

- **Multi-provider** — Hetzner Server Auction + OVH ECO in a single interface
- **14+ filter parameters** — price, RAM, disk type/size/count, CPU vendor/model/cores, ECC, GPU, datacenter, bandwidth, and more
- **Real-time data** — fetches live listings directly from provider APIs
- **No auth required** — all upstream APIs are public
- **Stdio transport** — works with any MCP-compatible client

## Installation

```bash
npm install -g mcp-server-auction
```

Or run directly with npx:

```bash
npx mcp-server-auction
```

## Configuration

The server communicates over stdio using the Model Context Protocol. Point your MCP client at the binary:

```bash
mcp-server-auction
```

## Tools

### `search_auctions`

Search and filter dedicated server auction listings by price, RAM, disk, CPU, datacenter, GPU, bandwidth, and more.

| Parameter | Type | Description |
|---|---|---|
| `provider` | `"hetzner" \| "ovh" \| "all"` | Provider filter (default: `"all"`) |
| `max_price` | `number` | Maximum monthly price in EUR |
| `min_ram` | `number` | Minimum RAM in GB |
| `min_disk_size` | `number` | Minimum total disk capacity in GB |
| `min_disk_count` | `number` | Minimum number of disks |
| `disk_type` | `"ssd" \| "nvme" \| "hdd" \| "any"` | Filter by disk type (`ssd` matches both SATA SSD and NVMe) |
| `cpu_vendor` | `"intel" \| "amd" \| "any"` | CPU vendor filter |
| `cpu_search` | `string` | Free-text search within CPU model name (e.g. `"EPYC 7502"`, `"Xeon E5"`) |
| `min_cpu_count` | `number` | Minimum CPU/socket count |
| `min_cores` | `number` | Minimum total CPU cores (accounts for multi-socket) |
| `ecc` | `boolean` | Require ECC RAM |
| `datacenter` | `string` | Datacenter filter (e.g. `FSN`, `NBG`, `HEL`, `FRA`, `GRA`) |
| `gpu` | `boolean` | Require GPU |
| `min_bandwidth` | `number` | Minimum bandwidth in Mbit (e.g. `1000` = 1 Gbit) |
| `fixed_price` | `boolean` | `true` = fixed price only, `false` = auction only |
| `max_setup_price` | `number` | Maximum setup price in EUR (use `0` for no setup fee) |
| `highio` | `boolean` | Require high I/O hardware |
| `sort_by` | `"price" \| "ram" \| "disk_size" \| "cpu" \| "cores"` | Sort field (default: `"price"`) |
| `limit` | `number` | Max results, 1–50 (default: `10`) |

### `get_auction_stats`

Get aggregate statistics about current server auction listings: provider breakdown, price range, CPU vendor split, datacenter distribution, RAM tiers, GPU/ECC counts.

| Parameter | Type | Description |
|---|---|---|
| `provider` | `"hetzner" \| "ovh" \| "all"` | Provider filter (default: `"all"`) |

### `get_auction_server`

Get full details of a specific auction server by its ID.

| Parameter | Type | Description |
|---|---|---|
| `server_id` | `string` | The server ID (numeric for Hetzner, FQN for OVH) |
| `provider` | `"hetzner" \| "ovh" \| "all"` | Provider filter (default: `"all"`) |

## Providers

| Provider | Regions | Pricing | Auth |
|---|---|---|---|
| **Hetzner** | FSN, NBG (Germany), HEL (Finland) | Auction + fixed | None |
| **OVH ECO** | FRA (Germany), GRA, RBX, SBG (France), LON (UK), WAW (Poland), BHS (Canada) | Fixed | None |

## Development

```bash
npm install          # install dependencies
npm run build        # compile TypeScript → build/
npm start            # run the server (stdio)
npm test             # run tests
```

Inspect interactively with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector build/index.js
```

## License

[MIT](LICENSE)
