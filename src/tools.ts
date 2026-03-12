import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bank, PopulationLookup } from "./types.js";
import { searchBanks, getBankByCode, listByType, listByLocation, getBankStats, getBankingDensity, findUnderbankedAreas } from "./data.js";
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

export function registerTools(server: McpServer, banks: Bank[], pop: PopulationLookup, env: Cloudflare.Env) {
  const meta = buildMeta(env);
  const densityMeta = buildDensityMeta(env);

  server.tool(
    "search_banks",
    "Search Philippine banks by name. Fuzzy matches against registration name and trade name. Returns active banks by default.",
    {
      query: z.string().describe("Bank name to search for, e.g. 'BDO' or 'Rural Bank of Sagay'"),
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
    "Look up a specific bank by its institution code.",
    {
      institution_code: z.string().describe("Institution code, e.g. '0001'"),
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
      const results = listByLocation(banks, { psgc_code, bank_type, status });
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
}
