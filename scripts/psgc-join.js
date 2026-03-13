#!/usr/bin/env node
/**
 * PSGC Join: Fuzzy-match bank head office addresses to PSGC municipality codes.
 *
 * Reads:  data/banks.json (from fetch-bsp-api.js)
 *         PSGC-MCP KV data (sibling repo)
 * Writes: data/banks.json (enriched in place)
 *         data/psgc-join-log.json
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const PSGC_KV_DIR = process.env.PSGC_KV_DIR || new URL("../../PSGC-MCP/scripts/data/output", import.meta.url).pathname;
const BANKS_FILE = "data/banks.json";
const LOG_FILE = "data/psgc-join-log.json";

// Load PSGC municipalities and cities
function loadPSGC() {
  const municipalities = [];
  const files = readdirSync(PSGC_KV_DIR).filter((f) => f.startsWith("kv-") && f.endsWith(".json"));

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(PSGC_KV_DIR, file), "utf-8"));
    for (const entry of data) {
      if (!entry.key.startsWith("entity:")) continue;
      const entity = typeof entry.value === "string" ? JSON.parse(entry.value) : entry.value;
      if (["City", "Mun", "SubMun"].includes(entity.level)) {
        municipalities.push({
          code: entity.code,
          name: entity.name,
          level: entity.level,
          regionCode: entity.regionCode || "",
          provinceCode: entity.provinceCode || "",
        });
      }
    }
  }

  return municipalities;
}

function normalize(text) {
  return text
    .toUpperCase()
    // Expand common PH abbreviations
    .replace(/\bSTA\.\s*/g, "SANTA ")
    .replace(/\bSTO\.\s*/g, "SANTO ")
    .replace(/\bSTA\b/g, "SANTA")
    .replace(/\bSTO\b/g, "SANTO")
    .replace(/^(CITY OF|MUNICIPALITY OF|TOWN OF)\s+/i, "")
    .replace(/\s+CITY$/i, "")
    .replace(/\s*\(.+?\)\s*/g, " ")
    // Strip zip codes
    .replace(/\b\d{4,5}\b/g, "")
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Known Metro Manila cities - 2024 Census PSGC codes (138x series)
// Order matters: more specific aliases first, MANILA last to avoid
// "Metro Manila" in addresses matching before the actual city.
const METRO_ALIASES = {
  "BONIFACIO GLOBAL": "1381500000", // BGC -> Taguig
  "QUEZON CITY": "1381300000",
  "LAS PINAS": "1380200000",
  "LAS PIÑAS": "1380200000",
  "SAN JUAN": "1381400000",
  "PARAÑAQUE": "1381000000",
  MAKATI: "1380300000",
  TAGUIG: "1381500000",
  PASIG: "1381200000",
  MANDALUYONG: "1380500000",
  PASAY: "1381100000",
  PARANAQUE: "1381000000",
  MUNTINLUPA: "1380800000",
  MARIKINA: "1380700000",
  CALOOCAN: "1380100000",
  MALABON: "1380400000",
  NAVOTAS: "1380900000",
  VALENZUELA: "1381600000",
  PATEROS: "1381701000",
  MANILA: "1380600000", // Last: avoids "Metro Manila" matching before specific cities
};

function extractCityCandidates(address) {
  if (!address) return [];
  const candidates = [];

  // Split by comma
  const parts = address.split(",").map((p) => p.trim());

  // Look for explicit "City" mentions
  for (const part of parts) {
    if (/city/i.test(part)) {
      candidates.push(part);
    }
  }

  // Check Metro Manila aliases
  const upperAddr = address.toUpperCase();
  for (const [alias] of Object.entries(METRO_ALIASES)) {
    if (upperAddr.includes(alias)) {
      candidates.push(alias);
    }
  }

  // Try second-to-last and third-to-last comma-separated parts
  if (parts.length >= 2) candidates.push(parts[parts.length - 2]);
  if (parts.length >= 3) candidates.push(parts[parts.length - 3]);
  if (parts.length >= 1) candidates.push(parts[parts.length - 1]);

  return candidates;
}

