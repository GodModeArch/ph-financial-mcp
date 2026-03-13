# BSP Bank Directory MCP — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an MCP server that serves the complete BSP-supervised Philippine banking directory with PSGC location joins, deployed on Cloudflare Workers.

**Architecture:** Static JSON dataset (~700 bank records) bundled into a Cloudflare Worker via import. ETL pipeline in Python (pdfplumber) parses BSP PDFs into structured JSON, normalizes across sources, and fuzzy-matches head office addresses to PSGC municipality codes. MCP server exposes 5 tools for searching, filtering, and aggregating bank data.

**Tech Stack:** TypeScript, Cloudflare Workers, `agents` + `zod` packages, MCP SDK, Python 3 + pdfplumber (ETL only), Vitest (testing)

**Sibling repos for reference patterns:**
- `/home/zaraaar/command-center/PSGC-MCP` — KV-based MCP server, search scoring, response envelope, tool registration
- `/home/zaraaar/command-center/lts-mcp` — Supabase-based MCP server, tool splitting, error helpers

---

## Architecture Decisions

| Decision | Choice | Why |
|---|---|---|
| ETL language | Python (pdfplumber) | Best PDF table extraction for government PDFs with merged cells |
| PSGC join | Local municipality list bundled in ETL script | No runtime dependency on PSGC-MCP server |
| Data storage | Static JSON import in worker | ~700 records, no KV overhead needed |
| Server pattern | Follow PSGC-MCP's `McpAgent` class pattern | Consistency across the suite |
| Response shape | `{ _meta, data }` envelope | Matches both sibling repos |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.jsonc`
- Create: `src/types.ts`
- Create: `.gitignore`

**Step 1: Initialize git repo**

```bash
cd /home/zaraaar/command-center/bspbankdir
git init
```

**Step 2: Create package.json**

```json
{
  "name": "@aaronzara/bsp-bank-directory-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "agents": "^0.5.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.12.18",
    "typescript": "5.9.3",
    "vitest": "^3.2.4",
    "wrangler": "^4.67.0"
  }
}
```

**Step 3: Create tsconfig.json**

Reference PSGC-MCP's tsconfig: `/home/zaraaar/command-center/PSGC-MCP/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "types": ["@cloudflare/vitest-pool-workers"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

**Step 4: Create wrangler.jsonc**

Reference PSGC-MCP's wrangler: `/home/zaraaar/command-center/PSGC-MCP/wrangler.jsonc`

```jsonc
{
  "name": "bsp-bank-directory-mcp",
  "main": "src/index.ts",
  "compatibility_date": "2025-03-10",
  "compatibility_flags": ["nodejs_compat"],
  "routes": [
    {
      "pattern": "bsp-banks.godmode.ph/*",
      "custom_domain": true
    }
  ],
  "vars": {
    "DATASET_VERSION": "1.0.0",
    "DATASET_DATE": "2026-03-12",
    "LAST_SYNCED": "2026-03-12"
  },
  "migrations": [
    {
      "tag": "v1",
      "new_classes": ["BSPBanksMCP"]
    }
  ]
}
```

**Step 5: Create .gitignore**

```
node_modules/
dist/
.wrangler/
.dev.vars
data/raw/*.pdf
__pycache__/
*.pyc
.venv/
```

**Step 6: Create src/types.ts**

```typescript
export type BankType =
  | "universal_commercial"
  | "thrift"
  | "rural"
  | "cooperative"
  | "digital"
  | "emi_bank"
  | "emi_nonbank"
  | "quasi_bank"
  | "non_bank_fi";

export type BankStatus = "active" | "closed" | "under_receivership" | "merged";

export interface Bank {
  institution_code: string;
  registration_name: string;
  trade_name?: string;
  bank_type: BankType;
  status: BankStatus;
  head_office_address: string;
  psgc_muni_code?: string;
  region_code?: string;
  province_code?: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  merged_into?: string;
  date_sourced: string;
  source_document: string;
}

export interface Env {
  DATASET_VERSION: string;
  DATASET_DATE: string;
  LAST_SYNCED: string;
}

export interface ApiMeta {
  dataset_version: string;
  dataset_date: string;
  last_synced: string;
  source: string;
  source_url: string;
}
```

**Step 7: Run npm install**

```bash
npm install
```

**Step 8: Commit**

```bash
git add package.json tsconfig.json wrangler.jsonc src/types.ts .gitignore
git commit -m "Initialize project scaffolding"
```

---

## Task 2: Download Source PDFs

**Files:**
- Create: `data/raw/` directory
- Create: `scripts/download-pdfs.sh`

**Step 1: Create download script**

```bash
#!/usr/bin/env bash
set -euo pipefail

mkdir -p data/raw

URLS=(
  "https://www.bsp.gov.ph/Lists/Directories/Attachments/1/ukb.pdf"
  "https://www.bsp.gov.ph/Lists/Directories/Attachments/2/thrift.pdf"
  "https://www.bsp.gov.ph/Lists/Directories/Attachments/3/rural.pdf"
  "https://www.bsp.gov.ph/Lists/Directories/Attachments/4/coop.pdf"
  "https://www.bsp.gov.ph/Lists/Directories/Attachments/5/digital.pdf"
  "https://www.bsp.gov.ph/Lists/Directories/Attachments/7/emi.pdf"
  "https://www.bsp.gov.ph/Lists/Directories/Attachments/6/quasi.pdf"
)

NAMES=(
  "ukb.pdf"
  "thrift.pdf"
  "rural.pdf"
  "cooperative.pdf"
  "digital.pdf"
  "emi.pdf"
  "quasi.pdf"
)

for i in "${!URLS[@]}"; do
  echo "Downloading ${NAMES[$i]}..."
  curl -sL -o "data/raw/${NAMES[$i]}" "${URLS[$i]}" || echo "WARN: Failed to download ${NAMES[$i]}"
done

# AMLC covered persons list
echo "Downloading AMLC covered persons list..."
curl -sL -o "data/raw/amlc-covered-persons.pdf" \
  "http://www.amlc.gov.ph/images/PDFs/LISTS%20OF%20BSP%20COVERED%20PERSONS.pdf" \
  || echo "WARN: Failed to download AMLC list"

echo "Done. Check data/raw/ for downloaded files."
```

**Step 2: Important note about URLs**

The URLs above are best guesses based on the BSP Directories page structure. The actual attachment URLs may differ. Before running, manually visit https://www.bsp.gov.ph/SitePages/financialstability/Directories.aspx and right-click each PDF link to get the real download URLs. Update the script accordingly.

If curl fails on BSP's site (they sometimes block non-browser requests), download manually via browser and place in `data/raw/`.

**Step 3: Make executable and run**

```bash
chmod +x scripts/download-pdfs.sh
./scripts/download-pdfs.sh
```

**Step 4: Verify downloads**

```bash
ls -la data/raw/
file data/raw/*.pdf
```

All files should be identified as "PDF document". If any show "HTML document", the URL was wrong. Download manually.

**Step 5: Commit script only (not PDFs, they're gitignored)**

```bash
git add scripts/download-pdfs.sh
git commit -m "Add PDF download script for BSP directories"
```

---

## Task 3: Python ETL — Parse PDFs to JSON

**Files:**
- Create: `scripts/requirements.txt`
- Create: `scripts/etl.py`
- Create: `data/parsed/` directory

**Step 1: Create Python requirements**

```
pdfplumber==0.11.6
```

**Step 2: Set up Python environment**

```bash
cd scripts
python3 -m venv ../.venv
source ../.venv/bin/activate
pip install -r requirements.txt
```

**Step 3: Create ETL script**

This is the most complex part. BSP PDFs are table-based. Each bank type PDF has slightly different columns. The ETL must handle all variants.

Create `scripts/etl.py`:

```python
#!/usr/bin/env python3
"""
BSP Bank Directory ETL Pipeline
Parses BSP PDF directories into structured JSON.

Usage:
    python scripts/etl.py

Reads from: data/raw/*.pdf
Writes to:  data/parsed/*.json (per-PDF) and data/banks.json (merged)
"""

import json
import os
import re
import sys
from pathlib import Path

import pdfplumber

# Paths
RAW_DIR = Path("data/raw")
PARSED_DIR = Path("data/parsed")
OUTPUT_FILE = Path("data/banks.json")
LOG_FILE = Path("data/etl-log.json")

PARSED_DIR.mkdir(parents=True, exist_ok=True)

# Bank type mapping from filename
FILE_TYPE_MAP = {
    "ukb.pdf": "universal_commercial",
    "thrift.pdf": "thrift",
    "rural.pdf": "rural",
    "cooperative.pdf": "cooperative",
    "digital.pdf": "digital",
    "emi.pdf": None,  # Split into emi_bank and emi_nonbank during parsing
    "quasi.pdf": None,  # Split into quasi_bank and non_bank_fi during parsing
}


def clean_text(text: str | None) -> str:
    """Normalize whitespace and strip artifacts from PDF text."""
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    return text


def detect_status(name: str) -> tuple[str, str]:
    """
    Check for status markers in bank names.
    Returns (cleaned_name, status).

    BSP PDFs use:
    - * or ** after name = closed or under receivership
    - Footnotes explain specific status
    """
    status = "active"
    cleaned = name.strip()

    if cleaned.endswith("**"):
        cleaned = cleaned[:-2].strip()
        status = "under_receivership"
    elif cleaned.endswith("*"):
        cleaned = cleaned[:-1].strip()
        status = "closed"

    return cleaned, status


def parse_table_pdf(pdf_path: Path, bank_type: str) -> list[dict]:
    """
    Generic parser for BSP bank list PDFs.

    Most BSP bank PDFs have columns roughly like:
    [No.] [Name of Bank] [Head Office Address] [President/CEO/Contact]

    Column count and headers vary. This parser:
    1. Extracts all tables from all pages
    2. Uses the first row as header detection
    3. Maps columns by keyword matching
    4. Skips header rows that repeat on each page
    """
    banks = []

    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages):
            tables = page.extract_tables()

            for table in tables:
                if not table:
                    continue

                for row in table:
                    if not row or all(cell is None or cell.strip() == "" for cell in row):
                        continue

                    # Skip header rows (contain column titles)
                    row_text = " ".join(clean_text(c) for c in row if c)
                    if any(kw in row_text.lower() for kw in [
                        "name of bank", "head office", "no.", "institution"
                    ]):
                        continue

                    # Skip footnote rows
                    if row_text.startswith("*") or row_text.startswith("Note"):
                        continue

                    # Try to extract bank data from row cells
                    cells = [clean_text(c) for c in row]

                    # Filter out empty cells and the row number
                    non_empty = [c for c in cells if c and not re.match(r"^\d{1,3}\.?$", c)]

                    if len(non_empty) < 2:
                        continue

                    # First substantial cell is typically the bank name
                    raw_name = non_empty[0]
                    name, status = detect_status(raw_name)

                    # Second cell is typically head office address
                    address = non_empty[1] if len(non_empty) > 1 else ""

                    # Remaining cells may contain contact info
                    contact_person = non_empty[2] if len(non_empty) > 2 else None

                    if not name or len(name) < 3:
                        continue

                    bank = {
                        "institution_code": "",  # Filled in merge step from AMLC
                        "registration_name": name,
                        "bank_type": bank_type,
                        "status": status,
                        "head_office_address": address,
                        "contact_person": contact_person,
                        "date_sourced": "2026-03-12",
                        "source_document": pdf_path.name,
                    }
                    banks.append(bank)

    return banks


def parse_amlc(pdf_path: Path) -> dict[str, str]:
    """
    Parse AMLC covered persons list.
    Returns dict mapping registration_name (normalized) -> institution_code.
    """
    code_map = {}

    if not pdf_path.exists():
        print(f"WARN: AMLC PDF not found at {pdf_path}, skipping institution code enrichment")
        return code_map

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                if not table:
                    continue
                for row in table:
                    if not row:
                        continue
                    cells = [clean_text(c) for c in row]
                    non_empty = [c for c in cells if c]

                    if len(non_empty) < 2:
                        continue

                    # Look for rows where first cell looks like an institution code
                    # AMLC codes are typically numeric, 4-6 digits
                    for i, cell in enumerate(non_empty):
                        if re.match(r"^\d{3,6}$", cell):
                            # Next cell is likely the institution name
                            if i + 1 < len(non_empty):
                                name = non_empty[i + 1].upper().strip()
                                code_map[name] = cell
                            break

    return code_map


def normalize_name_for_matching(name: str) -> str:
    """Normalize bank name for fuzzy matching between BSP and AMLC lists."""
    name = name.upper()
    # Remove common suffixes/noise
    name = re.sub(r"\(A .+?\)", "", name)  # Remove "(A Thrift Bank)" etc.
    name = re.sub(r"\binc\.?\b", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\bcorp\.?\b", "", name, flags=re.IGNORECASE)
    name = re.sub(r"[^A-Z0-9 ]", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def merge_institution_codes(banks: list[dict], amlc_codes: dict[str, str]) -> int:
    """
    Match banks to AMLC institution codes by normalized name.
    Returns count of matched banks.
    """
    # Build normalized AMLC lookup
    normalized_amlc = {}
    for name, code in amlc_codes.items():
        normalized_amlc[normalize_name_for_matching(name)] = code

    matched = 0
    for bank in banks:
        norm_name = normalize_name_for_matching(bank["registration_name"])

        # Exact match on normalized name
        if norm_name in normalized_amlc:
            bank["institution_code"] = normalized_amlc[norm_name]
            matched += 1
            continue

        # Substring match (AMLC name contains BSP name or vice versa)
        for amlc_name, code in normalized_amlc.items():
            if norm_name in amlc_name or amlc_name in norm_name:
                bank["institution_code"] = code
                matched += 1
                break

    return matched


def deduplicate(banks: list[dict]) -> list[dict]:
    """
    Deduplicate by institution_code (if present) or registration_name.
    BSP data is authoritative for names; AMLC is authoritative for codes.
    """
    seen_codes: dict[str, int] = {}
    seen_names: dict[str, int] = {}
    unique = []

    for bank in banks:
        code = bank.get("institution_code", "")
        name = normalize_name_for_matching(bank["registration_name"])

        if code and code in seen_codes:
            # Update existing record if this source has more data
            continue
        if name in seen_names:
            continue

        if code:
            seen_codes[code] = len(unique)
        seen_names[name] = len(unique)
        unique.append(bank)

    return unique


def generate_fallback_code(bank: dict, index: int) -> str:
    """
    Generate a deterministic fallback code for banks without AMLC codes.
    Format: TYPE_PREFIX + zero-padded index.
    """
    prefix_map = {
        "universal_commercial": "UC",
        "thrift": "TB",
        "rural": "RB",
        "cooperative": "CB",
        "digital": "DB",
        "emi_bank": "EB",
        "emi_nonbank": "EN",
        "quasi_bank": "QB",
        "non_bank_fi": "NB",
    }
    prefix = prefix_map.get(bank["bank_type"], "XX")
    return f"{prefix}{index:04d}"


def main():
    all_banks: list[dict] = []
    log = {"parsed_counts": {}, "errors": [], "warnings": []}

    # Parse each BSP PDF
    for filename, bank_type in FILE_TYPE_MAP.items():
        pdf_path = RAW_DIR / filename
        if not pdf_path.exists():
            log["warnings"].append(f"PDF not found: {filename}")
            print(f"WARN: {filename} not found, skipping")
            continue

        if bank_type is None:
            # EMI and Quasi PDFs need special handling
            # For now, parse as generic and classify later
            # EMI: look for "EMI-Bank" vs "EMI-Non-Bank" sections
            # Quasi: look for "Quasi-Bank" vs "Non-Bank" sections
            if "emi" in filename:
                bank_type = "emi_bank"  # Default, refine in post-processing
            else:
                bank_type = "quasi_bank"  # Default, refine in post-processing

        print(f"Parsing {filename} as {bank_type}...")

        try:
            banks = parse_table_pdf(pdf_path, bank_type)
            log["parsed_counts"][filename] = len(banks)
            print(f"  Found {len(banks)} records")

            # Save per-PDF parsed output
            parsed_path = PARSED_DIR / f"{pdf_path.stem}.json"
            with open(parsed_path, "w") as f:
                json.dump(banks, f, indent=2, ensure_ascii=False)

            all_banks.extend(banks)
        except Exception as e:
            log["errors"].append(f"Failed to parse {filename}: {str(e)}")
            print(f"  ERROR: {e}")

    print(f"\nTotal parsed: {len(all_banks)} records")

    # Parse AMLC for institution codes
    amlc_path = RAW_DIR / "amlc-covered-persons.pdf"
    amlc_codes = parse_amlc(amlc_path)
    print(f"AMLC codes loaded: {len(amlc_codes)}")

    # Merge institution codes
    matched = merge_institution_codes(all_banks, amlc_codes)
    print(f"Institution codes matched: {matched}/{len(all_banks)}")
    log["amlc_matched"] = matched

    # Deduplicate
    unique_banks = deduplicate(all_banks)
    print(f"After dedup: {len(unique_banks)} records")
    log["after_dedup"] = len(unique_banks)

    # Assign fallback codes to unmatched banks
    fallback_count = 0
    for i, bank in enumerate(unique_banks):
        if not bank.get("institution_code"):
            bank["institution_code"] = generate_fallback_code(bank, i)
            fallback_count += 1

    log["fallback_codes_generated"] = fallback_count

    # Sort by bank_type then registration_name
    unique_banks.sort(key=lambda b: (b["bank_type"], b["registration_name"]))

    # Write final output
    with open(OUTPUT_FILE, "w") as f:
        json.dump(unique_banks, f, indent=2, ensure_ascii=False)
    print(f"\nWritten {len(unique_banks)} banks to {OUTPUT_FILE}")

    # Write log
    with open(LOG_FILE, "w") as f:
        json.dump(log, f, indent=2)
    print(f"ETL log written to {LOG_FILE}")

    # Report unmatched codes
    unmatched = [b for b in unique_banks if b["institution_code"].startswith(("UC", "TB", "RB", "CB", "DB", "EB", "EN", "QB", "NB"))]
    if unmatched:
        print(f"\nWARN: {len(unmatched)} banks have fallback codes (no AMLC match).")
        print("Review data/etl-log.json and manually assign codes if available.")


if __name__ == "__main__":
    main()
```

**Step 4: Run the ETL**

```bash
source .venv/bin/activate
python scripts/etl.py
```

**Step 5: Inspect output**

```bash
cat data/parsed/ukb.json | python3 -m json.tool | head -50
cat data/etl-log.json
```

**Step 6: Manual review checkpoint**

STOP HERE and review `data/parsed/*.json` for each bank type. BSP PDFs vary in structure. You will almost certainly need to adjust `parse_table_pdf()` for specific PDFs. Common issues:
- Columns in different order than expected
- Multi-line bank names merged into one cell or split across cells
- Address split across multiple columns
- EMI PDF has two sections (EMI-Bank and EMI-Non-Bank) that need different `bank_type` values

Fix parsing issues iteratively. Re-run `python scripts/etl.py` after each fix.

**Step 7: Commit**

```bash
git add scripts/etl.py scripts/requirements.txt
git commit -m "Add ETL pipeline for BSP bank directory PDFs"
```

---

## Task 4: PSGC Join

**Files:**
- Create: `scripts/psgc-join.py`
- Create: `scripts/psgc-municipalities.json` (extracted from PSGC-MCP data)

**Step 1: Extract PSGC municipality list from sibling repo**

The PSGC-MCP repo has parsed data in KV JSON files. Extract municipality/city entries into a standalone lookup file.

```bash
# From the PSGC-MCP parsed KV data, extract municipalities and cities
# Look in /home/zaraaar/command-center/PSGC-MCP/scripts/data/output/ for the KV JSON files
ls /home/zaraaar/command-center/PSGC-MCP/scripts/data/output/
```

Create a script to extract municipality names and their PSGC codes:

```python
#!/usr/bin/env python3
"""
Extract PSGC municipality/city names for fuzzy matching.
Reads KV JSON from PSGC-MCP repo, outputs a flat lookup file.
"""

import json
import re
from pathlib import Path

PSGC_KV_DIR = Path("/home/zaraaar/command-center/PSGC-MCP/scripts/data/output")
OUTPUT = Path("scripts/psgc-municipalities.json")

municipalities = []

for kv_file in sorted(PSGC_KV_DIR.glob("kv-*.json")):
    with open(kv_file) as f:
        entries = json.load(f)

    for entry in entries:
        key = entry.get("key", "")
        value = entry.get("value", "")

        if not key.startswith("entity:"):
            continue

        try:
            entity = json.loads(value) if isinstance(value, str) else value
        except (json.JSONDecodeError, TypeError):
            continue

        level = entity.get("level", "")
        if level in ("Mun", "City", "SubMun"):
            code = entity.get("code", key.replace("entity:", ""))
            name = entity.get("name", "")
            province = entity.get("province", "")
            region = entity.get("region", "")

            # Derive region and province codes from PSGC code
            # PSGC: RR PP CC BBB S (10 digits)
            region_code = code[:2] + "00000000" if len(code) == 10 else ""
            province_code = code[:4] + "000000" if len(code) == 10 else ""

            municipalities.append({
                "code": code,
                "name": name,
                "province": province,
                "region": region,
                "region_code": region_code,
                "province_code": province_code,
            })

# Sort by name
municipalities.sort(key=lambda m: m["name"])

with open(OUTPUT, "w") as f:
    json.dump(municipalities, f, indent=2, ensure_ascii=False)

print(f"Extracted {len(municipalities)} municipalities/cities to {OUTPUT}")
```

**Step 2: Create the PSGC join script**

Create `scripts/psgc-join.py`:

```python
#!/usr/bin/env python3
"""
Fuzzy-match bank head office addresses to PSGC municipality codes.
Reads data/banks.json (from ETL), enriches with PSGC codes.

Strategy:
1. Parse city/municipality name from address string
2. Normalize both sides (remove "City of", "Municipality of", etc.)
3. Exact match first, then fuzzy substring match
4. Log unmatched for manual review
"""

import json
import re
from pathlib import Path

BANKS_FILE = Path("data/banks.json")
PSGC_FILE = Path("scripts/psgc-municipalities.json")
OUTPUT_FILE = Path("data/banks.json")  # Overwrite in place
LOG_FILE = Path("data/psgc-join-log.json")


def normalize_location(name: str) -> str:
    """Normalize a location name for matching."""
    name = name.upper().strip()
    # Remove common prefixes
    name = re.sub(r"^(CITY OF|MUNICIPALITY OF|TOWN OF)\s+", "", name)
    # Remove "CITY" suffix
    name = re.sub(r"\s+CITY$", "", name)
    # Remove parenthetical
    name = re.sub(r"\s*\(.+?\)\s*", " ", name)
    # Strip non-alpha
    name = re.sub(r"[^A-Z ]", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def extract_city_from_address(address: str) -> list[str]:
    """
    Try to extract city/municipality name from a Philippine address string.

    Philippine addresses typically end with:
    "..., City/Municipality, Province" or "..., City, Metro Manila"

    Returns list of candidate location names (best guess first).
    """
    if not address:
        return []

    candidates = []

    # Split by comma
    parts = [p.strip() for p in address.split(",")]

    # Look for explicit "City" mentions
    for part in parts:
        if "city" in part.lower():
            candidates.append(part.strip())

    # Metro Manila cities
    metro_cities = [
        "Makati", "Taguig", "Pasig", "Mandaluyong", "Quezon City",
        "Manila", "Pasay", "Paranaque", "Muntinlupa", "Las Pinas",
        "Marikina", "San Juan", "Caloocan", "Malabon", "Navotas",
        "Valenzuela",
    ]
    for city in metro_cities:
        if city.lower() in address.lower():
            candidates.append(city)

    # Try second-to-last and third-to-last parts as municipality
    if len(parts) >= 2:
        candidates.append(parts[-2])
    if len(parts) >= 3:
        candidates.append(parts[-3])

    return candidates


def main():
    with open(BANKS_FILE) as f:
        banks = json.load(f)

    with open(PSGC_FILE) as f:
        psgc = json.load(f)

    # Build normalized PSGC lookup
    psgc_by_normalized = {}
    for muni in psgc:
        norm = normalize_location(muni["name"])
        # Keep first match (prefer City over Mun for common names)
        if norm not in psgc_by_normalized:
            psgc_by_normalized[norm] = muni

    matched = 0
    unmatched = []

    for bank in banks:
        address = bank.get("head_office_address", "")
        candidates = extract_city_from_address(address)

        found = False
        for candidate in candidates:
            norm = normalize_location(candidate)

            # Exact match
            if norm in psgc_by_normalized:
                muni = psgc_by_normalized[norm]
                bank["psgc_muni_code"] = muni["code"]
                bank["region_code"] = muni["region_code"]
                bank["province_code"] = muni["province_code"]
                found = True
                matched += 1
                break

            # Substring match against PSGC names
            for psgc_norm, muni in psgc_by_normalized.items():
                if norm and (norm in psgc_norm or psgc_norm in norm):
                    bank["psgc_muni_code"] = muni["code"]
                    bank["region_code"] = muni["region_code"]
                    bank["province_code"] = muni["province_code"]
                    found = True
                    matched += 1
                    break

            if found:
                break

        if not found:
            unmatched.append({
                "registration_name": bank["registration_name"],
                "address": address,
                "candidates": candidates,
            })

    # Write enriched banks
    with open(OUTPUT_FILE, "w") as f:
        json.dump(banks, f, indent=2, ensure_ascii=False)

    # Write join log
    log = {
        "total_banks": len(banks),
        "matched": matched,
        "unmatched_count": len(unmatched),
        "unmatched": unmatched,
    }
    with open(LOG_FILE, "w") as f:
        json.dump(log, f, indent=2, ensure_ascii=False)

    print(f"PSGC join: {matched}/{len(banks)} matched")
    print(f"Unmatched: {len(unmatched)} (see data/psgc-join-log.json)")


if __name__ == "__main__":
    main()
```

**Step 3: Run PSGC extraction then join**

```bash
source .venv/bin/activate
python scripts/psgc-join.py
```

**Step 4: Review unmatched**

```bash
cat data/psgc-join-log.json | python3 -m json.tool
```

Expect ~5-10% unmatched, mostly rural bank addresses with non-standard formatting. You can manually fix these in `data/banks.json` or improve the address parsing heuristics.

**Step 5: Commit**

```bash
git add scripts/psgc-join.py data/banks.json data/etl-log.json data/psgc-join-log.json
git commit -m "Add PSGC join pipeline for bank head office addresses"
```

---

## Task 5: Response Helpers

**Files:**
- Create: `src/response.ts`

Reference: `/home/zaraaar/command-center/PSGC-MCP/src/response.ts`

**Step 1: Write the response module**

```typescript
import type { ApiMeta, Env } from "./types.js";

export function buildMeta(env: Env): ApiMeta {
  return {
    dataset_version: env.DATASET_VERSION,
    dataset_date: env.DATASET_DATE,
    last_synced: env.LAST_SYNCED,
    source: "Bangko Sentral ng Pilipinas (BSP)",
    source_url: "https://www.bsp.gov.ph/SitePages/financialstability/Directories.aspx",
  };
}

export function wrapResponse<T>(data: T, meta: ApiMeta) {
  return {
    _meta: meta,
    data,
  };
}

export function wrapPaginatedResponse<T>(
  data: T,
  meta: ApiMeta,
  pagination: { total: number; offset: number; limit: number; has_more: boolean }
) {
  return {
    _meta: meta,
    data,
    pagination,
  };
}

export function toolResult(data: unknown, meta: ApiMeta) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(wrapResponse(data, meta), null, 2),
      },
    ],
  };
}

export function toolPaginatedResult(
  data: unknown,
  meta: ApiMeta,
  pagination: { total: number; offset: number; limit: number; has_more: boolean }
) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(wrapPaginatedResponse(data, meta, pagination), null, 2),
      },
    ],
  };
}

export function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}
```

**Step 2: Commit**

```bash
git add src/response.ts
git commit -m "Add response envelope and tool result helpers"
```

---

## Task 6: Data Loader and Search Logic

**Files:**
- Create: `src/data.ts`
- Create: `test/data.test.ts`

**Step 1: Write the failing test**

Create `test/data.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { searchBanks, getBankByCode, listByType, listByLocation, getBankStats } from "../src/data.js";
import type { Bank } from "../src/types.js";

const MOCK_BANKS: Bank[] = [
  {
    institution_code: "001",
    registration_name: "BDO Unibank Inc.",
    trade_name: "BDO",
    bank_type: "universal_commercial",
    status: "active",
    head_office_address: "7899 Makati Avenue, Makati City",
    psgc_muni_code: "1376000000",
    region_code: "1300000000",
    province_code: "1376000000",
    date_sourced: "2026-03-12",
    source_document: "ukb.pdf",
  },
  {
    institution_code: "002",
    registration_name: "Bank of the Philippine Islands",
    trade_name: "BPI",
    bank_type: "universal_commercial",
    status: "active",
    head_office_address: "Ayala Avenue, Makati City",
    psgc_muni_code: "1376000000",
    region_code: "1300000000",
    province_code: "1376000000",
    date_sourced: "2026-03-12",
    source_document: "ukb.pdf",
  },
  {
    institution_code: "003",
    registration_name: "Tonik Digital Bank Inc.",
    bank_type: "digital",
    status: "active",
    head_office_address: "Taguig City",
    psgc_muni_code: "1376300000",
    region_code: "1300000000",
    province_code: "1376000000",
    date_sourced: "2026-03-12",
    source_document: "digital.pdf",
  },
  {
    institution_code: "004",
    registration_name: "Rural Bank of Closed Town",
    bank_type: "rural",
    status: "closed",
    head_office_address: "Some Province",
    psgc_muni_code: "0400100000",
    region_code: "0400000000",
    province_code: "0400100000",
    date_sourced: "2026-03-12",
    source_document: "rural.pdf",
  },
];

describe("searchBanks", () => {
  it("finds banks by partial name match", () => {
    const results = searchBanks(MOCK_BANKS, { query: "BDO" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].registration_name).toContain("BDO");
  });

  it("finds banks by trade name", () => {
    const results = searchBanks(MOCK_BANKS, { query: "BPI" });
    expect(results.length).toBe(1);
    expect(results[0].registration_name).toContain("Philippine Islands");
  });

  it("filters by bank_type", () => {
    const results = searchBanks(MOCK_BANKS, { query: "Bank", bank_type: "digital" });
    expect(results.length).toBe(1);
    expect(results[0].bank_type).toBe("digital");
  });

  it("defaults to active banks only", () => {
    const results = searchBanks(MOCK_BANKS, { query: "Rural Bank" });
    expect(results.length).toBe(0); // closed bank excluded
  });

  it("can include non-active banks with status filter", () => {
    const results = searchBanks(MOCK_BANKS, { query: "Rural Bank", status: "closed" });
    expect(results.length).toBe(1);
  });

  it("scores exact matches higher than substring matches", () => {
    const results = searchBanks(MOCK_BANKS, { query: "BDO Unibank" });
    expect(results[0].institution_code).toBe("001");
  });
});

describe("getBankByCode", () => {
  it("returns bank by institution code", () => {
    const bank = getBankByCode(MOCK_BANKS, "001");
    expect(bank).toBeDefined();
    expect(bank!.registration_name).toBe("BDO Unibank Inc.");
  });

  it("returns undefined for unknown code", () => {
    expect(getBankByCode(MOCK_BANKS, "999")).toBeUndefined();
  });
});

describe("listByType", () => {
  it("lists all active banks of a type", () => {
    const results = listByType(MOCK_BANKS, { bank_type: "universal_commercial" });
    expect(results.length).toBe(2);
  });

  it("can filter by status", () => {
    const results = listByType(MOCK_BANKS, { bank_type: "rural", status: "closed" });
    expect(results.length).toBe(1);
  });
});

describe("listByLocation", () => {
  it("lists banks by municipality PSGC code", () => {
    const results = listByLocation(MOCK_BANKS, { psgc_code: "1376000000" });
    expect(results.length).toBe(2); // BDO and BPI in Makati
  });

  it("lists banks by region code (partial match)", () => {
    const results = listByLocation(MOCK_BANKS, { psgc_code: "1300000000" });
    expect(results.length).toBe(3); // All NCR banks
  });

  it("filters by bank_type within location", () => {
    const results = listByLocation(MOCK_BANKS, { psgc_code: "1300000000", bank_type: "digital" });
    expect(results.length).toBe(1);
  });
});

describe("getBankStats", () => {
  it("returns counts by type", () => {
    const stats = getBankStats(MOCK_BANKS);
    expect(stats.by_type.universal_commercial).toBe(2);
    expect(stats.by_type.digital).toBe(1);
    expect(stats.by_type.rural).toBe(1);
  });

  it("returns active vs inactive counts", () => {
    const stats = getBankStats(MOCK_BANKS);
    expect(stats.total_active).toBe(3);
    expect(stats.total_closed).toBe(1);
  });

  it("returns total count", () => {
    const stats = getBankStats(MOCK_BANKS);
    expect(stats.total).toBe(4);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run test/data.test.ts
```

Expected: FAIL (module not found)

**Step 3: Create src/data.ts**

```typescript
import type { Bank, BankType, BankStatus } from "./types.js";

/**
 * Normalize text for search: lowercase, strip diacritics, collapse whitespace.
 * Matches PSGC-MCP's normalization approach.
 */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface SearchParams {
  query: string;
  bank_type?: BankType;
  status?: BankStatus;
}

export function searchBanks(banks: Bank[], params: SearchParams): Bank[] {
  const { query, bank_type, status = "active" } = params;
  const normalizedQuery = normalize(query);

  const scored: { bank: Bank; score: number }[] = [];

  for (const bank of banks) {
    // Status filter
    if (bank.status !== status) continue;

    // Bank type filter
    if (bank_type && bank.bank_type !== bank_type) continue;

    const normName = normalize(bank.registration_name);
    const normTrade = bank.trade_name ? normalize(bank.trade_name) : "";

    let score = 0;

    // Exact match (after normalization)
    if (normName === normalizedQuery || normTrade === normalizedQuery) {
      score = 3;
    }
    // Prefix match
    else if (normName.startsWith(normalizedQuery) || normTrade.startsWith(normalizedQuery)) {
      score = 2;
    }
    // Substring match
    else if (normName.includes(normalizedQuery) || normTrade.includes(normalizedQuery)) {
      score = 1;
    }

    if (score > 0) {
      scored.push({ bank, score });
    }
  }

  // Sort by score desc, then name asc
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.bank.registration_name.localeCompare(b.bank.registration_name);
  });

  return scored.map((s) => s.bank);
}

export function getBankByCode(banks: Bank[], code: string): Bank | undefined {
  return banks.find((b) => b.institution_code === code);
}

interface ListByTypeParams {
  bank_type: BankType;
  status?: BankStatus;
}

export function listByType(banks: Bank[], params: ListByTypeParams): Bank[] {
  const { bank_type, status = "active" } = params;
  return banks.filter((b) => b.bank_type === bank_type && b.status === status);
}

interface ListByLocationParams {
  psgc_code: string;
  bank_type?: BankType;
}

export function listByLocation(banks: Bank[], params: ListByLocationParams): Bank[] {
  const { psgc_code, bank_type } = params;

  return banks.filter((b) => {
    // Default to active
    if (b.status !== "active") return false;

    // Bank type filter
    if (bank_type && b.bank_type !== bank_type) return false;

    // PSGC matching: region (2-digit prefix), province (4-digit), municipality (exact)
    // Determine match level from the code format
    const isRegionCode = psgc_code.endsWith("00000000");
    const isProvinceCode = !isRegionCode && psgc_code.endsWith("000000");

    if (isRegionCode) {
      return b.region_code === psgc_code;
    } else if (isProvinceCode) {
      return b.province_code === psgc_code;
    } else {
      return b.psgc_muni_code === psgc_code;
    }
  });
}

interface BankStats {
  total: number;
  total_active: number;
  total_closed: number;
  by_type: Record<string, number>;
  by_region: Record<string, number>;
  by_status: Record<string, number>;
}

export function getBankStats(banks: Bank[]): BankStats {
  const by_type: Record<string, number> = {};
  const by_region: Record<string, number> = {};
  const by_status: Record<string, number> = {};

  for (const bank of banks) {
    by_type[bank.bank_type] = (by_type[bank.bank_type] || 0) + 1;
    by_status[bank.status] = (by_status[bank.status] || 0) + 1;

    if (bank.region_code) {
      by_region[bank.region_code] = (by_region[bank.region_code] || 0) + 1;
    }
  }

  return {
    total: banks.length,
    total_active: banks.filter((b) => b.status === "active").length,
    total_closed: banks.filter((b) => b.status !== "active").length,
    by_type,
    by_region,
    by_status,
  };
}
```

**Step 4: Run tests**

```bash
npx vitest run test/data.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/data.ts test/data.test.ts
git commit -m "Add data query functions with search scoring"
```

---

## Task 7: MCP Tool Definitions

**Files:**
- Create: `src/tools.ts`

Reference: `/home/zaraaar/command-center/PSGC-MCP/src/index.ts` (tool registration pattern)

**Step 1: Create tool definitions**

```typescript
import { z } from "zod";
import type { McpServer } from "agents/mcp";
import type { Bank, Env } from "./types.js";
import { searchBanks, getBankByCode, listByType, listByLocation, getBankStats } from "./data.js";
import { buildMeta, toolResult, toolPaginatedResult, toolError } from "./response.js";

const BankTypeSchema = z.enum([
  "universal_commercial",
  "thrift",
  "rural",
  "cooperative",
  "digital",
  "emi_bank",
  "emi_nonbank",
  "quasi_bank",
  "non_bank_fi",
]);

const StatusSchema = z.enum(["active", "closed", "under_receivership", "merged"]);

export function registerTools(server: McpServer, banks: Bank[], env: Env) {
  const meta = buildMeta(env);

  // 1. Search banks by name (fuzzy)
  server.tool(
    "search_banks",
    "Search Philippine banks by name. Fuzzy matches against registration name and trade name. Returns active banks by default.",
    {
      query: z.string().describe("Bank name to search for, e.g. 'BDO' or 'Rural Bank of Sagay'"),
      bank_type: BankTypeSchema.optional().describe("Filter by bank type"),
      status: StatusSchema.optional().describe("Filter by status. Default: 'active'"),
      limit: z.number().min(1).max(100).optional().describe("Max results to return. Default: 20"),
      offset: z.number().min(0).optional().describe("Results offset for pagination. Default: 0"),
    },
    async ({ query, bank_type, status, limit = 20, offset = 0 }) => {
      const results = searchBanks(banks, { query, bank_type, status });
      const page = results.slice(offset, offset + limit);

      return toolPaginatedResult(page, meta, {
        total: results.length,
        offset,
        limit,
        has_more: offset + limit < results.length,
      });
    }
  );

  // 2. Get bank by institution code
  server.tool(
    "get_bank",
    "Look up a specific bank by its BSP/AMLC institution code.",
    {
      institution_code: z.string().describe("BSP/AMLC institution code, e.g. '001'"),
    },
    async ({ institution_code }) => {
      const bank = getBankByCode(banks, institution_code);
      if (!bank) {
        return toolError(`Bank not found with institution code: ${institution_code}`);
      }
      return toolResult(bank, meta);
    }
  );

  // 3. List banks by type
  server.tool(
    "list_banks_by_type",
    "List all banks of a specific type (e.g. all digital banks, all rural banks). Returns active banks by default.",
    {
      bank_type: BankTypeSchema.describe("Type of bank to list"),
      status: StatusSchema.optional().describe("Filter by status. Default: 'active'"),
      limit: z.number().min(1).max(100).optional().describe("Max results. Default: 50"),
      offset: z.number().min(0).optional().describe("Pagination offset. Default: 0"),
    },
    async ({ bank_type, status, limit = 50, offset = 0 }) => {
      const results = listByType(banks, { bank_type, status });
      const page = results.slice(offset, offset + limit);

      return toolPaginatedResult(page, meta, {
        total: results.length,
        offset,
        limit,
        has_more: offset + limit < results.length,
      });
    }
  );

  // 4. List banks by location (PSGC-based)
  server.tool(
    "list_banks_by_location",
    "List banks by location using PSGC codes. Accepts region code (e.g. '1300000000' for NCR), province code, or municipality code. Use the psgc-mcp server to look up PSGC codes.",
    {
      psgc_code: z.string().length(10).describe("10-digit PSGC code: region, province, or municipality"),
      bank_type: BankTypeSchema.optional().describe("Filter by bank type"),
      limit: z.number().min(1).max(100).optional().describe("Max results. Default: 50"),
      offset: z.number().min(0).optional().describe("Pagination offset. Default: 0"),
    },
    async ({ psgc_code, bank_type, limit = 50, offset = 0 }) => {
      const results = listByLocation(banks, { psgc_code, bank_type });
      const page = results.slice(offset, offset + limit);

      return toolPaginatedResult(page, meta, {
        total: results.length,
        offset,
        limit,
        has_more: offset + limit < results.length,
      });
    }
  );

  // 5. Get bank stats summary
  server.tool(
    "get_bank_stats",
    "Get summary statistics of the Philippine banking directory: counts by type, region, status.",
    {},
    async () => {
      const stats = getBankStats(banks);
      return toolResult(stats, meta);
    }
  );
}
```

**Step 2: Commit**

```bash
git add src/tools.ts
git commit -m "Add MCP tool definitions for bank directory"
```

---

## Task 8: MCP Server Entry Point

**Files:**
- Create: `src/index.ts`

Reference: `/home/zaraaar/command-center/PSGC-MCP/src/index.ts` (McpAgent pattern)

**Step 1: Create the entry point**

```typescript
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Env } from "./types.js";
import type { Bank } from "./types.js";
import { registerTools } from "./tools.js";

// Static import of bank data — bundled into the worker at build time
import banksData from "../data/banks.json";

const banks: Bank[] = banksData as Bank[];

export class BSPBanksMCP extends McpAgent<Env> {
  server = new McpServer({
    name: "BSP Bank Directory",
    version: "1.0.0",
  });

  async init() {
    registerTools(this.server, banks, this.env);
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/mcp") {
      return BSPBanksMCP.serve("/mcp").fetch(request, env, ctx);
    }

    // Health check / landing page
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(
        JSON.stringify({
          name: "BSP Bank Directory MCP",
          version: "1.0.0",
          description:
            "Philippine banking directory from BSP with PSGC location support",
          mcp_endpoint: "/mcp",
          tools: [
            "search_banks",
            "get_bank",
            "list_banks_by_type",
            "list_banks_by_location",
            "get_bank_stats",
          ],
          source: "Bangko Sentral ng Pilipinas (BSP)",
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response("Not Found", { status: 404 });
  },
};
```

**Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Fix any type errors. Common issue: the JSON import may need `resolveJsonModule: true` in tsconfig (already set in Task 1).

**Step 3: Test locally with wrangler**

```bash
npx wrangler dev
```

Then in another terminal:

```bash
curl http://localhost:8787/
curl http://localhost:8787/mcp
```

The root endpoint should return the server info JSON. The `/mcp` endpoint handles MCP protocol (won't return useful output from a raw curl, but shouldn't error).

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "Add MCP server entry point with Cloudflare Worker"
```

---

## Task 9: Vitest Configuration

**Files:**
- Create: `vitest.config.ts`

**Step 1: Create vitest config**

Reference: `/home/zaraaar/command-center/PSGC-MCP/vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "~": "/src",
    },
  },
});
```

**Step 2: Run all tests**

```bash
npx vitest run
```

Expected: All tests from Task 6 pass.

**Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "Add vitest configuration"
```

