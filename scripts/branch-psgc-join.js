#!/usr/bin/env node
/**
 * Branch PSGC Join: match BSP branch office locations to PSGC municipality codes.
 *
 * Reads:  data/branches.json (from fetch-bsp-api.js)
 *         PSGC-MCP KV data (sibling repo)
 * Writes: data/branches.json (enriched in place)
 *         data/branch-psgc-join-log.json
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const PSGC_KV_DIR =
  process.env.PSGC_KV_DIR ||
  new URL("../../PSGC-MCP/scripts/data/output", import.meta.url).pathname;
const BRANCHES_FILE = "data/branches.json";
const LOG_FILE = "data/branch-psgc-join-log.json";

// ---------------------------------------------------------------------------
// Load PSGC entities
// ---------------------------------------------------------------------------

function loadPSGC() {
  const municipalities = [];
  const provinces = [];
  const files = readdirSync(PSGC_KV_DIR).filter(
    (f) => f.startsWith("kv-") && f.endsWith(".json"),
  );

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(PSGC_KV_DIR, file), "utf-8"));
    for (const entry of data) {
      if (!entry.key.startsWith("entity:")) continue;
      const entity =
        typeof entry.value === "string" ? JSON.parse(entry.value) : entry.value;
      if (["City", "Mun", "SubMun"].includes(entity.level)) {
        municipalities.push({
          code: entity.code,
          name: entity.name,
          level: entity.level,
          regionCode: entity.regionCode || "",
          provinceCode: entity.provinceCode || "",
        });
      }
      if (entity.level === "Prov") {
        provinces.push({
          code: entity.code,
          name: entity.name,
          regionCode: entity.regionCode || "",
        });
      }
    }
  }

  return { municipalities, provinces };
}

// ---------------------------------------------------------------------------
// Text normalization
// ---------------------------------------------------------------------------

function normalize(text) {
  return text
    .toUpperCase()
    // Replace Ñ with N before stripping non-ASCII (BSP uses N where PSGC uses Ñ)
    .replace(/Ñ/g, "N")
    .replace(/\bSTA\.\s*/g, "SANTA ")
    .replace(/\bSTO\.\s*/g, "SANTO ")
    .replace(/\bSTA\b/g, "SANTA")
    .replace(/\bSTO\b/g, "SANTO")
    .replace(/^(CITY OF|MUNICIPALITY OF|TOWN OF)\s+/i, "")
    .replace(/\s+CITY$/i, "")
    .replace(/\s*\(.+?\)\s*/g, " ")
    .replace(/\b\d{4,5}\b/g, "")
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// BSP town names that don't match PSGC after normalization.
// Key: normalized BSP town name. Value: PSGC municipality code.
const TOWN_ALIASES = {
  BALIUAG: "0301403000",           // BSP: BALIUAG -> PSGC: City of Baliwag
  CORDOBA: "0702220000",           // BSP: CORDOBA -> PSGC: Cordova (Cebu)
  "VILLA VERDE": "0205014000",     // BSP: VILLA VERDE -> PSGC: Villaverde
  TALUGTOG: "0304931000",          // BSP: TALUGTOG -> PSGC: Talugtug
  "SAN REMEGIO": "0600614000",     // BSP: SAN REMEGIO -> PSGC: San Remigio (Antique)
  "GEN TINIO": "0304910000",       // BSP: GEN TINIO (PAPAYA) -> PSGC: General Tinio
  BACUNGAN: "0907226000",          // BSP: BACUNGAN (LEON T. POSTIGO) -> PSGC: Leon T. Postigo
  "SCIENCE CITY OF MUNOZ": "0304917000", // Stripped "CITY OF" prefix causes mismatch
  "PRES CARLOS P GARCIA": "0701235000", // BSP abbreviates "President"
};

// ---------------------------------------------------------------------------
// NCR: Manila city districts -> City of Manila
// ---------------------------------------------------------------------------

const MANILA_DISTRICTS = new Set([
  "BINONDO",
  "ERMITA",
  "INTRAMUROS",
  "MALATE",
  "PACO",
  "PANDACAN",
  "PORT AREA",
  "QUIAPO",
  "SAMPALOC",
  "SAN MIGUEL",
  "SAN NICOLAS",
  "SANTA ANA",
  "SANTA CRUZ",
  "TONDO",
]);

