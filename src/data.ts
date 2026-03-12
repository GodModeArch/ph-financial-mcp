import type { Bank, BankType, BankStatus, PopulationLookup, DensityResult, UnderbankedArea } from "./types.js";

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
    if (bank.status !== status) continue;
    if (bank_type && bank.bank_type !== bank_type) continue;

    const normName = normalize(bank.registration_name);
    const normTrade = bank.trade_name ? normalize(bank.trade_name) : "";

    let score = 0;

    if (normName === normalizedQuery || normTrade === normalizedQuery) {
      score = 3;
    } else if (normName.startsWith(normalizedQuery) || normTrade.startsWith(normalizedQuery)) {
      score = 2;
    } else if (normName.includes(normalizedQuery) || normTrade.includes(normalizedQuery)) {
      score = 1;
    }

    if (score > 0) {
      scored.push({ bank, score });
    }
  }

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
  status?: BankStatus;
}

export function listByLocation(banks: Bank[], params: ListByLocationParams): Bank[] {
  const { psgc_code, bank_type, status = "active" } = params;

  return banks.filter((b) => {
    if (b.status !== status) return false;
    if (bank_type && b.bank_type !== bank_type) return false;

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
  total_inactive: number;
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
    total_inactive: banks.filter((b) => b.status !== "active").length,
    by_type,
    by_region,
    by_status,
  };
}

// --- Population density functions ---

const DATA_NOTES = [
  "Population: 2024 Census of Population (PSA). This is a point-in-time count and may not reflect current population.",
  "Bank count: based on BSP-registered head office locations only. Branch/office locations are not included.",
  "A municipality with 0 banks may still be served by branches of banks headquartered elsewhere.",
];

function detectPsgcLevel(code: string): "region" | "province" | "municipality" {
  if (code.endsWith("00000000")) return "region";
  if (code.endsWith("000000")) return "province";
  return "municipality";
}

function getPopulation(pop: PopulationLookup, code: string): { name: string; population: number } | null {
  const direct = pop[code];
  if (direct) {
    return { name: direct.name, population: direct.population };
  }

  // For province codes not directly in lookup, aggregate child municipalities
  const level = detectPsgcLevel(code);
  if (level === "province") {
    const children = Object.values(pop).filter(
      (e) => e.province_code === code && (e.level === "City" || e.level === "Mun" || e.level === "SubMun")
    );
    if (children.length > 0) {
      const total = children.reduce((sum, e) => sum + e.population, 0);
      // Try to derive a name from the code
      return { name: `Province ${code}`, population: total };
    }
  }

  return null;
}

interface DensityParams {
  psgc_code: string;
  bank_type?: BankType;
}

export function getBankingDensity(
  banks: Bank[],
  pop: PopulationLookup,
  params: DensityParams
): DensityResult | null {
  const { psgc_code, bank_type } = params;
  const level = detectPsgcLevel(psgc_code);

  const popData = getPopulation(pop, psgc_code);
  if (!popData) return null;

  // Filter active banks in the area
  let areaBanks = banks.filter((b) => {
    if (b.status !== "active") return false;
    if (bank_type && b.bank_type !== bank_type) return false;

    if (level === "region") return b.region_code === psgc_code;
    if (level === "province") return b.province_code === psgc_code;
    return b.psgc_muni_code === psgc_code;
  });

  const by_type: Record<string, number> = {};
  for (const bank of areaBanks) {
    by_type[bank.bank_type] = (by_type[bank.bank_type] || 0) + 1;
  }

  const levelLabel = level === "region" ? "Region" : level === "province" ? "Province" : "City/Municipality";

  return {
    psgc_code,
    area_name: popData.name,
    area_level: levelLabel,
    population: popData.population,
    bank_count: areaBanks.length,
    population_per_bank: areaBanks.length > 0 ? Math.round(popData.population / areaBanks.length) : null,
    by_type,
    data_notes: DATA_NOTES,
  };
}

interface UnderbankedParams {
  level: "region" | "province";
  limit?: number;
  bank_type?: BankType;
}

export function findUnderbankedAreas(
  banks: Bank[],
  pop: PopulationLookup,
  params: UnderbankedParams
): UnderbankedArea[] {
  const { level, limit = 20, bank_type } = params;

  // Build list of areas at the requested level
  const areaField = level === "region" ? "region_code" : "province_code";
  const activeBanks = banks.filter((b) => {
    if (b.status !== "active") return false;
    if (bank_type && b.bank_type !== bank_type) return false;
    return true;
  });

  // Get unique area codes from banks AND from population data
  const areaCodes = new Set<string>();

  // Include areas from population data at the right level
  for (const [code, entry] of Object.entries(pop)) {
    if (level === "region" && entry.level === "Reg") {
      areaCodes.add(code);
    } else if (level === "province" && entry.level === "Prov") {
      areaCodes.add(code);
    }
  }

  // Also include province codes from banks (some may not be Prov-level entities)
  if (level === "province") {
    for (const bank of banks) {
      if (bank.province_code) areaCodes.add(bank.province_code);
    }
  }

  const results: UnderbankedArea[] = [];

  for (const code of areaCodes) {
    const popData = getPopulation(pop, code);
    if (!popData || popData.population === 0) continue;

    const bankCount = activeBanks.filter((b) => b[areaField] === code).length;

    results.push({
      psgc_code: code,
      area_name: popData.name,
      area_level: level === "region" ? "Region" : "Province",
      population: popData.population,
      bank_count: bankCount,
      population_per_bank: bankCount > 0 ? Math.round(popData.population / bankCount) : popData.population,
    });
  }

  // Sort by population_per_bank descending (most underbanked first)
  results.sort((a, b) => b.population_per_bank - a.population_per_bank);

  return results.slice(0, limit);
}
