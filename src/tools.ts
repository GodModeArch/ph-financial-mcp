import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bank } from "./types.js";
import { searchBanks, getBankByCode, listByType, listByLocation, getBankStats } from "./data.js";
import { buildMeta, toolResult, toolPaginatedResult, toolError } from "./response.js";

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

export function registerTools(server: McpServer, banks: Bank[], env: Cloudflare.Env) {
  const meta = buildMeta(env);

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
      limit: z.number().min(1).max(100).optional().describe("Max results. Default: 50"),
      offset: z.number().min(0).optional().describe("Pagination offset. Default: 0"),
    },
    async ({ psgc_code, bank_type, limit = 50, offset = 0 }) => {
      const results = listByLocation(banks, { psgc_code, bank_type });
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
}
