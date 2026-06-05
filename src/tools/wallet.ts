/**
 * Wallet tools (API key required). Read-only — these never spend.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SmsBulkClient } from "../smsbulk-client.js";
import { relay, toolError } from "./helpers.js";

export function registerWalletTools(server: McpServer, client: SmsBulkClient): void {
  server.registerTool(
    "get_balance",
    {
      title: "Get wallet balance",
      description: "Get your current wallet balance. Requires an API key. Does not spend.",
      inputSchema: {},
    },
    async () => {
      try {
        return relay(await client.get("/wallet/balance", { requireKey: true }));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "list_transactions",
    {
      title: "List wallet transactions",
      description:
        "List recent wallet transactions (deposits, debits, refunds), cursor-paginated. " +
        "Requires an API key. Does not spend.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe("Page size (1-100)."),
        cursor: z.string().max(64).optional().describe("Pagination cursor from a previous response."),
      },
    },
    async ({ limit, cursor }) => {
      try {
        return relay(await client.get("/wallet/transactions", { query: { limit, cursor }, requireKey: true }));
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