// NCR city code lookup by normalized name
const NCR_CITY_CODES = {
  CALOOCAN: "1380100000",
  "LAS PINAS": "1380200000",
  MAKATI: "1380300000",
  MALABON: "1380400000",
  MANDALUYONG: "1380500000",
  MANILA: "1380600000",
  MARIKINA: "1380700000",
  MUNTINLUPA: "1380800000",
  NAVOTAS: "1380900000",
  PARANAQUE: "1381000000",
  PASAY: "1381100000",
  PASIG: "1381200000",
  "QUEZON CITY": "1381300000", // keep as-is because normalize strips "CITY"
  "SAN JUAN": "1381400000",
  TAGUIG: "1381500000",
  VALENZUELA: "1381600000",
  PATEROS: "1381701000",
};

// BSP province field -> NCR city code (for "1ST DIST M.M." style provinces)
const NCR_PROVINCE_TO_CITY = {
  "1ST DIST M.M. (CITY OF MANILA)": "1380600000", // Manila
};

// BSP 4th-district towns are identified by town name directly.
// 2nd and 3rd district towns also match by town name.
// Only ambiguous case: province says "1ST DIST" -> always Manila.

// ---------------------------------------------------------------------------
// BSP region name -> PSGC region code mapping
// ---------------------------------------------------------------------------

const BSP_REGION_TO_PSGC = {
  "NATIONAL CAPITAL REGION": "1300000000",
  "CORDILLERA ADM. REGION": "1400000000",
  "ILOCOS REGION": "0100000000",
  "CAGAYAN VALLEY": "0200000000",
  "CENTRAL LUZON": "0300000000",
  CALABARZON: "0400000000",
  MIMAROPA: "1700000000",
  "BICOL REGION": "0500000000",
  "WESTERN VISAYAS": "0600000000",
  "CENTRAL VISAYAS": "0700000000",
  "EASTERN VISAYAS": "0800000000",
  "ZAMBOANGA PENINSULA": "0900000000",
  "NORTHERN MINDANAO": "1000000000",
  "DAVAO REGION": "1100000000",
  SOCCSKSARGEN: "1200000000",
  CARAGA: "1600000000",
  "BANGSAMORO AUTONOMOUS REGION FOR MUSLIM MINDANAO": "1900000000",
};

// ---------------------------------------------------------------------------
// Normalize the BSP "town" field to a PSGC-matchable name
// ---------------------------------------------------------------------------

function normalizeTown(town) {
  if (!town) return "";
  let t = town.toUpperCase().trim();

  // Replace Ñ with N before stripping non-ASCII
  t = t.replace(/Ñ/g, "N");

  // Strip parenthetical suffixes: (CITY DIST.), (CITY/CAPITAL), (CITY), (CAPITAL), (DADIANGAS), (TULONG), etc.
  t = t.replace(/\s*\(.*?\)\s*/g, " ").trim();

  // Strip "CITY OF" prefix (but preserve "SCIENCE CITY OF" pattern)
  if (/^CITY OF\s+/i.test(t)) {
    t = t.replace(/^CITY OF\s+/i, "").trim();
  }

  // Strip trailing "CITY" (but not from e.g. "SCIENCE CITY OF MUNOZ")
  t = t.replace(/\s+CITY$/i, "").trim();

  // Expand abbreviations
  t = t.replace(/\bSTA\.\s*/g, "SANTA ");
  t = t.replace(/\bSTO\.\s*/g, "SANTO ");
  t = t.replace(/\bSTA\b/g, "SANTA");
  t = t.replace(/\bSTO\b/g, "SANTO");

  // Remove non-alpha characters
  t = t.replace(/[^A-Z0-9 ]/g, "");
  t = t.replace(/\s+/g, " ").trim();

  return t;
}

// ---------------------------------------------------------------------------
// Derive province code from municipality code
// ---------------------------------------------------------------------------

