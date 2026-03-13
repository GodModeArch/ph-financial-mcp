import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bank, Branch, PopulationLookup } from "./types.js";
import { searchBanks, getBankByCode, listByType, listByLocation, getBankStats, getBankingDensity, findUnderbankedAreas } from "./data.js";
import {
  searchBranches,
  buildBranchIndex,
  getBranchById,
  getCoverage,
  findUnbankedAreas,
  findUnderservedAreas,
  getInstitutionFootprint,
  compareCoverage,
} from "./branch-data.js";
import { buildMeta, buildDensityMeta, toolResult, toolPaginatedResult, toolError } from "./response.js";

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

export function registerTools(server: McpServer, banks: Bank[], branches: Branch[], pop: PopulationLookup, env: Cloudflare.Env) {
  const meta = buildMeta(env);
  const densityMeta = buildDensityMeta(env);
  const branchIndex = buildBranchIndex(branches);

  // --- Existing bank tools ---

  server.tool(
    "search_banks",
    "Search Philippine banks by name. Fuzzy matches against registration name and trade name. Returns active banks by default.",
    {
      query: z.string().min(1).describe("Bank name to search for, e.g. 'BDO' or 'Rural Bank of Sagay'"),
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

  server.tool(
    "get_bank",
    "Look up a specific bank by its institution code (BSP SharePoint ID). Codes are stable across ETL runs.",
    {
      institution_code: z.string().describe("Institution code (BSP SharePoint ID), e.g. '123'"),
    },
    async ({ institution_code }) => {
      const bank = getBankByCode(banks, institution_code);
      if (!bank) {
        return toolError(`Bank not found with institution code: ${institution_code}`);
      }
      return toolResult(bank, meta);
    }
  );

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

  server.tool(
    "list_banks_by_location",
    "List banks by location using PSGC codes. Accepts region code (e.g. '1300000000' for NCR), province code, or municipality code. Use the psgc-mcp server to look up PSGC codes.",
    {
      psgc_code: z.string().length(10).describe("10-digit PSGC code: region, province, or municipality"),
      bank_type: BankTypeSchema.optional().describe("Filter by bank type"),
      status: StatusSchema.optional().describe("Filter by status. Default: 'active'"),
      limit: z.number().min(1).max(100).optional().describe("Max results. Default: 50"),
      offset: z.number().min(0).optional().describe("Pagination offset. Default: 0"),
    },
    async ({ psgc_code, bank_type, status, limit = 50, offset = 0 }) => {
      const results = listByLocation(banks, pop, { psgc_code, bank_type, status });
      const page = results.slice(offset, offset + limit);

      return toolPaginatedResult(page, meta, {
        total: results.length,
        offset,
        limit,
        has_more: offset + limit < results.length,
      });
    }
  );

  server.tool(
    "get_bank_stats",
    "Get summary statistics of the Philippine banking directory: counts by type, region, status.",
    {},
    async () => {
      const stats = getBankStats(banks);
      return toolResult(stats, meta);
    }
  );

  server.tool(
    "get_banking_density",
    "Get banking density for a location: population, bank count, and population-per-bank ratio. Combines BSP bank directory with 2024 Census population data. Accepts region, province, or municipality PSGC codes. Note: bank count reflects head office registrations only, not branch locations.",
    {
      psgc_code: z.string().length(10).describe("10-digit PSGC code: region, province, or municipality"),
      bank_type: BankTypeSchema.optional().describe("Filter by bank type to get type-specific density"),
    },
    async ({ psgc_code, bank_type }) => {
      const result = getBankingDensity(banks, pop, { psgc_code, bank_type });
      if (!result) {
        return toolError(`No population data found for PSGC code: ${psgc_code}. Use the psgc-mcp server to look up valid codes.`);
      }
      return toolResult(result, densityMeta);
    }
  );

  server.tool(
    "find_underbanked_areas",
    "Find areas with the highest population-per-bank ratios (most underbanked). Ranks regions or provinces by how many people each bank head office serves. Combines BSP directory with 2024 Census data. Note: this measures head office density, not branch coverage.",
    {
      level: z.enum(["region", "province"]).describe("Geographic level to analyze: 'region' or 'province'"),
      bank_type: BankTypeSchema.optional().describe("Filter by bank type for type-specific analysis"),
      limit: z.number().min(1).max(50).optional().describe("Max results. Default: 20"),
    },
    async ({ level, bank_type, limit = 20 }) => {
      const results = findUnderbankedAreas(banks, pop, { level, limit, bank_type });
      return toolResult({ areas: results, data_notes: [
        "Population: 2024 Census of Population (PSA). This is a point-in-time count and may not reflect current population.",
        "Bank count: based on BSP-registered head office locations only. Branch/office locations are not included.",
        "Areas with 0 banks show total population as the ratio. These areas may still be served by bank branches headquartered elsewhere.",
        "Higher population_per_bank = fewer banks relative to population (more underbanked).",
      ]}, densityMeta);
    }
  );

  // --- Branch-level tools ---

  server.tool(
    "search_branches",
    "Search BSP-supervised financial institution branches by name. Matches against institution name and branch name. Filterable by region, province, town, industry (BANK, NSSLA, ATM ONLY), and ATM availability.",
    {
      query: z.string().min(1).describe("Institution or branch name to search, e.g. 'BDO' or 'Metrobank Makati'"),
      region: z.string().optional().describe("Filter by region name, e.g. 'NATIONAL CAPITAL REGION'"),
      province: z.string().optional().describe("Filter by province name"),
      town: z.string().optional().describe("Filter by town/city name"),
      industry: z.string().optional().describe("Filter by industry: 'BANK', 'NSSLA', or 'ATM ONLY'"),
      has_atm: z.boolean().optional().describe("Filter branches with ATM"),
      limit: z.number().min(1).max(100).optional().describe("Max results. Default: 20"),
      offset: z.number().min(0).optional().describe("Pagination offset. Default: 0"),
    },
    async ({ query, region, province, town, industry, has_atm, limit = 20, offset = 0 }) => {
      const results = searchBranches(branches, {
        query,
        region,
        province,
        town,
        industry,
        has_atm,
      });
      const page = results.slice(offset, offset + limit);

      return toolPaginatedResult(page, densityMeta, {
        total: results.length,
        offset,
        limit,
        has_more: offset + limit < results.length,
      });
    }
  );

  server.tool(
    "get_branch",
    "Look up a specific branch by its ID.",
    {
      id: z.string().describe("Branch ID"),
    },
    async ({ id }) => {
      const branch = getBranchById(branchIndex, id);
      if (!branch) {
        return toolError(`Branch not found with ID: ${id}`);
      }
      return toolResult(branch, densityMeta);
    }
  );

  server.tool(
    "get_coverage",
    "Get financial access point coverage for a PSGC area. Counts bank branches, ATM-only locations, NSSLAs, unique institutions, and ATM availability. Cross-references with 2024 Census population for population-per-access-point ratio. Requires branches to have PSGC codes assigned.",
    {
      psgc_code: z.string().length(10).describe("10-digit PSGC code: region, province, or municipality"),
      industry: z.string().optional().describe("Filter by industry: 'BANK', 'NSSLA', or 'ATM ONLY'"),
    },
    async ({ psgc_code, industry }) => {
      const result = getCoverage(branches, pop, { psgc_code, industry });
      if (!result) {
        return toolError(`No population data found for PSGC code: ${psgc_code}. Use the psgc-mcp server to look up valid codes.`);
      }
      return toolResult(result, densityMeta);
    }
  );

  server.tool(
    "find_unbanked_areas",
    "Find municipalities with zero financial access points. Cross-references all municipalities in population data against branches with PSGC codes. Returns unserved municipalities sorted by population (largest unserved first). Optionally scoped to a region.",
    {
      region_code: z.string().length(10).optional().describe("10-digit PSGC region code to scope the search"),
      limit: z.number().min(1).max(200).optional().describe("Max results. Default: 50"),
    },
    async ({ region_code, limit }) => {
      const results = findUnbankedAreas(branches, pop, { region_code, limit });
      return toolResult({
        unbanked_municipalities: results,
        data_notes: [
          "This tool identifies municipalities with zero BSP-supervised access points based on PSGC code matching.",
          "Branches without PSGC codes are excluded from the match, so results may overcount unbanked areas.",
          "Population: 2024 Census of Population (PSA).",
        ],
      }, densityMeta);
    }
  );

  server.tool(
    "find_underserved_areas",
    "Rank regions or provinces by population-per-access-point ratio (most underserved first). Uses branch-level data for more granular coverage analysis than the head-office-based find_underbanked_areas tool.",
    {
      level: z.enum(["region", "province"]).describe("Geographic level: 'region' or 'province'"),
      industry: z.string().optional().describe("Filter by industry: 'BANK', 'NSSLA', or 'ATM ONLY'"),
      limit: z.number().min(1).max(50).optional().describe("Max results. Default: 20"),
    },
    async ({ level, industry, limit }) => {
      const results = findUnderservedAreas(branches, pop, { level, industry, limit });
      return toolResult({
        areas: results,
        data_notes: [
          "Population: 2024 Census of Population (PSA).",
          "Access point count uses branch-level PSGC codes. Branches without codes are excluded.",
          "Higher population_per_access_point = fewer access points relative to population (more underserved).",
        ],
      }, densityMeta);
    }
  );

  server.tool(
    "get_institution_footprint",
    "Map a financial institution's nationwide branch presence. Shows total branches, distribution by region and province, ATM count, and industry breakdown. Uses fuzzy matching on institution name.",
    {
      institution_name: z.string().min(1).describe("Institution name to search, e.g. 'BDO' or 'METROBANK'"),
    },
    async ({ institution_name }) => {
      const result = getInstitutionFootprint(branches, { institution_name });
      if (!result) {
        return toolError(`No branches found matching institution name: ${institution_name}`);
      }
      return toolResult(result, densityMeta);
    }
  );

  server.tool(
    "compare_coverage",
    "Compare financial access point coverage between two PSGC areas. Returns side-by-side coverage data including access point counts, industry breakdown, and population ratios for both areas.",
    {
      psgc_code_a: z.string().length(10).describe("10-digit PSGC code for the first area"),
      psgc_code_b: z.string().length(10).describe("10-digit PSGC code for the second area"),
    },
    async ({ psgc_code_a, psgc_code_b }) => {
      const result = compareCoverage(branches, pop, { psgc_code_a, psgc_code_b });
      if (!result) {
        const coverageA = getCoverage(branches, pop, { psgc_code: psgc_code_a });
        if (!coverageA) {
          return toolError(`No population data found for PSGC code: ${psgc_code_a}. Use the psgc-mcp server to look up valid codes.`);
        }
        return toolError(`No population data found for PSGC code: ${psgc_code_b}. Use the psgc-mcp server to look up valid codes.`);
      }
      return toolResult(result, densityMeta);
    }
  );
}
