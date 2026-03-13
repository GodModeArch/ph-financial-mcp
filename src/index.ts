import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bank, Branch, PopulationLookup } from "./types.js";
import { registerTools } from "./tools.js";

// Static imports - bundled into the worker at build time
import banksData from "../data/banks.json";
import branchesData from "../data/branches.json";
import populationData from "../data/population.json";

const banks = banksData as unknown as Bank[];
const branches = branchesData as unknown as Branch[];
const population = populationData as unknown as PopulationLookup;

export class BSPBanksMCP extends McpAgent {
  server = new McpServer({
    name: "ph-financial-mcp",
    version: "1.0.0",
  });

  async init() {
    registerTools(this.server, banks, branches, population, this.env);
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/mcp") {
      return BSPBanksMCP.serve("/mcp").fetch(request, env, ctx);
    }

    if (url.pathname === "/" || url.pathname === "") {
      return new Response(
        JSON.stringify({
          name: "ph-financial-mcp",
          version: "1.0.0",
          description: "Philippine banking directory from BSP with PSGC location support and branch-level coverage tools",
          mcp_endpoint: "/mcp",
          tools: [
            "search_banks",
            "get_bank",
            "list_banks_by_type",
            "list_banks_by_location",
            "get_bank_stats",
            "get_banking_density",
            "find_underbanked_areas",
            "search_branches",
            "get_branch",
            "get_coverage",
            "find_unbanked_areas",
            "find_underserved_areas",
            "get_institution_footprint",
            "compare_coverage",
          ],
          source: "Bangko Sentral ng Pilipinas (BSP)",
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response("Not Found", { status: 404 });
  },
};
