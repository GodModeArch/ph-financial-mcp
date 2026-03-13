import { describe, it, expect } from "vitest";
import {
  searchBranches,
  buildBranchIndex,
  getBranchById,
  getCoverage,
  findUnbankedAreas,
  findUnderservedAreas,
  getInstitutionFootprint,
  compareCoverage,
} from "../src/branch-data.js";
import type { Branch, PopulationLookup } from "../src/types.js";

const MOCK_BRANCHES: Branch[] = [
  {
    id: "1",
    institution_name: "BDO UNIBANK",
    branch_name: "MAKATI MAIN",
    industry: "BANK",
    address: "Ayala Ave, Makati",
    town: "MAKATI CITY",
    province: "4TH DISTRICT METRO MANILA",
    region: "NATIONAL CAPITAL REGION",
    psgc_muni_code: "1380300000",
    region_code: "1300000000",
    province_code: "1380000000",
    latitude: 14.5547,
    longitude: 121.0244,
    has_atm: true,
  },
  {
    id: "2",
    institution_name: "BDO UNIBANK",
    branch_name: "TAGUIG BGC",
    industry: "BANK",
    address: "BGC, Taguig",
    town: "TAGUIG CITY",
    province: "4TH DISTRICT METRO MANILA",
    region: "NATIONAL CAPITAL REGION",
    psgc_muni_code: "1381500000",
    region_code: "1300000000",
    province_code: "1381000000",
    latitude: 14.5539,
    longitude: 121.0469,
    has_atm: true,
  },
  {
    id: "3",
    institution_name: "METROBANK",
    branch_name: "CEBU MAIN",
    industry: "BANK",
    address: "Cebu City",
    town: "CEBU CITY",
    province: "CEBU",
    region: "CENTRAL VISAYAS",
    psgc_muni_code: "0700600000",
    region_code: "0700000000",
    province_code: "0700600000",
    latitude: 10.3157,
    longitude: 123.8854,
    has_atm: true,
  },
  {
    id: "4",
    institution_name: "BDO UNIBANK",
    branch_name: "ATM GREENBELT",
    industry: "ATM ONLY",
    address: "Greenbelt, Makati",
    town: "MAKATI CITY",
    province: "4TH DISTRICT METRO MANILA",
    region: "NATIONAL CAPITAL REGION",
    psgc_muni_code: "1380300000",
    region_code: "1300000000",
    province_code: "1380000000",
    latitude: 14.5520,
    longitude: 121.0215,
    has_atm: true,
  },
  {
    id: "5",
    institution_name: "COOP SAVINGS ASSN",
    branch_name: "HEAD OFFICE",
    industry: "NSSLA",
    address: "Quezon City",
    town: "QUEZON CITY",
    province: "2ND DISTRICT METRO MANILA",
    region: "NATIONAL CAPITAL REGION",
    psgc_muni_code: "1381300000",
    region_code: "1300000000",
    province_code: "1381000000",
    latitude: null,
    longitude: null,
    has_atm: false,
  },
  {
    id: "6",
    institution_name: "RURAL BANK OF SAGAY",
    branch_name: "HEAD OFFICE",
    industry: "BANK",
    address: "Sagay, Negros Occidental",
    town: "SAGAY CITY",
    province: "NEGROS OCCIDENTAL",
    region: "WESTERN VISAYAS",
    psgc_muni_code: "0604530000",
    region_code: "0600000000",
    province_code: "0604500000",
    latitude: 10.9450,
    longitude: 123.0190,
    has_atm: false,
  },
];

const MOCK_POPULATION: PopulationLookup = {
  "1300000000": {
    name: "National Capital Region (NCR)",
    level: "Reg",
    population: 14001751,
    region_code: "1300000000",
    province_code: null,
  },
  "1380300000": {
    name: "City of Makati",
    level: "City",
    population: 309770,
    region_code: "1300000000",
    province_code: "1380000000",
  },
  "1381500000": {
    name: "City of Taguig",
    level: "City",
    population: 966940,
    region_code: "1300000000",
    province_code: "1381000000",
  },
  "1381300000": {
    name: "Quezon City",
    level: "City",
    population: 2960048,
    region_code: "1300000000",
    province_code: "1381000000",
  },
  "0700000000": {
    name: "Central Visayas",
    level: "Reg",
    population: 8081988,
    region_code: "0700000000",
    province_code: null,
  },
  "0700600000": {
    name: "Cebu City",
    level: "City",
    population: 964169,
    region_code: "0700000000",
    province_code: "0700600000",
  },
  "0600000000": {
    name: "Western Visayas",
    level: "Reg",
    population: 7954723,
    region_code: "0600000000",
    province_code: null,
  },
  "0604530000": {
    name: "Sagay City",
    level: "City",
    population: 159000,
    region_code: "0600000000",
    province_code: "0604500000",
  },
  // A municipality with no branches (for unbanked test)
  "0604540000": {
    name: "Silay City",
    level: "City",
    population: 135000,
    region_code: "0600000000",
    province_code: "0604500000",
  },
  // Province-level entries
  "0604500000": {
    name: "Negros Occidental",
    level: "Prov",
    population: 3200000,
    region_code: "0600000000",
    province_code: "0604500000",
  },
};

