import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bank } from "./types.js";
import { registerTools } from "./tools.js";

// Static import of bank data - bundled into the worker at build time
import banksData from "../data/banks.json";

const banks = banksData as unknown as Bank[];

export class BSPBanksMCP extends McpAgent {
  server = new McpServer({
    name: "BSP Bank Directory",
    version: "1.0.0",
  });

  async init() {
    registerTools(this.server, banks, this.env);
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
          name: "BSP Bank Directory MCP",
          version: "1.0.0",
          description: "Philippine banking directory from BSP with PSGC location support",
          mcp_endpoint: "/mcp",
          tools: [
            "search_banks",
            "get_bank",
            "list_banks_by_type",
            "list_banks_by_location",
            "get_bank_stats",
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