---

## Task 10: Update Checker Script

**Files:**
- Create: `scripts/check-updates.sh`
- Create: `data/checksums.json`

**Step 1: Create initial checksums file**

After the ETL completes and PDFs are in `data/raw/`, generate checksums:

```bash
cd data/raw && sha256sum *.pdf > ../checksums.txt && cd ../..
```

**Step 2: Create update checker**

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "BSP Bank Directory — Update Checker"
echo "===================================="

CHECKSUM_FILE="data/checksums.txt"
TEMP_DIR=$(mktemp -d)

# Re-download PDFs to temp dir
# (reuse the download logic from scripts/download-pdfs.sh)
source scripts/download-pdfs.sh "$TEMP_DIR" 2>/dev/null || true

# Compare checksums
changed=0
for pdf in "$TEMP_DIR"/*.pdf; do
  filename=$(basename "$pdf")
  new_hash=$(sha256sum "$pdf" | awk '{print $1}')
  old_hash=$(grep "$filename" "$CHECKSUM_FILE" 2>/dev/null | awk '{print $1}' || echo "none")

  if [ "$new_hash" != "$old_hash" ]; then
    echo "CHANGED: $filename"
    changed=$((changed + 1))
  else
    echo "OK: $filename"
  fi
done

rm -rf "$TEMP_DIR"

if [ $changed -gt 0 ]; then
  echo ""
  echo "$changed file(s) changed. Re-run ETL pipeline:"
  echo "  python scripts/etl.py"
  echo "  python scripts/psgc-join.py"
  echo "  # Review data/banks.json diff before deploying"
else
  echo ""
  echo "No changes detected."
fi
```

**Step 3: Commit**

```bash
git add scripts/check-updates.sh
git commit -m "Add BSP PDF update checker script"
```

---

## Task 11: README

**Files:**
- Create: `README.md`

**Step 1: Write README**

Follow the same format as PSGC-MCP's README. Include:

1. What it is (one-paragraph summary)
2. MCP client config JSON block (copy-paste ready)
3. Available tools table with parameters
4. Example queries showing each tool
5. Data sources section
6. How to update data
7. Development section (clone, install, dev, test, deploy)
8. Differentiators (PSGC join, all bank types, status field, open-source)

Reference: `/home/zaraaar/command-center/PSGC-MCP/README.md`

**Step 2: Commit**

```bash
git add README.md
git commit -m "Add README with tool docs and setup instructions"
```

---

## Task 12: Final Verification

**Step 1: Run full test suite**

```bash
npm test
```

**Step 2: Type check**

```bash
npx tsc --noEmit
```

**Step 3: Local smoke test**

```bash
npx wrangler dev
# In another terminal, test the MCP endpoint with a tool call
```

**Step 4: Verify data integrity**

```bash
# Check banks.json has expected structure
node -e "const d = require('./data/banks.json'); console.log('Total:', d.length); const types = {}; d.forEach(b => types[b.bank_type] = (types[b.bank_type]||0)+1); console.log(types);"
```

**Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "Final cleanup and verification"
```

---

## Build Order Summary

| Task | What | Depends On |
|------|------|------------|
| 1 | Project scaffolding | Nothing |
| 2 | Download source PDFs | Nothing |
| 3 | ETL: Parse PDFs to JSON | Tasks 1, 2 |
| 4 | PSGC join | Task 3 |
| 5 | Response helpers | Task 1 |
| 6 | Data loader + search logic + tests | Tasks 1, 5 |
| 7 | MCP tool definitions | Tasks 5, 6 |
| 8 | MCP server entry point | Tasks 6, 7 |
| 9 | Vitest config | Task 1 |
| 10 | Update checker script | Task 2 |
| 11 | README | All above |
| 12 | Final verification | All above |

**Parallelizable:** Tasks 2 + 5 can run in parallel with Task 1. Tasks 9 + 10 can run anytime after Task 1.

**Critical path:** Tasks 1 → 2 → 3 → 4 → 6 → 7 → 8 → 12

---

## Known Gotchas for the Implementing Session

1. **BSP PDF URLs may be wrong.** The attachment numbers in the download script are guesses. Verify by visiting the BSP Directories page manually. If curl fails, download PDFs via browser.

2. **PDF table parsing will need iteration.** The `parse_table_pdf()` function is a generic starting point. Each PDF has different column layouts. Expect to run the ETL, inspect output, fix parser, repeat 3-5 times.

3. **EMI PDF has two sections** (EMI-Banks and EMI-Non-Banks). The parser needs to detect which section a record falls in and assign the correct `bank_type`. Look for section headers in the PDF text.

4. **PSGC KV data format.** The extraction script in Task 4 Step 1 assumes PSGC-MCP's KV JSON has `entity:CODE` keys with JSON-stringified values containing `level`, `name`, `province`, `region` fields. Verify by inspecting one KV JSON file first.

5. **Zod version.** PSGC-MCP uses Zod v4 (`^4.3.6`). LTS-MCP uses Zod v3. The import path and some APIs differ between versions. Use v4 to match PSGC-MCP.

6. **The `agents` package** provides `McpAgent`. The import is `from "agents/mcp"`. The `McpServer` comes from `@modelcontextprotocol/sdk/server/mcp.js`. Check PSGC-MCP's actual imports if this doesn't resolve.

7. **Static JSON import in Cloudflare Workers** requires `resolveJsonModule: true` in tsconfig and the JSON file must exist at build time. The `data/banks.json` file must be generated by the ETL before `wrangler dev` or `wrangler deploy` will work.

8. **Don't deploy until /run-premerge passes.** This is Build Mode, so premerge is recommended but not mandatory. But do run tests and typecheck before deploying.
