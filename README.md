# Philippine Financial Access MCP Server

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

A [Model Context Protocol](https://modelcontextprotocol.io/) server that provides Philippine financial access point data to LLMs. 587 BSP-supervised institutions, 37,834 geocoded branch locations, proximity search, and financial inclusion analytics. Built on Cloudflare Workers with static JSON data.

Public, read-only, no authentication required. Data sourced from the [Bangko Sentral ng Pilipinas](https://www.bsp.gov.ph/) (BSP) SharePoint API and the [2024 Census of Population](https://psa.gov.ph/) via [PSGC-MCP](https://github.com/GodModeArch/PSGC-MCP). All data bundled at build time for low-latency global access.

## Tools

### Branch-Level Tools

| Tool | Description |
|------|-------------|
| `search_branches` | Search 37,834 access points by institution or branch name. Filter by region, province, town, industry type, ATM availability. |
| `get_branch` | Look up a single branch by ID. |
| `get_coverage` | Coverage report for any PSGC area: access point counts by type (bank/ATM/NSSLA), unique institutions, population ratio. |
| `find_unbanked_areas` | Find municipalities with zero access points. Sorted by population (largest unserved first). |
| `find_underserved_areas` | Rank regions or provinces by population-per-access-point ratio. |
| `get_institution_footprint` | Map a bank's nationwide presence: branch count by region/province, ATM stats. |
| `compare_coverage` | Side-by-side coverage comparison of two PSGC areas. |

### Institution-Level Tools

| Tool | Description |
|------|-------------|
| `search_banks` | Search 587 BSP-supervised institutions by name (fuzzy match on registration and trade name). |
| `get_bank` | Look up an institution by code. Includes contact info, head office address. |
| `list_banks_by_type` | List all institutions of a category (digital, rural, thrift, etc.). |
| `list_banks_by_location` | List institutions by PSGC code (region/province/municipality). |
| `get_bank_stats` | Aggregate counts by type, region, and status. |
| `get_banking_density` | Head-office-based population-per-bank ratio for any PSGC area. |
| `find_underbanked_areas` | Rank areas by head office density (complements branch-level `find_underserved_areas`). |

### Industry Types

Branch data includes three industry classifications:

| Industry | Count | Description |
|----------|-------|-------------|
| `BANK` | 26,675 | Full-service bank branches |
| `ATM ONLY` | 10,961 | Standalone ATMs not co-located with a branch |
| `NSSLA` | 198 | Non-Stock Savings and Loan Associations |

### Institution Types

| Type | Count | Description |
|------|-------|-------------|
| `universal_commercial` | 53 | Universal and Commercial Banks (includes branches of foreign banks, OBUs, representative offices) |
| `thrift` | 42 | Thrift/Savings Banks and Private Development Banks |
| `rural` | 351 | Rural Banks (includes microfinance-oriented rural banks) |
| `cooperative` | 21 | Cooperative Banks |
| `digital` | 6 | Digital Banks |
| `quasi_bank` | 5 | Non-Banks with Quasi-Banking Functions |
| `non_bank_fi` | 109 | Non-Bank Financial Institutions (NSSLAs, financing companies, securities dealers, etc.) |

### Coverage Report

The `get_coverage` tool returns a financial access point report for any PSGC area (region, province, or municipality).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `psgc_code` | `string` | Yes | 10-digit PSGC code |
| `industry` | `string` | No | Filter by industry type |

Response includes `total_access_points`, `bank_branches`, `atm_only`, `nssla`, `unique_institutions`, `with_atm`, `population`, and `population_per_access_point`.

### Institution Footprint

The `get_institution_footprint` tool maps a bank's nationwide branch presence using fuzzy name matching.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `institution_name` | `string` | Yes | Institution name to search (e.g. "BDO", "METROBANK") |

Response includes `institution_name` (canonical), `total_branches`, `by_region`, `by_province`, `with_atm`, and `industries`.

### Unreleased Tools

| Tool | Status | Reason |
|------|--------|--------|
| `find_nearest_branches` | Implemented, not registered | BSP geocoordinates are city/district centroids, not actual branch addresses. Of 37,423 branches with coordinates, only 18,975 unique coordinate pairs exist. Branches 5km apart in reality share identical lat/lng. Haversine distance math is correct but input precision makes reported distances misleading. Will release when BSP improves geocoding to address-level. Code is in `src/branch-data.ts`. |

## Use Cases

### Financial Inclusion Analysis
- **"Which provinces have the fewest banks per capita?"** `find_underserved_areas` at province level. Basilan: 1 access point per 67,743 people. Sulu: 1 per 63,672.
- **"Which municipalities have zero banking?"** `find_unbanked_areas`. Talipao, Sulu: 107K people, zero access points.
- **"How does BARMM compare to CALABARZON?"** `compare_coverage` with region PSGC codes. Side-by-side population, access points, and density ratios.

### Bank Expansion / Competitive Intelligence
- **"Where is BDO vs Metrobank vs BPI?"** `get_institution_footprint` for each. BDO: 7,479 access points across 79 provinces. Compare regional concentration.
- **"What's the competitive landscape in Cavite?"** `get_coverage` for Cavite. 1,361 access points, 430 unique institutions, breakdown by type (bank/ATM/NSSLA).
- **"Which provinces have banking but no NSSLAs?"** `find_underserved_areas` filtered by industry `NSSLA`.

### Fintech Market Sizing
- **"Where are ATM-only locations with no full-service branches?"** `search_branches` filtered by industry `ATM ONLY` in a province, cross-referenced with `get_coverage` for the branch/ATM ratio.
- **"Which regions are ATM-heavy but branch-light?"** `get_coverage` across regions. Compare `bank_branches` vs `atm_only` counts. Markets ripe for digital banking.

### Policy / Regulatory
- **"How many digital banks are operating?"** `list_banks_by_type` with `digital`. Six licensed.
- **"National breakdown of institution types?"** `get_bank_stats`. 587 institutions across 7 categories.
- **"Which rural banks serve Mindanao?"** `list_banks_by_location` with region codes + `list_banks_by_type` with `rural`.

### Real Estate / Municipal Planning
- **"Does this municipality have banking infrastructure?"** `get_coverage` with its PSGC code. Quick yes/no plus depth of service.
- **"How does our town compare to the neighboring one?"** `compare_coverage`. Population-normalized comparison.

### Journalism / Data Stories
- **"The 10 largest towns with no bank"** `find_unbanked_areas` sorted by population.
- **"How concentrated is Philippine banking?"** `get_institution_footprint` for the top 5 banks. BDO alone has 7,479 of 37,834 total access points (19.8%).

## Response Format

All data responses are wrapped in a standard envelope:

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

Branch and coverage tools add population provenance:

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

Paginated responses add:

```json
{
  "pagination": { "total": 7479, "offset": 0, "limit": 20, "has_more": true }
}
```

Error responses (`isError: true`) are returned as plain text JSON without wrapping.

### Branch Record Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Branch identifier |
| `institution_name` | `string` | Name of the parent institution |
| `branch_name` | `string` | Branch office name |
| `industry` | `string` | `BANK`, `ATM ONLY`, or `NSSLA` |
| `address` | `string` | Street address |
| `town` | `string` | Municipality/city name |
| `province` | `string` | Province name |
| `region` | `string` | Region name |
| `latitude` | `number\|null` | Latitude (null if outside PH bounding box) |
| `longitude` | `number\|null` | Longitude (null if outside PH bounding box) |
| `has_atm` | `boolean` | Whether the branch has an ATM |
| `psgc_muni_code` | `string` | 10-digit PSGC municipality/city code |
| `region_code` | `string` | 10-digit PSGC region code |
| `province_code` | `string` | 10-digit PSGC province code |

### Institution Record Schema

| Field | Type | Always Present | Description |
|-------|------|----------------|-------------|
| `institution_code` | `string` | Yes | BSP SharePoint list item ID. Stable across ETL runs. |
| `registration_name` | `string` | Yes | Official BSP registration name |
| `bank_type` | `string` | Yes | Normalized classification (see types above) |
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

## Connect

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "ph-financial-access": {
      "url": "https://ph-financial.godmode.ph/mcp"
    }
  }
}
```

Works with Claude Desktop, Cursor, Windsurf, Claude Code, and any MCP-compatible client.

### Quick test

```bash
curl -X POST https://ph-financial.godmode.ph/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "search_branches",
      "arguments": { "query": "BDO", "limit": 3 }
    }
  }'
