import { describe, it, expect } from "vitest";
import { searchBanks, getBankByCode, listByType, listByLocation, getBankStats, getBankingDensity, findUnderbankedAreas } from "../src/data.js";
import type { Bank, PopulationLookup } from "../src/types.js";

const MOCK_BANKS: Bank[] = [
  {
    institution_code: "001",
    registration_name: "BDO Unibank Inc.",
    trade_name: "BDO",
    bank_type: "universal_commercial",
    bsp_type_id: "1",
    bsp_type_id2: "2",
    bsp_type_id3: "3",
    status: "active",
    head_office_address: "7899 Makati Avenue, Makati City",
    psgc_muni_code: "1376001000",
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
    bsp_type_id: "1",
    bsp_type_id2: "2",
    bsp_type_id3: "3",
    status: "active",
    head_office_address: "Ayala Avenue, Makati City",
    psgc_muni_code: "1376001000",
    region_code: "1300000000",
    province_code: "1376000000",
    date_sourced: "2026-03-12",
    source_document: "bsp-sharepoint-api",
  },
  {
    institution_code: "003",
    registration_name: "Tonik Digital Bank Inc.",
    bank_type: "digital",
    bsp_type_id: "14",
    bsp_type_id2: "14",
    bsp_type_id3: "14",
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
    bsp_type_id: "11",
    bsp_type_id2: "12",
    bsp_type_id3: "12",
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
    // 1376000000 ends with 000000 (not 00000000), treated as province code
    // All 3 active mock banks share province_code "1376000000"
    const results = listByLocation(MOCK_BANKS, { psgc_code: "1376000000" });
    expect(results.length).toBe(3);
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
    expect(stats.total_inactive).toBe(1);
  });

  it("returns total count", () => {
    const stats = getBankStats(MOCK_BANKS);
    expect(stats.total).toBe(4);
  });
});

// --- Banking density tests ---

const MOCK_POPULATION: PopulationLookup = {
  "1300000000": {
    name: "National Capital Region (NCR)",
    level: "Reg",
    population: 14001751,
    region_code: "1300000000",
    province_code: null,
  },
  "1376001000": {
    name: "City of Makati",
    level: "City",
    population: 309770,
    region_code: "1300000000",
    province_code: "1376000000",
  },
  "1376300000": {
    name: "City of Taguig",
    level: "City",
    population: 966940,
    region_code: "1300000000",
    province_code: "1376000000",
  },
  "0400000000": {
    name: "CALABARZON",
    level: "Reg",
    population: 16195042,
    region_code: "0400000000",
    province_code: null,
  },
  "0400100000": {
    name: "Batangas",
    level: "Prov",
    population: 2908945,
    region_code: "0400000000",
    province_code: "0400100000",
  },
};

describe("getBankingDensity", () => {
  it("returns density for a region", () => {
    const result = getBankingDensity(MOCK_BANKS, MOCK_POPULATION, { psgc_code: "1300000000" });
    expect(result).not.toBeNull();
    expect(result!.area_name).toBe("National Capital Region (NCR)");
    expect(result!.population).toBe(14001751);
    expect(result!.bank_count).toBe(3);
    expect(result!.population_per_bank).toBe(Math.round(14001751 / 3));
    expect(result!.by_type.universal_commercial).toBe(2);
    expect(result!.by_type.digital).toBe(1);
    expect(result!.data_notes.length).toBeGreaterThan(0);
  });

  it("returns density for a municipality", () => {
    const result = getBankingDensity(MOCK_BANKS, MOCK_POPULATION, { psgc_code: "1376300000" });
    expect(result).not.toBeNull();
    expect(result!.area_name).toBe("City of Taguig");
    expect(result!.bank_count).toBe(1);
    expect(result!.population_per_bank).toBe(966940);
  });

  it("filters by bank_type", () => {
    const result = getBankingDensity(MOCK_BANKS, MOCK_POPULATION, {
      psgc_code: "1300000000",
      bank_type: "digital",
    });
    expect(result!.bank_count).toBe(1);
    expect(result!.population_per_bank).toBe(14001751);
  });

  it("returns null for population_per_bank when no banks in area", () => {
    const result = getBankingDensity(MOCK_BANKS, MOCK_POPULATION, { psgc_code: "0400000000" });
    expect(result).not.toBeNull();
    expect(result!.bank_count).toBe(0);
    expect(result!.population_per_bank).toBeNull();
  });

  it("returns null for unknown PSGC code", () => {
    const result = getBankingDensity(MOCK_BANKS, MOCK_POPULATION, { psgc_code: "9999900000" });
    expect(result).toBeNull();
  });

  it("aggregates province population from child municipalities", () => {
    // Province code 1376000000 is not directly in MOCK_POPULATION,
    // but two cities (Makati, Taguig) have province_code = "1376000000"
    const result = getBankingDensity(MOCK_BANKS, MOCK_POPULATION, { psgc_code: "1376000000" });
    expect(result).not.toBeNull();
    expect(result!.population).toBe(309770 + 966940);
    expect(result!.bank_count).toBe(3);
  });
});

describe("findUnderbankedAreas", () => {
  it("ranks regions by population per bank (most underbanked first)", () => {
    const results = findUnderbankedAreas(MOCK_BANKS, MOCK_POPULATION, { level: "region" });
    expect(results.length).toBe(2);
    // CALABARZON has 0 banks (closed one excluded), so it should be first
    expect(results[0].psgc_code).toBe("0400000000");
    expect(results[0].bank_count).toBe(0);
    expect(results[0].population_per_bank).toBe(16195042);
    // NCR has 3 banks
    expect(results[1].psgc_code).toBe("1300000000");
    expect(results[1].bank_count).toBe(3);
  });

  it("filters by bank_type", () => {
    const results = findUnderbankedAreas(MOCK_BANKS, MOCK_POPULATION, {
      level: "region",
      bank_type: "digital",
    });
    // NCR has 1 digital bank, CALABARZON has 0
    expect(results[0].psgc_code).toBe("0400000000");
    expect(results[1].bank_count).toBe(1);
  });

  it("respects limit parameter", () => {
    const results = findUnderbankedAreas(MOCK_BANKS, MOCK_POPULATION, { level: "region", limit: 1 });
    expect(results.length).toBe(1);
  });
});
