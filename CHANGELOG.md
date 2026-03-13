# Changelog

## 2.0.0 (2026-03-13)

### Added
- Branch-level tools: `search_branches`, `get_branch`, `get_coverage`, `find_unbanked_areas`, `find_underserved_areas`, `get_institution_footprint`, `compare_coverage`
- 37,834 BSP Financial Service Access Points (FSAP) with geocoordinates
- Branch PSGC join pipeline (37,779/37,779 in-scope matched, 100%)
- 2024 Census population cross-referencing for coverage analysis
- GitHub Actions deploy workflow

### Changed
- Renamed from `bsp-bank-directory-mcp` to `ph-financial-mcp`
- Custom domain: `ph-financial-mcp.godmode.ph`
- Dataset version bumped to 2.0.0
- PSGC resolution now uses population lookup for accurate province matching

## 1.0.0 (2026-03-12)

### Added
- Institution-level tools: `search_banks`, `get_bank`, `list_banks_by_type`, `list_banks_by_location`, `get_bank_stats`, `get_banking_density`, `find_underbanked_areas`
- 587 BSP-supervised financial institutions
- PSGC geographic enrichment (586/587 matched, 99.8%)
- 2024 Census population data for banking density analysis
- Cloudflare Workers deployment with Durable Objects
