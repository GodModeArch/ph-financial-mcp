# BSP Bank Directory MCP Server

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

A [Model Context Protocol](https://modelcontextprotocol.io/) server that provides the complete BSP-supervised Philippine banking directory to LLMs. Built on Cloudflare Workers with static JSON data.

Public, read-only, no authentication required. Data sourced directly from the [Bangko Sentral ng Pilipinas](https://www.bsp.gov.ph/SitePages/financialstability/Directories.aspx) searchable directory. Each institution is enriched with [PSGC](https://psa.gov.ph/classification/psgc/) municipality codes for location-based queries.

## MCP Client Configuration

Add to your MCP client config (e.g. Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "bsp-banks": {
      "url": "https://bsp-banks.godmode.ph/mcp"
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `search_banks` | Search banks by name (fuzzy match on registration and trade names) |
| `get_bank` | Look up a specific bank by institution code |
| `list_banks_by_type` | List all banks of a specific type |
| `list_banks_by_location` | List banks by PSGC region, province, or municipality code |
| `get_bank_stats` | Get summary statistics (counts by type, region, status) |

### Bank Types

| Type | Description | Count |
|------|-------------|-------|
| `universal_commercial` | Universal and Commercial Banks | 53 |
| `thrift` | Thrift/Savings Banks | 42 |
| `rural` | Rural Banks | 351 |
| `cooperative` | Cooperative Banks | 21 |
| `digital` | Digital Banks | 6 |
| `quasi_bank` | Non-Banks with Quasi-Banking Functions | 5 |
| `non_bank_fi` | Non-Bank Financial Institutions | 109 |

### Example Queries

**Search by name:**
```
search_banks({ query: "BDO" })
search_banks({ query: "Rural Bank", bank_type: "rural", limit: 10 })
```

**Look up by code:**
```
get_bank({ institution_code: "0001" })
```

**List by type:**
```
list_banks_by_type({ bank_type: "digital" })
list_banks_by_type({ bank_type: "universal_commercial" })
```

**List by location (use PSGC codes from [psgc-mcp](https://github.com/GodModeArch/PSGC-MCP)):**
```
list_banks_by_location({ psgc_code: "1300000000" })  // NCR region
list_banks_by_location({ psgc_code: "1376000000", bank_type: "thrift" })  // Makati thrift banks
```

**Get statistics:**
```
get_bank_stats({})
```

## Response Format

All responses use a standard envelope:

```json
{
  "_meta": {
    "dataset_version": "1.0.0",
    "dataset_date": "2026-03-12",
    "last_synced": "2026-03-12",
    "source": "Bangko Sentral ng Pilipinas (BSP)",
    "source_url": "https://www.bsp.gov.ph/SitePages/financialstability/Directories.aspx"
  },
  "data": { ... }
}
```

Paginated responses include:

```json
{
  "pagination": {
    "total": 351,
    "offset": 0,
    "limit": 50,
    "has_more": true
  }
}
```

### Bank Record Schema

| Field | Type | Description |
|-------|------|-------------|
| `institution_code` | `string` | Unique identifier |
| `registration_name` | `string` | Official BSP registration name |
| `bank_type` | `string` | Bank classification (see types above) |
| `status` | `string` | `active`, `closed`, `under_receivership`, or `merged` |
| `head_office_address` | `string` | Head office address |
| `psgc_muni_code` | `string` | 10-digit PSGC municipality code |
| `region_code` | `string` | 10-digit PSGC region code |
| `province_code` | `string` | 10-digit PSGC province code |
| `contact_person` | `string` | President/CEO name |
| `contact_title` | `string` | Title/position |
| `contact_email` | `string` | Contact email |
| `contact_phone` | `string` | Contact phone |
| `website` | `string` | Bank website |
| `num_offices` | `number` | Number of offices/branches |

## Data Sources

- **Bank data:** [BSP Directory of Banks and Financial Institutions](https://www.bsp.gov.ph/SitePages/financialstability/Directories.aspx) (587 institutions)
- **Location codes:** [PSGC-MCP](https://github.com/GodModeArch/PSGC-MCP) municipality data (99.8% address match rate)

## Updating Data

Check if BSP has published updates:

```bash
./scripts/check-updates.sh
```

To refresh the dataset:

```bash
node scripts/fetch-bsp-api.js    # Fetch from BSP SharePoint API
node scripts/psgc-join.js        # Enrich with PSGC location codes
npm test                          # Verify data integrity
npm run deploy                    # Deploy to Cloudflare
```

## Development

```bash
git clone https://github.com/GodModeArch/bsp-bank-directory-mcp.git
cd bsp-bank-directory-mcp
npm install
npm run dev          # Local dev server on :8787
npm test             # Run tests
npm run typecheck    # Type check
```

## Related MCP Servers

- [PSGC-MCP](https://github.com/GodModeArch/PSGC-MCP) - Philippine geographic codes (regions, provinces, cities, municipalities, barangays)
- [LTS-MCP](https://github.com/GodModeArch/lts-mcp) - DHSUD License to Sell verification for Philippine real estate

## License

MIT
