import type {
  Branch,
  CoverageResult,
  InstitutionFootprint,
  PopulationLookup,
} from "./types.js";
import { resolvePsgcMatch, getPopulation } from "./data.js";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Data notes for branch-level coverage tools ---

const COVERAGE_NOTES = [
  "Population: 2024 Census of Population (PSA). Point-in-time count.",
  "Branch data: BSP-supervised financial institution offices (banks, NSSLAs, ATM-only locations).",
  "Coverage counts include all access point types: bank branches, ATM-only, and NSSLAs.",
];

// --- Search ---

interface BranchSearchParams {
  query: string;
  region?: string;
  province?: string;
  town?: string;
  industry?: string;
  has_atm?: boolean;
  limit?: number;
  offset?: number;
}

export function searchBranches(
  branches: Branch[],
  params: BranchSearchParams
): Branch[] {
  const {
    query,
    region,
    province,
    town,
    industry,
    has_atm,
  } = params;

  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  const scored: { branch: Branch; score: number }[] = [];

  for (const branch of branches) {
    // Apply filters
    if (region && normalize(branch.region) !== normalize(region)) continue;
    if (province && normalize(branch.province) !== normalize(province))
      continue;
    if (town && normalize(branch.town) !== normalize(town)) continue;
    if (industry && normalize(branch.industry) !== normalize(industry))
      continue;
    if (has_atm !== undefined && branch.has_atm !== has_atm) continue;

    const normInstitution = normalize(branch.institution_name);
    const normBranch = normalize(branch.branch_name);

    let score = 0;

    if (
      normInstitution === normalizedQuery ||
      normBranch === normalizedQuery
    ) {
      score = 3;
    } else if (
      normInstitution.startsWith(normalizedQuery) ||
      normBranch.startsWith(normalizedQuery)
    ) {
      score = 2;
    } else if (
      normInstitution.includes(normalizedQuery) ||
      normBranch.includes(normalizedQuery)
    ) {
      score = 1;
    }

    if (score > 0) {
      scored.push({ branch, score });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.branch.institution_name.localeCompare(b.branch.institution_name);
  });

  return scored.map((s) => s.branch);
}

// --- Build branch index for O(1) lookup ---

export function buildBranchIndex(branches: Branch[]): Map<string, Branch> {
  return new Map(branches.map((b) => [b.id, b]));
}

export function getBranchById(
  index: Map<string, Branch>,
  id: string
): Branch | undefined {
  return index.get(id);
}

// --- Coverage ---

interface CoverageParams {
  psgc_code: string;
  industry?: string;
}

export function getCoverage(
  branches: Branch[],
  pop: PopulationLookup,
  params: CoverageParams
): CoverageResult | null {
  const { psgc_code, industry } = params;
  const { level, field, code } = resolvePsgcMatch(pop, psgc_code);

  const popData = getPopulation(pop, psgc_code);
  if (!popData) return null;

  // Filter branches in this area
  const areaBranches = branches.filter((b) => {
    if (industry && normalize(b.industry) !== normalize(industry)) return false;
    return b[field] === code;
  });

  const bankBranches = areaBranches.filter(
    (b) => normalize(b.industry) === "bank"
  ).length;
  const atmOnly = areaBranches.filter(
    (b) => normalize(b.industry) === "atm only"
  ).length;
  const nssla = areaBranches.filter(
    (b) => normalize(b.industry) === "nssla"
  ).length;

  const uniqueInstitutions = new Set(
    areaBranches.map((b) => normalize(b.institution_name))
  ).size;
  const withAtm = areaBranches.filter((b) => b.has_atm).length;
  const totalAccessPoints = areaBranches.length;

  const levelLabel =
    level === "region"
      ? "Region"
      : level === "province"
        ? "Province"
        : "City/Municipality";

  return {
    psgc_code,
    area_name: popData.name,
    area_level: levelLabel,
    population: popData.population,
    total_access_points: totalAccessPoints,
    bank_branches: bankBranches,
    atm_only: atmOnly,
    nssla,
    unique_institutions: uniqueInstitutions,
    with_atm: withAtm,
    population_per_access_point:
      totalAccessPoints > 0
        ? Math.round(popData.population / totalAccessPoints)
        : null,
    data_notes: COVERAGE_NOTES,
  };
}

// --- Find unbanked areas ---

interface UnbankedParams {
  region_code?: string;
  limit?: number;
}

interface UnbankedArea {
  psgc_code: string;
  area_name: string;
  population: number;
}