function deriveProvinceCode(muni) {
  if (muni.provinceCode) return muni.provinceCode;
  return muni.code.substring(0, 5) + "00000";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log("Loading PSGC data...");
  const { municipalities: psgc, provinces: psgcProvinces } = loadPSGC();
  console.log(`  Loaded ${psgc.length} municipalities/cities`);
  console.log(`  Loaded ${psgcProvinces.length} provinces`);

  // Build normalized lookup: normName -> array of matching munis
  // (multiple munis can share the same normalized name)
  const psgcByNorm = new Map();
  for (const muni of psgc) {
    const norm = normalize(muni.name);
    if (!psgcByNorm.has(norm)) {
      psgcByNorm.set(norm, []);
    }
    psgcByNorm.get(norm).push(muni);
  }

  // Build a code -> muni lookup for direct code-based resolution
  const psgcByCode = new Map();
  for (const muni of psgc) {
    psgcByCode.set(muni.code, muni);
  }

  // Build province lookup: normName -> province entity
  const provByNorm = new Map();
  for (const prov of psgcProvinces) {
    const norm = normalize(prov.name);
    provByNorm.set(norm, prov);
  }

  // Build province code -> province entity
  const provByCode = new Map();
  for (const prov of psgcProvinces) {
    provByCode.set(prov.code, prov);
  }

  console.log("Loading branches...");
  const branches = JSON.parse(readFileSync(BRANCHES_FILE, "utf-8"));
  console.log(`  Loaded ${branches.length} branches`);

  let matched = 0;
  let matchedNCR = 0;
  let matchedDirect = 0;
  let matchedDisambiguated = 0;
  let matchedFallback = 0;
  const unmatched = [];

  for (const branch of branches) {
    const town = branch.town || "";
    const province = branch.province || "";
    const region = branch.region || "";

    // Skip overseas and NULL-region branches
    if (
      ["ASIA", "MIDDLE EAST ASIA", "EUROPE", "NORTH AMERICA", "NULL"].includes(
        region,
      )
    ) {
      continue;
    }

    const isNCR = region === "NATIONAL CAPITAL REGION";
    const normTown = normalizeTown(town);
    let found = false;

    // ------------------------------------------------------------------
    // Strategy 1: NCR fast path
    // ------------------------------------------------------------------
    if (isNCR) {
      let cityCode = null;

      // Check if the town (after stripping CITY DIST.) is a Manila district
      if (MANILA_DISTRICTS.has(normTown)) {
        cityCode = NCR_CITY_CODES["MANILA"];
      }

      // Check if it matches an NCR city directly
      if (!cityCode && NCR_CITY_CODES[normTown]) {
        cityCode = NCR_CITY_CODES[normTown];
      }

      // Special case: "QUEZON CITY" normalizes to "QUEZON" which would
      // collide with Quezon province munis. Check original town field.
      if (!cityCode && /QUEZON\s*CITY/i.test(town)) {
        cityCode = NCR_CITY_CODES["QUEZON CITY"];
      }

      // Fallback: try extracting city from province field
      // e.g., "1ST DIST M.M. (CITY OF MANILA)" -> Manila
      if (!cityCode && NCR_PROVINCE_TO_CITY[province]) {
        cityCode = NCR_PROVINCE_TO_CITY[province];
      }

      if (cityCode) {
        const muni = psgcByCode.get(cityCode);
        if (muni) {
          branch.psgc_muni_code = muni.code;
          branch.region_code = muni.regionCode;
          branch.province_code = deriveProvinceCode(muni);
          found = true;
          matched++;
          matchedNCR++;
        }
      }
    }

    if (found) continue;

    // ------------------------------------------------------------------
    // Strategy 1b: Hardcoded alias lookup for known BSP/PSGC mismatches
    // ------------------------------------------------------------------
    if (normTown && TOWN_ALIASES[normTown]) {
      const muni = psgcByCode.get(TOWN_ALIASES[normTown]);
      if (muni) {
        branch.psgc_muni_code = muni.code;
        branch.region_code = muni.regionCode;
        branch.province_code = deriveProvinceCode(muni);
        found = true;
        matched++;
        matchedDirect++;
      }
    }

    if (found) continue;

    // ------------------------------------------------------------------
    // Strategy 2: Direct normalized match against PSGC names
    // ------------------------------------------------------------------
    if (normTown) {
      // Also try s/z spelling variants (e.g., DASMARINAS vs DASMARIÑAS)
      const variants = [
        normTown,
        normTown.replace(/S/g, "Z"),
        normTown.replace(/Z/g, "S"),
      ];

      for (const variant of variants) {
        const candidates = psgcByNorm.get(variant);
        if (!candidates) continue;

        if (candidates.length === 1) {
          // Single match: use it directly
          const muni = candidates[0];
          branch.psgc_muni_code = muni.code;
          branch.region_code = muni.regionCode;
          branch.province_code = deriveProvinceCode(muni);
          found = true;
          matched++;
          matchedDirect++;
          break;
        }

        // Multiple matches: disambiguate by province
        if (candidates.length > 1) {
          const muni = disambiguateByProvince(
            candidates,
            province,
            region,
            provByNorm,
            provByCode,
          );
          if (muni) {
            branch.psgc_muni_code = muni.code;
            branch.region_code = muni.regionCode;
            branch.province_code = deriveProvinceCode(muni);
            found = true;
            matched++;
            matchedDisambiguated++;
            break;
          }
        }
      }
    }

    if (found) continue;

    // ------------------------------------------------------------------
    // Strategy 3: Substring / fuzzy match
    // ------------------------------------------------------------------
    if (normTown && normTown.length >= 4) {
      const substringMatches = [];
      for (const [psgcNorm, muniList] of psgcByNorm) {
        if (psgcNorm.includes(normTown) || normTown.includes(psgcNorm)) {
          for (const muni of muniList) {
            // Skip SubMun for substring matches (too likely to be false positives)
            if (muni.level !== "SubMun") {
              substringMatches.push(muni);
            }
          }
        }
      }

      if (substringMatches.length === 1) {
        const muni = substringMatches[0];
        branch.psgc_muni_code = muni.code;
        branch.region_code = muni.regionCode;
        branch.province_code = deriveProvinceCode(muni);
        found = true;
        matched++;
        matchedFallback++;
      } else if (substringMatches.length > 1) {
        const muni = disambiguateByProvince(
          substringMatches,
          province,
          region,
          provByNorm,
          provByCode,
        );
        if (muni) {
          branch.psgc_muni_code = muni.code;
          branch.region_code = muni.regionCode;
          branch.province_code = deriveProvinceCode(muni);
          found = true;
          matched++;
          matchedFallback++;
        }
      }
    }

    if (!found) {
      unmatched.push({
        id: branch.id,
        institution_name: branch.institution_name,
        branch_name: branch.branch_name,
        town,
        province,
        region,
      });
    }
  }

  // Write enriched branches
  writeFileSync(BRANCHES_FILE, JSON.stringify(branches, null, 2));

  // Count branches that are in-scope (excluding overseas/NULL)
  const overseasRegions = new Set([
    "ASIA",
    "MIDDLE EAST ASIA",
    "EUROPE",
    "NORTH AMERICA",
    "NULL",
  ]);
  const inScope = branches.filter((b) => !overseasRegions.has(b.region)).length;

  // Write log
  const log = {
    total_branches: branches.length,
    in_scope: inScope,
    overseas_skipped: branches.length - inScope,
    matched,
    unmatched_count: unmatched.length,
    match_rate: `${((matched / inScope) * 100).toFixed(1)}%`,
    breakdown: {
      ncr_fast_path: matchedNCR,
      direct_match: matchedDirect,
      disambiguated: matchedDisambiguated,
      substring_fallback: matchedFallback,
    },
    unmatched,
  };
  writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));

  console.log(
    `\nBranch PSGC join: ${matched}/${inScope} matched (${log.match_rate})`,
  );
  console.log(`  NCR fast path: ${matchedNCR}`);
  console.log(`  Direct match: ${matchedDirect}`);
  console.log(`  Disambiguated: ${matchedDisambiguated}`);
  console.log(`  Substring fallback: ${matchedFallback}`);
  console.log(`  Overseas/NULL skipped: ${branches.length - inScope}`);
  console.log(`  Unmatched: ${unmatched.length} (see ${LOG_FILE})`);
}

