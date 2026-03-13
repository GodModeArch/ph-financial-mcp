#!/usr/bin/env node
/**
 * Fetch all BSP Financial Service Access Points (FSAP) - branch-level data.
 * ~38K records with geocoordinates, ATM/microfinance flags.
 *
 * Source: BSP SharePoint API
 * Output: data/branches-raw.json, data/branches.json
 */

import { writeFileSync, mkdirSync } from "fs";

const BSP_DOMAIN = "https://www.bsp.gov.ph";
const FSAP_URL = `${BSP_DOMAIN}/_api/web/lists/getbytitle('FSAP')/items?$select=Title,BusinessAddress,Province,Region,Town,Industry,wATM,wMicrofinance,Latitude,Longitude,Id&$top=5000&$orderby=Id%20asc`;

const HEADERS = {
  Accept: "application/json;odata=verbose",
  "User-Agent": "BSP-Bank-Directory-ETL/1.0",
};

function stripHtml(value) {
  if (!value || typeof value !== "string") return value;
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchJSON(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText} for ${url}`);
  }
  return res.json();
}

async function fetchAllPages(baseUrl) {
  const allItems = [];
  let url = baseUrl;
  let page = 0;

  while (url) {
    page++;
    console.log(`  Page ${page}: ${url.substring(0, 80)}...`);
    const data = await fetchJSON(url);

    const results = data.d?.results || [];
    allItems.push(...results);
    console.log(`    Got ${results.length} items (total: ${allItems.length})`);

    // Validate __next URL stays on BSP domain
    const nextUrl = data.d?.__next || null;
    if (nextUrl && !nextUrl.startsWith(BSP_DOMAIN)) {
      console.warn(`    Skipping unexpected pagination URL: ${nextUrl}`);
      url = null;
    } else {
      url = nextUrl;
    }
  }

  return allItems;
}

/**
 * Split "INSTITUTION NAME -BRANCH NAME" into parts.
 * Patterns observed:
 *   "BDO UNIBANK - MAKATI MAIN"
 *   "CTBC BANK (PHILIPPINES) -BINONDO"
 *   "RURAL BANK OF SAGAY - HEAD OFFICE"
 *   "BDO UNIBANK" (head office, no separator)
 */
function splitTitle(title) {
  if (!title) return { institution_name: "", branch_name: "" };

  // Try splitting on " - " or " -" (with or without trailing space)
  const dashIdx = title.search(/\s+-\s*(?=[A-Z0-9])/);
  if (dashIdx > 0) {
    return {
      institution_name: title.substring(0, dashIdx).trim(),
      branch_name: title.substring(dashIdx).replace(/^\s*-\s*/, "").trim(),
    };
  }

  // No branch separator found - likely head office
  return { institution_name: title.trim(), branch_name: "HEAD OFFICE" };
}

// Philippine bounding box for coordinate validation
const PH_BBOX = { latMin: 4.5, latMax: 21.5, lngMin: 116.0, lngMax: 127.0 };

function validateCoords(lat, lng) {
  if (lat == null || lng == null) return { latitude: null, longitude: null, coords_valid: false };
  const inPH = lat >= PH_BBOX.latMin && lat <= PH_BBOX.latMax &&
               lng >= PH_BBOX.lngMin && lng <= PH_BBOX.lngMax;
  return { latitude: lat, longitude: lng, coords_valid: inPH };
}

function transformBranch(item) {
  const { institution_name, branch_name } = splitTitle(item.Title);
  const { latitude, longitude, coords_valid } = validateCoords(item.Latitude, item.Longitude);

  return {
    id: String(item.Id),
    institution_name,
    branch_name,
    industry: item.Industry || "",
    address: stripHtml(item.BusinessAddress) || "",
    town: (item.Town || "").trim(),
    province: (item.Province || "").trim(),
    region: (item.Region || "").trim(),
    latitude: coords_valid ? latitude : null,
    longitude: coords_valid ? longitude : null,
    has_atm: Boolean(item.wATM),
  };
}

async function main() {
  mkdirSync("data", { recursive: true });

  console.log("Fetching FSAP (Financial Service Access Points)...");
  const raw = await fetchAllPages(FSAP_URL);

  console.log(`\nSaving ${raw.length} raw records...`);
  writeFileSync("data/branches-raw.json", JSON.stringify(raw, null, 2));

  // Transform
  const branches = raw.map(transformBranch);

  // Also count invalid coordinates from raw data for logging
  let invalidCoords = 0;
  for (const item of raw) {
    const { coords_valid } = validateCoords(item.Latitude, item.Longitude);
    if (!coords_valid && item.Latitude != null) invalidCoords++;
  }

  // Stats
  const byIndustry = {};
  const byRegion = {};
  let withCoords = 0;
  let withATM = 0;
  const uniqueInstitutions = new Set();

  for (const b of branches) {
    byIndustry[b.industry] = (byIndustry[b.industry] || 0) + 1;
    byRegion[b.region] = (byRegion[b.region] || 0) + 1;
    if (b.latitude && b.longitude) withCoords++;
    if (b.has_atm) withATM++;
    uniqueInstitutions.add(b.institution_name);
  }

  console.log(`\nTransformed ${branches.length} access points:`);
  console.log(`  Unique institutions: ${uniqueInstitutions.size}`);
  console.log(`  Invalid coordinates (outside PH bbox, nulled out): ${invalidCoords}`);
  console.log(`  With coordinates: ${withCoords}`);
  console.log(`  With ATM: ${withATM}`);
  console.log(`\nBy industry:`);
  for (const [ind, count] of Object.entries(byIndustry).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ind}: ${count}`);
  }
  console.log(`\nBy region (top 10):`);
  const regionEntries = Object.entries(byRegion).sort((a, b) => b[1] - a[1]);
  for (const [reg, count] of regionEntries.slice(0, 10)) {
    console.log(`  ${reg}: ${count}`);
  }

  writeFileSync("data/branches.json", JSON.stringify(branches, null, 2));

  const etlLog = {
    fetched_at: new Date().toISOString(),
    source: "BSP SharePoint API - FSAP list",
    total_raw: raw.length,
    total_transformed: branches.length,
    unique_institutions: uniqueInstitutions.size,
    invalid_coordinates_nulled: invalidCoords,
    with_coordinates: withCoords,
    with_atm: withATM,
    by_industry: byIndustry,
    by_region: byRegion,
  };
  writeFileSync("data/branches-etl-log.json", JSON.stringify(etlLog, null, 2));

  console.log("\nDone. Output files:");
  console.log("  data/branches.json          - Transformed branch data");
  console.log("  data/branches-raw.json      - Raw API response");
  console.log("  data/branches-etl-log.json  - ETL log");
}

main().catch((err) => {
  console.error("Branch ETL failed:", err);
  process.exit(1);
});