export function findUnbankedAreas(
  branches: Branch[],
  pop: PopulationLookup,
  params: UnbankedParams
): UnbankedArea[] {
  const { region_code, limit = 50 } = params;

  // Collect all branch psgc_muni_codes
  const servedMunis = new Set<string>();
  for (const branch of branches) {
    if (branch.psgc_muni_code) {
      servedMunis.add(branch.psgc_muni_code);
    }
  }

  // Find municipalities with zero access points
  const unbanked: UnbankedArea[] = [];

  for (const [code, entry] of Object.entries(pop)) {
    // Only municipalities/cities
    if (entry.level !== "Mun" && entry.level !== "City" && entry.level !== "SubMun")
      continue;

    // Scope to region if specified
    if (region_code && entry.region_code !== region_code) continue;

    // Skip if served
    if (servedMunis.has(code)) continue;

    unbanked.push({
      psgc_code: code,
      area_name: entry.name,
      population: entry.population,
    });
  }

  // Sort by population descending (largest unserved first)
  unbanked.sort((a, b) => b.population - a.population);

  return unbanked.slice(0, limit);
}

// --- Find underserved areas ---

interface UnderservedParams {
  level: "region" | "province";
  industry?: string;
  limit?: number;
}

interface UnderservedArea {
  psgc_code: string;
  area_name: string;
  area_level: string;
  population: number;
  access_point_count: number;
  population_per_access_point: number;
}

export function findUnderservedAreas(
  branches: Branch[],
  pop: PopulationLookup,
  params: UnderservedParams
): UnderservedArea[] {
  const { level, industry, limit = 20 } = params;

  const areaField: "region_code" | "province_code" =
    level === "region" ? "region_code" : "province_code";

  // Filter branches by industry if specified
  const filteredBranches = industry
    ? branches.filter((b) => normalize(b.industry) === normalize(industry))
    : branches;

  // Get unique area codes from population data
  const areaCodes = new Set<string>();
  for (const [code, entry] of Object.entries(pop)) {
    if (level === "region" && entry.level === "Reg") {
      areaCodes.add(code);
    } else if (level === "province" && entry.level === "Prov") {
      areaCodes.add(code);
    }
  }

  const results: UnderservedArea[] = [];

  for (const code of areaCodes) {
    const popData = getPopulation(pop, code);
    if (!popData || popData.population === 0) continue;

    // Use resolvePsgcMatch to get the correct comparison code.
    // Province entity codes (e.g. 0402100000 for Cavite) differ from the
    // generalized province_code on branches (e.g. 0402000000).
    const { code: resolvedCode } = resolvePsgcMatch(pop, code);

    const branchCount = filteredBranches.filter(
      (b) => b[areaField] === resolvedCode
    ).length;

    results.push({
      psgc_code: code,
      area_name: popData.name,
      area_level: level === "region" ? "Region" : "Province",
      population: popData.population,
      access_point_count: branchCount,
      population_per_access_point:
        branchCount > 0
          ? Math.round(popData.population / branchCount)
          : popData.population,
    });
  }

  // Sort by population_per_access_point descending (most underserved first)
  results.sort(
    (a, b) => b.population_per_access_point - a.population_per_access_point
  );

  return results.slice(0, limit);
}

// --- Institution footprint ---

interface FootprintParams {
  institution_name: string;
}

export function getInstitutionFootprint(
  branches: Branch[],
  params: FootprintParams
): InstitutionFootprint | null {
  const normalizedQuery = normalize(params.institution_name);
  if (!normalizedQuery) return null;

  // Fuzzy match: find all branches where institution name contains the query
  const matched = branches.filter((b) =>
    normalize(b.institution_name).includes(normalizedQuery)
  );

  if (matched.length === 0) return null;

  // Use the most common institution_name from matches as the canonical name
  const nameCounts: Record<string, number> = {};
  for (const b of matched) {
    nameCounts[b.institution_name] =
      (nameCounts[b.institution_name] || 0) + 1;
  }
  const canonicalName = Object.entries(nameCounts).sort(
    (a, b) => b[1] - a[1]
  )[0][0];

  const by_region: Record<string, number> = {};
  const by_province: Record<string, number> = {};
  const industries: Record<string, number> = {};
  let with_atm = 0;

  for (const b of matched) {
    by_region[b.region] = (by_region[b.region] || 0) + 1;
    by_province[b.province] = (by_province[b.province] || 0) + 1;
    industries[b.industry] = (industries[b.industry] || 0) + 1;
    if (b.has_atm) with_atm++;
  }

  return {
    institution_name: canonicalName,
    total_branches: matched.length,
    by_region,
    by_province,
    with_atm,
    industries,
  };
}

// --- Compare coverage ---

interface CompareParams {
  psgc_code_a: string;
  psgc_code_b: string;
}

interface CoverageComparison {
  area_a: CoverageResult;
  area_b: CoverageResult;
}

export function compareCoverage(
  branches: Branch[],
  pop: PopulationLookup,
  params: CompareParams
): CoverageComparison | null {
  const area_a = getCoverage(branches, pop, { psgc_code: params.psgc_code_a });
  const area_b = getCoverage(branches, pop, { psgc_code: params.psgc_code_b });

  if (!area_a || !area_b) return null;

  return { area_a, area_b };
}
