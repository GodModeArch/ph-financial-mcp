# BSP Bank Directory MCP: Build Journal

Notes, challenges, and decisions from building the Philippine banking data MCP server. Raw material for blog posts.

---

## Phase 1: Head Office Directory (v1.0)

### What we built
MCP server on Cloudflare Workers exposing 587 BSP-supervised financial institutions with 7 query tools. Search, filter by type/location, banking density analysis using 2024 Census population data.

### Data pipeline
1. Fetch institutions from BSP SharePoint REST API (`_api/web/lists/getbytitle('Institutions')/items`)
2. Fuzzy-match head office addresses to PSGC municipality codes (99.8% match rate)
3. Join with 2024 Census population data from PSA via PSGC-MCP sibling project

### Challenge: PSGC code versioning
The Philippine Standard Geographic Code gets updated quarterly. Our initial METRO_ALIASES table for NCR cities used pre-2024 codes (the `137xxxx` series). The 2024 Census Q4 2025 publication switched NCR to `138xxxx` codes.

Result: 14 of 16 NCR city aliases silently failed. The fast-path lookup returned no match, and fuzzy matching took over with bad results:
- 12 banks in Bonifacio Global City (Taguig) got mapped to the municipality of Bonifacio in Misamis Occidental. Same name, different island.
- 2 Valenzuela City banks got mapped to Marikina. The stale alias code for Valenzuela actually resolved to Marikina in the new PSGC.
- SM Savings in "Bay City, Pasay" got mapped to the municipality of Bay in Laguna.

Fix: Updated all 16 NCR aliases to 2024 PSGC codes, added "BONIFACIO GLOBAL" as a Taguig alias, reordered aliases so MANILA is checked last (prevents "Metro Manila" in addresses from matching Manila city before the actual city).

### Challenge: Province code format mismatch
PSGC province entity codes (e.g., `1001300000` for Bukidnon) differ from the generalized province_code field stored on child municipalities (e.g., `1001000000`). Our code used trailing-zero detection to guess the PSGC level, which misidentified province entity codes as municipalities.

Fix: Added `resolvePsgcMatch()` that checks the population lookup first. If the code exists there, uses the entity's `level` field for accurate detection and the entity's `province_code` field for bank matching. Falls back to trailing-zero detection only for unknown codes.

### Challenge: Null province codes in PSGC data
25 municipalities across 5 provinces (Bataan, Albay, Aklan, Capiz, Abra) had `provinceCode: null` in the PSGC-MCP source data. Their parent was set to the region directly, skipping the province level in the hierarchy.

Fix: Added `deriveProvinceCode()` in the join script that extracts the province code from the municipality code structure (first 5 digits + "00000") when the PSGC data doesn't provide one.

### Challenge: HTML in BSP API responses
119 contact fields contained raw `<br>` tags from BSP's SharePoint CMS. Phone numbers looked like `(035)225-1708/<br>(035)422-6931`.

Fix: Added `stripHtml()` to the ETL transform step.

### Challenge: Empty query returns everything
JavaScript's `String.prototype.startsWith("")` returns `true` for any string. An empty search query, after normalization, matched every bank with score=2.

Fix: Added `z.string().min(1)` to the Zod schema and an early return guard in `searchBanks`.

### Adversarial testing findings (full audit)
Ran 4 parallel adversarial testing agents covering:
- Edge cases in data functions
- Security audit (input validation, ReDoS, JSON injection, ETL MITM)
- Test coverage gaps
- Data integrity across all JSON files

Key findings beyond the above:
- ETL pagination follows arbitrary `__next` URLs from BSP API. Added domain validation.
- `findUnderbankedAreas` sourced area codes from all banks (including inactive) but counted only active ones. Fixed to use active only.
- `population_per_bank` returns `null` in density tool but raw population in underbanked tool for zero-bank areas. Documented as intentional (different use cases).
- Hardcoded developer home directory path in psgc-join.js. Replaced with relative `import.meta.url` resolution.

---

## Phase 2: Branch-Level Access Points (v2.0)

### The discovery
While investigating why Cavite (pop 4.5M) showed 0 banks in our density analysis, we realized the fundamental limitation: BSP's Institutions list only has 587 head office records. BDO has 1,306 offices nationwide but shows as 1 record in Makati.

Explored the BSP SharePoint API and found the `FSAP` (Financial Service Access Points) list: **37,834 geocoded branch-level records** with lat/lng, ATM flags, and microfinance flags. Also found `Financial Service Access Points` list (37,971 items, slightly newer, no geocoords).