```

## Data Sources

| Source | Vintage | Records | Description |
|--------|---------|---------|-------------|
| [BSP Institutions API](https://www.bsp.gov.ph/SitePages/financialstability/Directories.aspx) | March 2026 | 587 | BSP-supervised financial institutions (SharePoint REST API) |
| BSP FSAP API | March 2026 | 37,834 | Financial Service Access Points with geocoordinates (SharePoint REST API) |
| [2024 Census of Population](https://psa.gov.ph/population-and-housing) | Proclamation No. 973 | 1,756 areas | Population counts via PSGC-MCP |
| [PSGC Q4 2025 Publication](https://psa.gov.ph/classification/psgc/) | January 13, 2026 | 1,656 municipalities | Geographic codes and hierarchy |

Last synced: March 12, 2026.

### Known Data Issues

- **Geocoordinate quality.** 411 of 37,834 branch records have coordinates outside the Philippines. 167 default to Poughkeepsie, NY (41.60, -73.09) and 101 to Grand Forks, ND (47.93, -97.03), likely geocoding tool defaults. 3 are legitimate overseas branches (BDO Hong Kong). The remaining 140 are scattered globally (geocoding errors). All are nulled out for proximity search but preserved for text queries.
- **Geocoordinate precision.** BSP's geocoding assigns city or district centroids rather than actual branch addresses. Of 37,423 branches with valid coordinates, only 18,975 unique coordinate pairs exist. 4,917 branches share a coordinate with 10+ other branches. The worst case is 79 branches at a single point in Calamba, Laguna. In Makati, branches on Chino Roces Extension, Gil Puyat, Ayala Avenue, Jupiter Street, and even one in Marikina City all share the same coordinate. The `find_nearest_branches` tool will correctly identify branches in the general area, but reported distances are unreliable. Treat proximity results as "branches in this city/district", not "branches within walking distance."
- **Manila city district granularity.** BSP tags Manila branches with "CITY OF MANILA" as the town, not the individual district (Tondo, Sampaloc, Malate, etc.). This means Manila's 14 city districts (SubMun-level PSGC entities) appear as "unbanked" in `find_unbanked_areas` even though branches exist in those districts. The branches are matched to the City of Manila entity (`1380600000`), not to district-level codes. This affects Tondo I/II (pop 637K), Sampaloc (398K), and other Manila districts.
- **Institution PSGC match.** 586 of 587 institutions matched to PSGC municipality codes (99.8%). The one unmatched institution is BPI Remittance Center HK, an overseas office with a Hong Kong address. It has no `psgc_muni_code`, `region_code`, or `province_code` and will not appear in location-based queries.
- **Institution codes.** Sourced from BSP's SharePoint list item `Id` field. Stable across ETL runs as long as BSP does not rebuild the list. Not a BSP-issued regulatory identifier.
- **Status field.** BSP API does not expose closure status. All fetched institutions are marked `active`. Closed banks are removed from BSP's directory entirely.
- **Population is 2024 Census.** Point-in-time count, not a live estimate. Fast-growing urban areas may have significantly higher actual population.
- **Institution name fragmentation.** FSAP data produces 9,623 unique institution name strings, many being the same bank with slight variations (abbreviations, typos). The `get_institution_footprint` tool uses fuzzy matching to consolidate these, which means a query for "BDO" will also capture ATM installations inside client offices (e.g., "BDO UNIBANK INC-WHITE & CASE GLOBAL OPERATIONS CENTER MANILA LLP"). These are real BSP-registered access points but may surprise users expecting only retail branches.

## Related Projects

Part of a suite of Philippine public data MCP servers:

- **[PSGC MCP](https://github.com/GodModeArch/PSGC-MCP)** -- Philippine geographic codes. 42,000+ entities from barangay to region, with 2024 census population. Use alongside this server for PSGC code lookups.
- **[LTS MCP](https://github.com/GodModeArch/lts-mcp)** -- DHSUD License to Sell verification for Philippine real estate projects.
- **[PH Holidays MCP](https://github.com/GodModeArch/ph-holidays-mcp)** -- Philippine holiday calendar

All servers are free, public, and read-only. Data pulled from official Philippine government sources.

## Contributing and Issues

Found a data error, a PSGC matching edge case, or a branch with wrong coordinates? Open an issue. The known data issues section above covers the most common ones, but BSP data has its own quirks and the issues list is the best place to track them.

BSP updates their directory periodically. If the data looks stale, open an issue and it will be refreshed.

## Data Pipeline

The BSP website renders its directories dynamically from SharePoint lists. We query the SharePoint REST API directly, which returns structured JSON. This approach beats scraping or PDF parsing: we get fields the HTML table doesn't show (fax numbers, office counts, multiple type IDs, geocoordinates).

### 1. Fetch institutions

```bash
node scripts/fetch-bsp-api.js
```

Fetches 587 institutions from `_api/web/lists/getbytitle('Institutions')/items`. Classifies each using BSP's three-tier type ID system into 7 normalized `bank_type` values. Outputs `data/banks.json`.

### 2. PSGC join (institutions)

```bash
node scripts/psgc-join.js
```

Fuzzy-matches head office addresses to PSGC municipality codes. Strategy: Metro Manila fast path, candidate extraction from comma-separated address parts, normalization (expand Sta./Sto., strip zip codes), exact match, spelling variants (s/z swap), substring fallback. Result: 586/587 matched (99.8%). Enriches `data/banks.json` in place.

### 3. Fetch branches

```bash
node scripts/fetch-branches.js
```

Fetches 37,834 access points from `_api/web/lists/getbytitle('FSAP')/items`. Splits Title field into institution/branch names. Validates geocoordinates against Philippine bounding box (4.5-21.5 lat, 116-127 lng), nulling 411 out-of-bounds records. Outputs `data/branches.json`.

### 4. PSGC join (branches)

```bash
node scripts/branch-psgc-join.js
```

Matches Town/Province/Region text fields to PSGC municipality codes. Four-strategy approach: NCR fast path (11,824), direct normalized match (20,501), province/region disambiguation (5,401), substring fallback (53). Result: 37,779/37,779 in-scope matched (100%). 55 overseas branches skipped. Enriches `data/branches.json` in place.

### 5. Build population lookup

```bash
node scripts/build-population-lookup.js
```

Extracts 1,756 region/province/city/municipality population records from PSGC-MCP into `data/population.json`.

### 6. Verify and deploy

```bash
npm test
npm run typecheck
npm run deploy
```

The ETL is idempotent. Each run overwrites the previous data files. Review the diff before deploying.

Requires [PSGC-MCP](https://github.com/GodModeArch/PSGC-MCP) as a sibling directory for steps 2, 4, and 5. Not needed for development if `data/*.json` files already exist.

### Check for updates

```bash
./scripts/check-updates.sh
```

Checks if BSP has updated their directory since the last sync.

## Development

```bash
git clone https://github.com/GodModeArch/ph-financial-access-mcp.git
cd ph-financial-access-mcp
npm install
npm run dev
```

Dev server starts at `http://localhost:8787`. Connect your MCP client to `http://localhost:8787/mcp`.

```bash
npm test             # Run tests
npm run typecheck    # TypeScript strict mode check
```

### Project Structure

```
src/
  index.ts           # Cloudflare Worker entry, McpAgent class
  tools.ts           # 15 MCP tool definitions with Zod schemas
  data.ts            # Institution search, filter, density functions
  branch-data.ts     # Branch search, proximity, coverage functions
  response.ts        # Response envelope helpers
  types.ts           # TypeScript interfaces
data/
  banks.json         # 587 institutions (bundled into worker)
  branches.json      # 37,834 access points (bundled into worker)
  population.json    # 2024 Census population by area (1,756 records)
scripts/
  fetch-bsp-api.js   # Institution ETL from BSP SharePoint API
  fetch-branches.js  # Branch ETL from BSP FSAP SharePoint list
  psgc-join.js       # Institution address -> PSGC code matching
  branch-psgc-join.js # Branch town/province -> PSGC code matching
  build-population-lookup.js  # Population data extraction
  check-updates.sh   # BSP update checker
test/
  data.test.ts       # Institution function tests
  branch-data.test.ts # Branch function tests
```

### Architecture

Runs on Cloudflare Workers with Durable Objects. All data is bundled as static JSON at build time (2.5MB gzip total). No database, no external API calls at runtime. Queries execute in-memory against the bundled dataset.

Proximity search uses brute-force Haversine distance over 37K records. At this scale, it completes in ~1-2ms per query on Workers. No spatial index needed.

## Built by

**Aaron Zara** -- Fractional CTO at [Godmode Digital](https://godmode.ph)

This MCP came out of needing structured, queryable Philippine banking data for AI agents. The BSP publishes all of this data, but not in a format machines can easily consume. We wrote the ETL pipeline, PSGC geographic enrichment, and queryable API layer. The data is public. The code is the recipe, the hosted instance is the restaurant.

For enterprise SLAs, custom integrations, or other PH data sources:
[godmode.ph](https://godmode.ph)

## License

MIT