// Derive province code from municipality code when PSGC data has null provinceCode.
// Works for standard PSGC structure: first 5 digits identify the province.
function deriveProvinceCode(muni) {
  if (muni.provinceCode) return muni.provinceCode;
  return muni.code.substring(0, 5) + "00000";
}

function main() {
  console.log("Loading PSGC data...");
  const psgc = loadPSGC();
  console.log(`  Loaded ${psgc.length} municipalities/cities`);

  // Build normalized lookup
  const psgcByNorm = new Map();
  for (const muni of psgc) {
    const norm = normalize(muni.name);
    // Prefer City over Mun for duplicate names
    if (!psgcByNorm.has(norm) || muni.level === "City") {
      psgcByNorm.set(norm, muni);
    }
  }

  console.log("Loading banks...");
  const banks = JSON.parse(readFileSync(BANKS_FILE, "utf-8"));
  console.log(`  Loaded ${banks.length} banks`);

  let matched = 0;
  const unmatched = [];

  for (const bank of banks) {
    const address = bank.head_office_address || "";

    // Check Metro Manila aliases first (fast path)
    const upperAddr = address.toUpperCase();
    let found = false;
    for (const [alias, code] of Object.entries(METRO_ALIASES)) {
      if (upperAddr.includes(alias)) {
        const muni = psgc.find((m) => m.code === code);
        if (muni) {
          bank.psgc_muni_code = muni.code;
          bank.region_code = muni.regionCode;
          bank.province_code = deriveProvinceCode(muni);
          found = true;
          matched++;
          break;
        }
      }
    }
    if (found) continue;

    // Try candidate extraction
    const candidates = extractCityCandidates(address);
    for (const candidate of candidates) {
      const norm = normalize(candidate);
      if (!norm) continue;

      // Exact match (also try common spelling variants: s/z swap)
      const variants = [norm, norm.replace(/S/g, "Z"), norm.replace(/Z/g, "S")];
      const exactMatch = variants.find((v) => psgcByNorm.has(v));
      if (exactMatch) {
        const muni = psgcByNorm.get(exactMatch);
        bank.psgc_muni_code = muni.code;
        bank.region_code = muni.regionCode;
        bank.province_code = deriveProvinceCode(muni);
        found = true;
        matched++;
        break;
      }

      // Substring match: PSGC name contains candidate or vice versa
      // Collect all matches and disambiguate by checking if the address mentions
      // the province or region of any match
      const substringMatches = [];
      for (const [psgcNorm, muni] of psgcByNorm) {
        if (norm.length >= 4 && (psgcNorm.includes(norm) || norm.includes(psgcNorm))) {
          substringMatches.push(muni);
        }
      }
      if (substringMatches.length === 1) {
        const muni = substringMatches[0];
        bank.psgc_muni_code = muni.code;
        bank.region_code = muni.regionCode;
        bank.province_code = deriveProvinceCode(muni);
        found = true;
        matched++;
      } else if (substringMatches.length > 1) {
        // Disambiguate: check if address mentions a province that narrows it down
        const normAddr = normalize(address);
        const provinceMatch = substringMatches.find((m) => {
          // Look for province name in the address to disambiguate
          const provMunis = psgc.filter((p) => p.code === m.provinceCode);
          if (provMunis.length > 0) {
            const provName = normalize(provMunis[0].name);
            return normAddr.includes(provName);
          }
          return false;
        });
        const pick = provinceMatch || substringMatches[0];
        bank.psgc_muni_code = pick.code;
        bank.region_code = pick.regionCode;
        bank.province_code = deriveProvinceCode(pick);
        found = true;
        matched++;
      }
      if (found) break;
    }

    if (!found) {
      unmatched.push({
        registration_name: bank.registration_name,
        address,
        candidates,
      });
    }
  }

  // Write enriched banks
  writeFileSync(BANKS_FILE, JSON.stringify(banks, null, 2));

  // Write log
  const log = {
    total_banks: banks.length,
    matched,
    unmatched_count: unmatched.length,
    match_rate: `${((matched / banks.length) * 100).toFixed(1)}%`,
    unmatched,
  };
  writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));

  console.log(`\nPSGC join: ${matched}/${banks.length} matched (${log.match_rate})`);
  console.log(`Unmatched: ${unmatched.length} (see ${LOG_FILE})`);
}

main();