This transforms the MCP from "where are banks headquartered" to "where can you actually bank in the Philippines."

### New tool design (planned)

**Finding services:**
- `find_nearest_branches` -- proximity search with lat/lng + Haversine distance
- `search_branches` -- text search + location/type/ATM/microfinance filters
- `get_branch` -- single access point lookup

**Coverage analysis:**
- `get_coverage` -- real density using actual branch counts + population
- `find_unbanked_areas` -- municipalities with zero access points
- `find_underserved_areas` -- ranked by population-per-branch ratio

**Market intelligence:**
- `get_institution_footprint` -- map a bank's nationwide branch presence
- `compare_coverage` -- side-by-side area comparison

### Technical decisions
- 38K records is small enough for in-memory Haversine brute-force on Cloudflare Workers (~1-2ms per proximity query). No spatial index needed at this scale.
- Bundle as static JSON like the institution data. Keeps queries fast, no runtime DB.
- PSGC matching for branches uses the Region/Province/Town fields from BSP instead of address fuzzy-matching (cleaner source data than head office addresses).

### Challenge: BSP geocoding quality
All 37,834 FSAP records have coordinates, but 411 (1.1%) are outside the Philippine bounding box (4.5-21.5 lat, 116-127 lng). Analysis reveals:

- **167 records** share coordinates `41.6032, -73.0877` (Poughkeepsie, New York). Likely a geocoding tool default when address resolution fails.
- **101 records** share `47.9253, -97.0329` (Grand Forks, North Dakota). Another default.
- **3 records** are legitimate overseas branches (BDO Hong Kong).
- **140 records** are scattered globally (Argentina, Singapore, Spain, India, Japan, etc.). Each appears to be a geocoding error where the tool matched a foreign address instead of the Philippine one.

Fix: Added Philippine bounding box validation. Records outside the bbox have coordinates nulled out but are still included in the dataset (they have valid town/province data for location-based queries). The 3 legitimate overseas branches (Hong Kong) are flagged separately.

### Challenge: Bundle size for 38K records
The transformed branches.json is 15MB pre-PSGC-join, 19MB after enrichment with PSGC codes. Cloudflare Workers paid plan allows 10MB compressed. Final bundle: **2,472 KB gzip** (20.9MB uncompressed). Well within the 10MB limit. Total bundle breakdown: ~500KB for head office data + worker code, ~2MB for branch data. If the dataset grows significantly, will migrate to D1 SQLite or Cloudflare KV.

### Challenge: Industry types and ATM-only entries
The FSAP data has 3 industry types: BANK (26,675), ATM ONLY (10,961), and NSSLA (198). ATM-only entries represent standalone ATMs not co-located with a bank branch. This is a valuable distinction for coverage analysis: a municipality might have ATM access but no full-service banking. The `wMicrofinance` flag is present but all values are `false` in the current dataset -- the field exists in BSP's schema but isn't populated.

### Challenge: Institution name fragmentation
FSAP Title field format varies: "BDO UNIBANK INC -MAKATI MAIN", "CTBC BANK (PHILIPPINES) CORP" (no dash for head offices). Splitting produces 9,623 unique institution names, many being the same bank with slight variations (abbreviations, typos). Fuzzy matching to our 587-institution registry needed for clean linking.

### Challenge: Branch PSGC join -- 100% match rate
Matching 37,834 branch records to PSGC municipality codes using the BSP Town/Province/Region text fields. Unlike the head office join (which had to fuzzy-match free-form addresses), branch data has structured location fields, enabling a cleaner multi-strategy approach:

1. **NCR fast path** (11,824 branches): Direct mapping of NCR city names ("MAKATI CITY", "QUEZON CITY") and Manila districts ("BINONDO (CITY DIST.)", "ERMITA") to 2024 PSGC codes. Manila's 14 city districts map to SubMun entities under City of Manila (1380600000).

2. **Direct normalized match** (20,501 branches): Normalize BSP town name (strip "CITY", parenthetical suffixes, expand STA./STO.) and match against PSGC municipality names. Handles S/Z spelling variants (DASMARINAS vs DASMARIÑAS).

3. **Disambiguation** (5,401 branches): When a normalized town name matches multiple PSGC municipalities (e.g., "San Jose" appears in 7 provinces), disambiguate using the BSP province field matched against PSGC province entities, then by BSP region matched to PSGC region codes.

4. **Substring fallback** (53 branches): For remaining mismatches, substring matching with province/region disambiguation.