// --- searchBranches ---

describe("searchBranches", () => {
  it("finds branches by institution name", () => {
    const results = searchBranches(MOCK_BRANCHES, { query: "BDO" });
    expect(results.length).toBe(3); // 2 bank branches + 1 ATM
    expect(results.every((b) => b.institution_name === "BDO UNIBANK")).toBe(true);
  });

  it("finds branches by branch name", () => {
    const results = searchBranches(MOCK_BRANCHES, { query: "CEBU MAIN" });
    expect(results.length).toBe(1);
    expect(results[0].institution_name).toBe("METROBANK");
  });

  it("scores exact matches higher than substring matches", () => {
    const results = searchBranches(MOCK_BRANCHES, { query: "METROBANK" });
    expect(results[0].id).toBe("3");
  });

  it("returns empty for empty query", () => {
    expect(searchBranches(MOCK_BRANCHES, { query: "" })).toEqual([]);
    expect(searchBranches(MOCK_BRANCHES, { query: "   " })).toEqual([]);
    expect(searchBranches(MOCK_BRANCHES, { query: "!!@#" })).toEqual([]);
  });

  it("filters by region", () => {
    const results = searchBranches(MOCK_BRANCHES, {
      query: "BDO",
      region: "NATIONAL CAPITAL REGION",
    });
    expect(results.length).toBe(3);
  });

  it("filters by industry", () => {
    const results = searchBranches(MOCK_BRANCHES, {
      query: "BDO",
      industry: "ATM ONLY",
    });
    expect(results.length).toBe(1);
    expect(results[0].industry).toBe("ATM ONLY");
  });

  it("filters by has_atm", () => {
    const results = searchBranches(MOCK_BRANCHES, {
      query: "BANK",
      has_atm: false,
    });
    // Rural Bank of Sagay and COOP SAVINGS both have has_atm: false
    // but only ones matching "BANK" in name
    const bankResults = results.filter((b) =>
      b.institution_name.includes("BANK") || b.branch_name.includes("BANK")
    );
    expect(bankResults.every((b) => !b.has_atm)).toBe(true);
  });

  it("filters by town", () => {
    const results = searchBranches(MOCK_BRANCHES, {
      query: "BDO",
      town: "MAKATI CITY",
    });
    expect(results.length).toBe(2); // MAKATI MAIN + ATM GREENBELT
  });
});

// --- getBranchById ---

describe("getBranchById", () => {
  const index = buildBranchIndex(MOCK_BRANCHES);

  it("returns branch by ID", () => {
    const branch = getBranchById(index, "1");
    expect(branch).toBeDefined();
    expect(branch!.institution_name).toBe("BDO UNIBANK");
    expect(branch!.branch_name).toBe("MAKATI MAIN");
  });

  it("returns undefined for unknown ID", () => {
    expect(getBranchById(index, "999")).toBeUndefined();
  });
});

// --- getCoverage ---

describe("getCoverage", () => {
  it("returns coverage for a municipality", () => {
    const result = getCoverage(MOCK_BRANCHES, MOCK_POPULATION, {
      psgc_code: "1380300000",
    });
    expect(result).not.toBeNull();
    expect(result!.area_name).toBe("City of Makati");
    expect(result!.total_access_points).toBe(2); // 1 bank + 1 ATM
    expect(result!.bank_branches).toBe(1);
    expect(result!.atm_only).toBe(1);
    expect(result!.nssla).toBe(0);
    expect(result!.population_per_access_point).toBe(Math.round(309770 / 2));
  });

  it("returns coverage for a region", () => {
    const result = getCoverage(MOCK_BRANCHES, MOCK_POPULATION, {
      psgc_code: "1300000000",
    });
    expect(result).not.toBeNull();
    expect(result!.total_access_points).toBe(4); // branches 1,2,4 (BDO) + 5 (COOP SAVINGS)
    expect(result!.unique_institutions).toBe(2); // BDO UNIBANK + COOP SAVINGS ASSN
  });

  it("filters by industry", () => {
    const result = getCoverage(MOCK_BRANCHES, MOCK_POPULATION, {
      psgc_code: "1300000000",
      industry: "BANK",
    });
    expect(result).not.toBeNull();
    expect(result!.total_access_points).toBe(2); // Only BANK branches in NCR
  });

  it("returns null for unknown PSGC code", () => {
    const result = getCoverage(MOCK_BRANCHES, MOCK_POPULATION, {
      psgc_code: "9999900000",
    });
    expect(result).toBeNull();
  });

  it("returns null population_per_access_point when no access points", () => {
    const result = getCoverage(MOCK_BRANCHES, MOCK_POPULATION, {
      psgc_code: "0604540000", // Silay City, no branches
    });
    expect(result).not.toBeNull();
    expect(result!.total_access_points).toBe(0);
    expect(result!.population_per_access_point).toBeNull();
  });
});

// --- findUnbankedAreas ---

