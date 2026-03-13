#!/usr/bin/env node
/**
 * Fetch all BSP-supervised institutions from BSP SharePoint API.
 * Paginates through results (100 per page) and saves to data/banks-raw.json.
 *
 * Also fetches the Financial Institution type mapping.
 */

import { writeFileSync, mkdirSync } from "fs";

const BASE_URL = "https://www.bsp.gov.ph/_api/web/lists/getbytitle";
const INSTITUTIONS_URL = `${BASE_URL}('Institutions')/items?$select=Id,Title,InstitutionTypeID,InstitutionTypeID2,InstitutionTypeID3,Website,Email,Fax,Contact,President,Authority,Address,NumOffice&$top=5000&$orderby=Title%20asc`;
const TYPES_URL = `${BASE_URL}('Financial%20Institution')/items?$select=Code,Title&$top=5000&$orderby=Code%20asc`;

const HEADERS = {
  Accept: "application/json;odata=verbose",
  "User-Agent": "BSP-Bank-Directory-ETL/1.0",
};

// Type ID to our bank_type mapping
const TYPE_MAP = {
  1: "universal_commercial", // Universal & Commercial Banks
  2: "universal_commercial", // Universal Banks (subcategory)
  3: "universal_commercial", // Private Domestic UBs
  4: "universal_commercial", // Government UBs
  5: "universal_commercial", // Branches of Foreign Banks (UBs)
  6: "universal_commercial", // Commercial Banks (KBs)
  7: "universal_commercial", // Private Domestic KBs
  8: "universal_commercial", // Subsidiaries of Foreign Banks (KBs)
  9: "universal_commercial", // Branches of Foreign Banks (KBs)
  10: "thrift",
  11: "rural", // Rural & Cooperative (default to rural, refine with type_id2)
  12: "rural",
  13: "cooperative",
  14: "digital",
  16: "universal_commercial", // Offshore Banking Units
  17: "universal_commercial", // Representative Offices
  18: "quasi_bank",
  19: "quasi_bank", // Financing Company (FCQB)
  20: "quasi_bank", // Investment House (IHQB)
  21: "quasi_bank", // Other Non-Banks (With Quasi-Banking)
  22: "non_bank_fi",
  23: "non_bank_fi", // NSSLAs
  24: "non_bank_fi", // AAB Forex Corporation
  25: "non_bank_fi", // Credit Card Company
  26: "non_bank_fi", // Financing Company (without QB)
  27: "non_bank_fi", // Government NBFI
  28: "non_bank_fi", // Investment Company
  29: "non_bank_fi", // Investment House (without QB)
  30: "non_bank_fi", // Lending Investor
  31: "non_bank_fi", // Remittance Agent
  32: "non_bank_fi", // Securities Dealer/Broker
  33: "non_bank_fi", // Trust Corporation
};

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

  while (url) {
    console.log(`Fetching: ${url.substring(0, 100)}...`);
    const data = await fetchJSON(url);

    const results = data.d?.results || [];
    allItems.push(...results);
    console.log(`  Got ${results.length} items (total: ${allItems.length})`);

    // SharePoint pagination: validate __next URL stays on BSP domain
    const nextUrl = data.d?.__next || null;
    if (nextUrl && !nextUrl.startsWith("https://www.bsp.gov.ph/")) {
      console.warn(`  Skipping unexpected pagination URL: ${nextUrl}`);
      url = null;
    } else {
      url = nextUrl;
    }
  }

  return allItems;
}

function stripHtml(value) {
  if (!value || typeof value !== "string") return value;
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function mapBankType(typeId, typeId2) {
  // Use typeId2 for more specific classification (e.g., rural vs cooperative)
  if (TYPE_MAP[typeId2]) {
    return TYPE_MAP[typeId2];
  }
  return TYPE_MAP[typeId] || "non_bank_fi";
}

function transformInstitution(item) {
  const typeId = item.InstitutionTypeID;
  const typeId2 = item.InstitutionTypeID2;
  const typeId3 = item.InstitutionTypeID3;

  return {
    // BSP SharePoint list item ID. Stable across ETL runs.
    institution_code: String(item.Id),
    registration_name: item.Title || "",
    bank_type: mapBankType(typeId, typeId2),
    bsp_type_id: typeId,
    bsp_type_id2: typeId2,
    bsp_type_id3: typeId3,
    // BSP API does not provide status. All fetched institutions are assumed active.
    // Cross-reference BSP closure/receivership PDFs for accurate status.
    status: "active",
    head_office_address: item.Address || "",
    contact_person: stripHtml(item.President) || undefined,
    contact_title: stripHtml(item.Authority) || undefined,
    contact_email: stripHtml(item.Email) || undefined,
    contact_phone: stripHtml(item.Contact) || undefined,
    website: stripHtml(item.Website) || undefined,
    fax: stripHtml(item.Fax) || undefined,
    num_offices: item.NumOffice || undefined,
    date_sourced: "2026-03-12",
    source_document: "bsp-sharepoint-api",
  };
}

async function main() {
  mkdirSync("data", { recursive: true });

  // Fetch type mapping first
  console.log("Fetching institution type mapping...");
  const types = await fetchAllPages(TYPES_URL);
  const typeMap = {};
  for (const t of types) {
    typeMap[t.Code] = t.Title;
  }
  writeFileSync("data/bsp-types.json", JSON.stringify(typeMap, null, 2));
  console.log(`Saved ${Object.keys(typeMap).length} type codes\n`);

  // Fetch all institutions
  console.log("Fetching all institutions...");
  const raw = await fetchAllPages(INSTITUTIONS_URL);
  writeFileSync("data/institutions-raw.json", JSON.stringify(raw, null, 2));
  console.log(`\nSaved ${raw.length} raw institution records\n`);

  // Transform to our schema
  const banks = raw.map((item) => transformInstitution(item));

  // Sort by bank_type then name
  banks.sort((a, b) => {
    if (a.bank_type !== b.bank_type) return a.bank_type.localeCompare(b.bank_type);
    return a.registration_name.localeCompare(b.registration_name);
  });

  writeFileSync("data/banks.json", JSON.stringify(banks, null, 2));

  // Stats
  const byType = {};
  for (const b of banks) {
    byType[b.bank_type] = (byType[b.bank_type] || 0) + 1;
  }
  console.log(`Transformed ${banks.length} institutions:`);
  for (const [type, count] of Object.entries(byType).sort()) {
    console.log(`  ${type}: ${count}`);
  }

  writeFileSync(
    "data/etl-log.json",
    JSON.stringify(
      {
        fetched_at: new Date().toISOString(),
        source: "BSP SharePoint API",
        total_raw: raw.length,
        total_transformed: banks.length,
        by_type: byType,
        type_mapping: typeMap,
      },
      null,
      2
    )
  );

  console.log("\nDone. Output files:");
  console.log("  data/banks.json          - Transformed bank data");
  console.log("  data/institutions-raw.json - Raw API response");
  console.log("  data/bsp-types.json      - Type code mapping");
  console.log("  data/etl-log.json        - ETL log");
}

main().catch((err) => {
  console.error("ETL failed:", err);
  process.exit(1);
});