Result: **37,779/37,779 in-scope branches matched** (100%). 55 overseas/NULL-region records skipped (branches in Hong Kong, Singapore, etc.).

Key techniques:
- Hardcoded alias table for known BSP/PSGC mismatches (BALIUAG vs Baliwag, CORDOBA vs Cordova)
- NCR province field handling: "1ST DIST M.M. (CITY OF MANILA)" maps to Manila, "4TH DISTRICT METRO MANILA" disambiguates by city name
- Ñ normalization: BSP uses ASCII "N" where PSGC uses "Ñ" -- strip diacritics before comparison
- Province derivation from municipality code (first 5 digits + "00000") for PSGC entities with null provinceCode

### Challenge: Province entity code vs province_code (again)
The same PSGC province code format mismatch from Phase 1 resurfaced in the branch coverage tools. Province entity codes (e.g., `0402100000` for Cavite) differ from the generalized `province_code` field stored on child municipalities (`0402000000`). The population lookup is keyed by entity codes, but branches carry the generalized code.

`getCoverage` worked correctly because it uses `resolvePsgcMatch()` which maps entity codes to the correct comparison field. But `findUnderservedAreas` iterated population entries directly and compared entity codes against branch province codes, producing 0 matches for every province.

Result: every province showed 0 access points in the underserved ranking. Cavite appeared as the "most underserved" province with 4.6M unserved, despite having 1,361 actual access points.

Fix: Added `resolvePsgcMatch()` call inside the `findUnderservedAreas` loop to resolve each province entity code to the correct generalized code before comparison. This is now a recurring pattern: any function that iterates PSGC population entries and compares against bank/branch location codes must go through `resolvePsgcMatch()` rather than using the population key directly.

### Challenge: BSP geocoding is city-centroid, not address-level
A smoke test searching for branches within 1km of BGC (14.5547, 121.0244) returned BDO Gil Puyat-Filmore, which is about 5km away in real life. Investigation revealed BSP's geocoding assigns city or district centroids rather than actual branch addresses.

Scale of the problem:
- 37,423 branches with valid coordinates
- 18,975 unique coordinate pairs (roughly 2 branches per point on average)
- 11,773 truly unique coordinates (1 branch only)
- 4,917 branches share a coordinate with 10+ others
- Worst cluster: 79 branches at a single point in Calamba, Laguna

At the BGC test coordinate (14.5547389, 121.0244362), 17 branches are piled on the same point. They span completely different addresses: Chino Roces Extension, Yakal Place, Gil Puyat-Filmore, Jupiter Street Bel-Air, Ayala Triangle, Pasong Tamo-Bagtikan, Dela Costa, and even one branch tagged as Marikina City.

This means `find_nearest_branches` is effectively "find branches in this city/district" rather than true walking-distance proximity. The Haversine math is correct, the input coordinates are not.

No fix on our side. BSP would need to re-geocode their branch database with address-level precision. Documented in the README as a known limitation.

### Edge case: Manila city districts appear "unbanked"
`findUnbankedAreas` correctly identifies municipalities with zero PSGC-matched access points. But Manila's 14 city districts (SubMun entities like Tondo, Sampaloc, Malate) appear as "unbanked" despite having branches physically present. The reason: BSP tags Manila branches with "CITY OF MANILA" as the town, so our PSGC join maps them to the City of Manila entity (`1380600000`), not to individual district codes (`1380601000` for Tondo, `1380606000` for Sampaloc, etc.).

This produces false positives in the unbanked results: Tondo I/II (pop 637K) and Sampaloc (pop 398K) rank as the #1 and #2 largest "unbanked" areas in the Philippines, which is clearly wrong. Documenting as a known limitation rather than fixing, because the BSP source data does not include district-level town names for Manila branches.

### Edge case: Institution footprint captures sub-entities
The `getInstitutionFootprint` fuzzy match (institution name `.includes(query)`) picks up BSP-registered ATM installations inside client offices. A search for "BDO" returns 7,479 access points including entries like "BDO UNIBANK INC-WHITE & CASE GLOBAL OPERATIONS CENTER MANILA LLP". These are real BSP-registered access points (ATM-only), so this is correct behavior from a data perspective, but may surprise users expecting only retail branches. The tool's fuzzy matching is intentional since BSP uses inconsistent naming across records.

### Open source decision
Open-sourcing the code, hosting canonical instance at bsp-banks.godmode.ph. The data is already public (BSP publishes it). The value is in the ETL pipeline, PSGC matching, and queryable API layer. The code is the recipe, the hosted instance is the restaurant.