// ---------------------------------------------------------------------------
// Disambiguate multiple PSGC candidates using the BSP province/region fields
// ---------------------------------------------------------------------------

function disambiguateByProvince(
  candidates,
  bspProvince,
  bspRegion,
  provByNorm,
  provByCode,
) {
  // Normalize BSP province for comparison
  const normBspProv = normalize(bspProvince);

  // Try matching the BSP province name to a PSGC province entity
  const psgcProv = provByNorm.get(normBspProv);

  if (psgcProv) {
    // Filter candidates whose provinceCode matches the resolved PSGC province
    const provMatches = candidates.filter(
      (m) => m.provinceCode === psgcProv.code,
    );
    if (provMatches.length === 1) return provMatches[0];
    // If multiple still match by province, prefer City over Mun
    if (provMatches.length > 1) {
      const city = provMatches.find((m) => m.level === "City");
      if (city) return city;
      return provMatches[0];
    }
  }

  // Try matching by region: map BSP region name to PSGC region code
  const psgcRegionCode = BSP_REGION_TO_PSGC[bspRegion];
  if (psgcRegionCode) {
    const regionMatches = candidates.filter(
      (m) => m.regionCode === psgcRegionCode,
    );
    if (regionMatches.length === 1) return regionMatches[0];
    if (regionMatches.length > 1) {
      // Further narrow: check if BSP province text is a substring of any
      // PSGC province name for these candidates
      for (const muni of regionMatches) {
        const muniProv = provByCode.get(muni.provinceCode);
        if (muniProv) {
          const normMuniProv = normalize(muniProv.name);
          if (
            normBspProv.includes(normMuniProv) ||
            normMuniProv.includes(normBspProv)
          ) {
            return muni;
          }
        }
      }
      // Still ambiguous within same region: prefer City over Mun
      const city = regionMatches.find((m) => m.level === "City");
      if (city) return city;
      return regionMatches[0];
    }
  }

  // Last resort: prefer City over Mun among all candidates
  const city = candidates.find((m) => m.level === "City");
  if (city) return city;
  return candidates[0];
}

main();