describe("findUnbankedAreas", () => {
  it("finds municipalities with zero access points", () => {
    const results = findUnbankedAreas(MOCK_BRANCHES, MOCK_POPULATION, {});
    // Silay City has no branches
    const silay = results.find((r) => r.psgc_code === "0604540000");
    expect(silay).toBeDefined();
    expect(silay!.area_name).toBe("Silay City");
    expect(silay!.population).toBe(135000);
  });

  it("excludes municipalities that have branches", () => {
    const results = findUnbankedAreas(MOCK_BRANCHES, MOCK_POPULATION, {});
    const makati = results.find((r) => r.psgc_code === "1380300000");
    expect(makati).toBeUndefined(); // Makati has branches
  });

  it("scopes to region when region_code provided", () => {
    const results = findUnbankedAreas(MOCK_BRANCHES, MOCK_POPULATION, {
      region_code: "0600000000",
    });
    // Only Western Visayas municipalities should appear
    for (const r of results) {
      const entry = MOCK_POPULATION[r.psgc_code];
      expect(entry?.region_code).toBe("0600000000");
    }
  });

  it("sorts by population descending", () => {
    const results = findUnbankedAreas(MOCK_BRANCHES, MOCK_POPULATION, {});
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].population).toBeGreaterThanOrEqual(results[i].population);
    }
  });

  it("respects limit", () => {
    const results = findUnbankedAreas(MOCK_BRANCHES, MOCK_POPULATION, { limit: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
  });
});

// --- findUnderservedAreas ---

describe("findUnderservedAreas", () => {
  it("ranks regions by population per access point", () => {
    const results = findUnderservedAreas(MOCK_BRANCHES, MOCK_POPULATION, {
      level: "region",
    });
    expect(results.length).toBeGreaterThan(0);
    // Should be sorted descending by population_per_access_point
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].population_per_access_point).toBeGreaterThanOrEqual(
        results[i].population_per_access_point
      );
    }
  });

  it("ranks provinces by population per access point", () => {
    const results = findUnderservedAreas(MOCK_BRANCHES, MOCK_POPULATION, {
      level: "province",
    });
    expect(results.length).toBeGreaterThan(0);
    // Negros Occidental has 1 branch (Sagay), so ratio = 3200000/1
    const negOcc = results.find((r) => r.psgc_code === "0604500000");
    expect(negOcc).toBeDefined();
    expect(negOcc!.access_point_count).toBe(1);
    expect(negOcc!.population_per_access_point).toBe(3200000);
  });

  it("filters by industry", () => {
    const results = findUnderservedAreas(MOCK_BRANCHES, MOCK_POPULATION, {
      level: "region",
      industry: "NSSLA",
    });
    // NCR has 1 NSSLA, other regions have 0
    const ncr = results.find((r) => r.psgc_code === "1300000000");
    expect(ncr).toBeDefined();
    expect(ncr!.access_point_count).toBe(1);
  });

  it("respects limit", () => {
    const results = findUnderservedAreas(MOCK_BRANCHES, MOCK_POPULATION, {
      level: "region",
      limit: 1,
    });
    expect(results.length).toBe(1);
  });
});

// --- getInstitutionFootprint ---

describe("getInstitutionFootprint", () => {
  it("returns footprint for matched institution", () => {
    const result = getInstitutionFootprint(MOCK_BRANCHES, {
      institution_name: "BDO",
    });
    expect(result).not.toBeNull();
    expect(result!.institution_name).toBe("BDO UNIBANK");
    expect(result!.total_branches).toBe(3);
    expect(result!.with_atm).toBe(3);
    expect(result!.industries["BANK"]).toBe(2);
    expect(result!.industries["ATM ONLY"]).toBe(1);
  });

  it("returns null for no matches", () => {
    const result = getInstitutionFootprint(MOCK_BRANCHES, {
      institution_name: "NONEXISTENT BANK",
    });
    expect(result).toBeNull();
  });

  it("returns null for empty query", () => {
    const result = getInstitutionFootprint(MOCK_BRANCHES, {
      institution_name: "",
    });
    expect(result).toBeNull();
  });

  it("breaks down by region", () => {
    const result = getInstitutionFootprint(MOCK_BRANCHES, {
      institution_name: "BDO",
    });
    expect(result!.by_region["NATIONAL CAPITAL REGION"]).toBe(3);
  });
});

// --- compareCoverage ---

describe("compareCoverage", () => {
  it("compares two areas", () => {
    const result = compareCoverage(MOCK_BRANCHES, MOCK_POPULATION, {
      psgc_code_a: "1380300000",
      psgc_code_b: "0700600000",
    });
    expect(result).not.toBeNull();
    expect(result!.area_a.area_name).toBe("City of Makati");
    expect(result!.area_b.area_name).toBe("Cebu City");
    expect(result!.area_a.total_access_points).toBe(2);
    expect(result!.area_b.total_access_points).toBe(1);
  });

  it("returns null if either area has no population data", () => {
    const result = compareCoverage(MOCK_BRANCHES, MOCK_POPULATION, {
      psgc_code_a: "1380300000",
      psgc_code_b: "9999900000",
    });
    expect(result).toBeNull();
  });
});
