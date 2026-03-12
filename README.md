# BSP Bank Directory MCP Server

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

A [Model Context Protocol](https://modelcontextprotocol.io/) server that provides the complete BSP-supervised Philippine banking directory to LLMs. Built on Cloudflare Workers with static JSON data.

Public, read-only, no authentication required. 587 institutions across all BSP-supervised categories, each enriched with [PSGC](https://psa.gov.ph/classification/psgc/) location codes for geographic queries. Covers 13,500+ bank offices and branches nationwide.

## What This Does

This server lets LLMs answer questions about the Philippine banking system:

- "Which banks operate in Cebu?"
- "How many digital banks are there in the Philippines?"
- "Who is the president of BDO?"
- "What rural banks are in the CALABARZON region?"
- "Give me contact details for all cooperative banks."

It does this by exposing structured, searchable BSP directory data through the MCP protocol, so any MCP-compatible client (Claude Desktop, Cursor, custom agents) can query it like a tool call.

## MCP Client Configuration

Add to your MCP client config:

```json
{
  "mcpServers": {
    "bsp-banks": {
      "url": "https://bsp-banks.godmode.ph/mcp"
    }
  }
}
```

Works with Claude Desktop, Cursor, Windsurf, and any MCP-compatible client.

## Tools

| Tool | Description | Paginated |
|------|-------------|-----------|
| `search_banks` | Fuzzy search by registration name or trade name | Yes |
| `get_bank` | Look up a single bank by institution code | No |
| `list_banks_by_type` | List all banks of a specific category | Yes |
| `list_banks_by_location` | List banks in a region, province, or municipality (via PSGC code) | Yes |
| `get_bank_stats` | Aggregate counts by type, region, and status | No |
| `get_banking_density` | Population-per-bank ratio for any region, province, or municipality | No |
| `find_underbanked_areas` | Rank regions or provinces by banking coverage (most underbanked first) | No |

All tools default to active institutions. Pass `status: "closed"` or `status: "under_receivership"` to include inactive ones.

### Bank Types

| Type | Description | Count |
|------|-------------|-------|
| `universal_commercial` | Universal and Commercial Banks (includes branches of foreign banks, OBUs, representative offices) | 53 |
| `thrift` | Thrift/Savings Banks and Private Development Banks | 42 |
| `rural` | Rural Banks (includes microfinance-oriented rural banks) | 351 |
| `cooperative` | Cooperative Banks | 21 |
| `digital` | Digital Banks | 6 |
| `quasi_bank` | Non-Banks with Quasi-Banking Functions (financing companies, investment houses) | 5 |
| `non_bank_fi` | Non-Bank Financial Institutions (NSSLAs, financing companies, securities dealers, trust corps, lending investors, remittance agents, credit card companies) | 109 |

### Sample Prompts

These are natural-language prompts you can give to an LLM connected to this server:

**Lookup and search:**
- "Look up BDO Unibank in the BSP directory."
- "Find all banks with 'Bangko' in the name."
- "What is the official registration name for BPI?"
- "Who is the president of Metrobank?"

**Filtering by type:**
- "List all 6 digital banks in the Philippines."
- "How many rural banks are there? List the top 10 by office count."
- "Show me all cooperative banks and their head office locations."
- "Which non-bank financial institutions are BSP-supervised?"

**Location queries (pairs well with [PSGC-MCP](https://github.com/GodModeArch/PSGC-MCP)):**
- "What banks are headquartered in Makati?"
- "List all rural banks in the CALABARZON region."
- "How many banks operate in Davao?"
- "Which thrift banks are in Cebu province?"

**Statistics and analysis:**
- "Give me a breakdown of BSP-supervised institutions by type."
- "How many banks are in NCR vs. Visayas vs. Mindanao?"
- "What percentage of Philippine banks are rural banks?"

**Banking density and coverage (uses 2024 Census population data):**
- "What is the banking density in NCR vs. CALABARZON?"
- "How many people per bank are there in Cebu?"
- "Which regions in the Philippines are most underbanked?"
- "Rank provinces by rural bank coverage."
- "What is the population-to-bank ratio in Makati vs. Quezon City?"

### Tool Call Examples

For developers integrating directly:

```
search_banks({ query: "BDO" })
search_banks({ query: "Rural Bank", bank_type: "rural", limit: 10 })
get_bank({ institution_code: "0001" })
list_banks_by_type({ bank_type: "digital" })
list_banks_by_location({ psgc_code: "1300000000" })            // NCR region
list_banks_by_location({ psgc_code: "1376000000", bank_type: "thrift" })  // Makati thrift banks
get_bank_stats({})
get_banking_density({ psgc_code: "1300000000" })                 // NCR banking density
get_banking_density({ psgc_code: "1376001000", bank_type: "digital" })  // Digital bank density in Makati
find_underbanked_areas({ level: "region" })                       // Most underbanked regions
find_underbanked_areas({ level: "province", bank_type: "rural" }) // Provinces with fewest rural banks
```

## Data Methodology

### Source

All institution data comes from the [BSP Directory of Banks and Financial Institutions](https://www.bsp.gov.ph/SitePages/financialstability/Directories.aspx), which is the official, public registry maintained by the Bangko Sentral ng Pilipinas.

### How We Get the Data

The BSP website renders its directory dynamically from a SharePoint list. We query the SharePoint REST API directly:

```
GET /lists/getbytitle('Institutions')/items?$select=Title,InstitutionTypeID,...&$top=5000
GET /lists/getbytitle('Financial Institution')/items?$select=Code,Title&$top=5000
```

This returns structured JSON with all institution records in a single paginated request. The script is at `scripts/fetch-bsp-api.js`.

We chose this approach over scraping or PDF parsing because:

- The BSP Directories page does not offer downloadable PDFs for the main bank list (only supplementary lists like EMIs and trust-authorized institutions have PDFs)
- The SharePoint API returns structured data with consistent field names
- We get fields that the HTML table doesn't show (fax numbers, number of offices, multiple type IDs)

### How We Process It

**Step 1: Fetch and classify** (`scripts/fetch-bsp-api.js`)

Each institution has three BSP type IDs (`InstitutionTypeID`, `InstitutionTypeID2`, `InstitutionTypeID3`) that indicate its classification at different levels of granularity. We map the most specific type ID to one of 7 normalized `bank_type` values. For example, BSP type ID `12` (Rural Banks) maps to `rural`, while `13` (Cooperative Banks) maps to `cooperative`.

**Step 2: PSGC location enrichment** (`scripts/psgc-join.js`)

We fuzzy-match each institution's head office address to a PSGC municipality or city code using data from the [PSGC-MCP](https://github.com/GodModeArch/PSGC-MCP) project. The matching strategy:

1. Check for known Metro Manila city names (Makati, Taguig, Pasig, etc.) as a fast path
2. Extract city/municipality candidates from comma-separated address parts
3. Normalize both sides (expand "Sta." to "Santa", "Sto." to "Santo", strip zip codes, uppercase)
4. Exact match against normalized PSGC municipality names
5. Try spelling variants (s/z swap for names like Ozamis/Ozamiz)
6. Substring match as fallback

**Result:** 586 of 587 institutions matched (99.8%). The single unmatched institution is BPI Remittance Center HK, which is in Hong Kong.

**Step 3: Population data join** (`scripts/build-population-lookup.js`)

We extract population data from the [PSGC-MCP](https://github.com/GodModeArch/PSGC-MCP) project, which sources from the PSA's 2024 Census of Population (PSGC Q4 2025 Publication). The script reads all 44,000+ geographic entities and extracts 1,756 records at the region, province, city, and municipality levels into a lightweight lookup table (`data/population.json`, ~280KB).

This enables the `get_banking_density` and `find_underbanked_areas` tools. For each PSGC area, we cross-reference the number of bank head offices registered there against the area's population to compute a population-per-bank ratio.

### Data Coverage

| Field | Coverage |
|-------|----------|
| Registration name | 587/587 (100%) |
| Head office address | 587/587 (100%) |
| PSGC location code | 586/587 (99.8%) |
| Contact person (president/CEO) | 581/587 (99.0%) |
| Contact email | 574/587 (97.8%) |
| Contact phone | 566/587 (96.4%) |
| Number of offices | 550/587 (93.7%) |
| Website | 85/587 (14.5%) |

### Limitations

- **Snapshot, not live.** The dataset is a point-in-time extract. BSP updates their directory periodically (new banks, closures, mergers). Run `scripts/check-updates.sh` to check for changes.
- **Status field.** The BSP API does not expose an explicit "closed" or "under_receivership" flag. All institutions in the current directory are listed as `active`. Closed institutions are removed from the BSP directory entirely, so they won't appear here.
- **Institution codes.** We assign sequential codes sorted by type and name, since the BSP API does not expose AMLC institution codes. Codes are stable within a dataset version but may shift when institutions are added or removed.
- **Address quality varies.** Some addresses are abbreviated or incomplete (e.g. "Ayala Triangle Ayala Ave Makati Ct"). PSGC matching handles most of these but a few edge cases may have imprecise municipality matches.
- **Population data is from the 2024 Census.** The banking density tools use 2024 Census of Population figures from PSA. This is not a live population count. Actual current population may differ, especially in fast-growing urban areas.
- **Head office locations only.** Banking density is computed from BSP-registered head office addresses, not branch locations. A municipality showing 0 banks may still be served by branches of banks headquartered elsewhere. The `num_offices` field shows total offices per bank nationwide, but we cannot attribute individual branches to specific municipalities.

## Response Format

All data responses use a standard envelope:

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

Paginated responses add:

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

Density tool responses include additional provenance fields:

```json
{
  "_meta": {
    "...": "...",
    "population_source": "Philippine Statistics Authority (PSA)",
    "population_year": "2024",
    "population_dataset": "2024 Census of Population, PSGC Q4 2025 Publication"
  }
}
```

Error responses return `isError: true` with a plain text message.

### Bank Record Schema

| Field | Type | Always Present | Description |
|-------|------|----------------|-------------|
| `institution_code` | `string` | Yes | Sequential identifier (e.g. "0001") |
| `registration_name` | `string` | Yes | Official BSP registration name |
| `bank_type` | `string` | Yes | Normalized classification (see types above) |
| `bsp_type_id` | `number` | Yes | Raw BSP primary type ID |
| `bsp_type_id2` | `number` | Yes | Raw BSP secondary type ID |
| `bsp_type_id3` | `number` | Yes | Raw BSP tertiary type ID |
| `status` | `string` | Yes | `active`, `closed`, `under_receivership`, or `merged` |
| `head_office_address` | `string` | Yes | Head office address as listed by BSP |
| `psgc_muni_code` | `string` | No | 10-digit PSGC municipality/city code |
| `region_code` | `string` | No | 10-digit PSGC region code |
| `province_code` | `string` | No | 10-digit PSGC province code |
| `contact_person` | `string` | No | President/CEO/Chairman name |
| `contact_title` | `string` | No | Title (e.g. "President and Chief Executive Officer") |
| `contact_email` | `string` | No | Contact email address(es) |
| `contact_phone` | `string` | No | Contact phone number(s) |
| `website` | `string` | No | Institution website URL |
| `fax` | `string` | No | Fax number(s) |
| `num_offices` | `number` | No | Number of offices/branches |
| `date_sourced` | `string` | Yes | Date the data was fetched (ISO format) |
| `source_document` | `string` | Yes | Data source identifier |

## Updating Data

Check if BSP has updated their directory:

```bash
./scripts/check-updates.sh
```

To refresh the full dataset:

```bash
node scripts/fetch-bsp-api.js           # Fetch all institutions from BSP SharePoint API
node scripts/psgc-join.js               # Enrich with PSGC location codes
node scripts/build-population-lookup.js  # Rebuild population lookup from PSGC data
npm test                                 # Run tests to verify data integrity
npm run deploy                           # Deploy updated data to Cloudflare
```

The ETL is idempotent. Running it again will overwrite `data/banks.json` with fresh data. Review the diff before deploying.

## Development

```bash
git clone https://github.com/GodModeArch/bsp-bank-directory-mcp.git
cd bsp-bank-directory-mcp
npm install
npm run dev          # Local dev server on :8787
npm test             # Run tests (26 tests)
npm run typecheck    # TypeScript strict mode check
```

### Project Structure

```
src/
  index.ts          # Cloudflare Worker entry point, McpAgent class
  tools.ts          # 7 MCP tool definitions with Zod schemas
  data.ts           # Search, filter, and aggregation functions
  response.ts       # Response envelope helpers
  types.ts          # TypeScript interfaces
data/
  banks.json        # The dataset (587 institutions, bundled into worker)
  population.json   # Population by region/province/municipality (2024 Census, 1,756 areas)
  etl-log.json      # ETL run metadata
  psgc-join-log.json # PSGC matching results and unmatched list
scripts/
  fetch-bsp-api.js  # Fetches from BSP SharePoint REST API
  psgc-join.js      # Fuzzy-matches addresses to PSGC codes
  build-population-lookup.js  # Extracts population data from PSGC-MCP
  check-updates.sh  # Checks if BSP has new data
  download-pdfs.sh  # Legacy: downloads supplementary BSP PDFs
test/
  data.test.ts      # Unit tests for search, filter, and stats functions
```

## Related MCP Servers

Part of a suite of Philippine public data MCP servers:

- [PSGC-MCP](https://github.com/GodModeArch/PSGC-MCP) -- Philippine geographic codes. 42,000+ entities from barangay to region, with 2024 census population data. Use alongside this server for location-based bank queries.
- [LTS-MCP](https://github.com/GodModeArch/lts-mcp) -- DHSUD License to Sell verification for Philippine real estate projects.

## License

MIT
