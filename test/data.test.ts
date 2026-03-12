import { describe, it, expect } from "vitest";
import { searchBanks, getBankByCode, listByType, listByLocation, getBankStats } from "../src/data.js";
import type { Bank } from "../src/types.js";

const MOCK_BANKS: Bank[] = [
  {
    institution_code: "001",
    registration_name: "BDO Unibank Inc.",
    trade_name: "BDO",
    bank_type: "universal_commercial",
    bsp_type_id: 1,
    bsp_type_id2: 2,
    bsp_type_id3: 3,
    status: "active",
    head_office_address: "7899 Makati Avenue, Makati City",
    psgc_muni_code: "1376000000",
    region_code: "1300000000",
    province_code: "1376000000",
    date_sourced: "2026-03-12",
    source_document: "bsp-sharepoint-api",
  },
  {
    institution_code: "002",
    registration_name: "Bank of the Philippine Islands",
    trade_name: "BPI",
    bank_type: "universal_commercial",
    bsp_type_id: 1,
    bsp_type_id2: 2,
    bsp_type_id3: 3,
    status: "active",
    head_office_address: "Ayala Avenue, Makati City",
    psgc_muni_code: "1376000000",
    region_code: "1300000000",
    province_code: "1376000000",
    date_sourced: "2026-03-12",
    source_document: "bsp-sharepoint-api",
  },
  {
    institution_code: "003",
    registration_name: "Tonik Digital Bank Inc.",
    bank_type: "digital",
    bsp_type_id: 14,
    bsp_type_id2: 14,
    bsp_type_id3: 14,
    status: "active",
    head_office_address: "Taguig City",
    psgc_muni_code: "1376300000",
    region_code: "1300000000",
    province_code: "1376000000",
    date_sourced: "2026-03-12",
    source_document: "bsp-sharepoint-api",
  },
  {
    institution_code: "004",
    registration_name: "Rural Bank of Closed Town",
    bank_type: "rural",
    bsp_type_id: 11,
    bsp_type_id2: 12,
    bsp_type_id3: 12,
    status: "closed",
    head_office_address: "Some Province",
    psgc_muni_code: "0400100000",
    region_code: "0400000000",
    province_code: "0400100000",
    date_sourced: "2026-03-12",
    source_document: "bsp-sharepoint-api",
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
    expect(results.length).toBe(0);
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
  it("lists banks by province PSGC code", () => {
    // 1376000000 ends with 000000, so treated as province-level match
    const results = listByLocation(MOCK_BANKS, { psgc_code: "1376000000" });
    expect(results.length).toBe(3); // BDO, BPI (Makati), Tonik (Taguig) all in same province
  });

  it("lists banks by municipality PSGC code", () => {
    const results = listByLocation(MOCK_BANKS, { psgc_code: "1376300000" });
    expect(results.length).toBe(1); // Only Tonik in Taguig
  });

  it("lists banks by region code (partial match)", () => {
    const results = listByLocation(MOCK_BANKS, { psgc_code: "1300000000" });
    expect(results.length).toBe(3);
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
