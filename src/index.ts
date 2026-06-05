#!/usr/bin/env node
/**
 * SMSBulk MCP server — entry point.
 *
 * Exposes the SMSBulk SMS & Email verification API to MCP clients over stdio.
 * This is a pure relay: it forwards requests to the SMSBulk public API using the
 * caller's own API key. It never stores secrets and never talks to any other
 * backend.
 *
 * IMPORTANT (stdio transport): stdout is the JSON-RPC channel. Never write
 * diagnostics to stdout — use stderr (console.error) only.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SmsBulkClient } from "./smsbulk-client.js";
import { registerCatalogTools } from "./tools/catalog.js";

const NAME = "smsbulk-mcp";
const VERSION = "0.1.0";

interface Config {
  apiKey: string | undefined;
  baseUrl: string;
  /** Soft, best-effort per-session spend cap in USD. 0 / undefined = disabled. */
  maxSpendPerSession: number | undefined;
}

function loadConfig(): Config {
  const rawCap = process.env.MAX_SPEND_PER_SESSION?.trim();
  const cap = rawCap ? Number(rawCap) : NaN;
  return {
    apiKey: process.env.SMSBULK_API_KEY?.trim() || undefined,
    baseUrl: (process.env.SMSBULK_BASE_URL?.trim() || "https://smsbulk.net/api/v1").replace(/\/+$/, ""),
    maxSpendPerSession: Number.isFinite(cap) && cap > 0 ? cap : undefined,
  };
}

async function main(): Promise<void> {
  const config = loadConfig();

  const server = new McpServer({
    name: NAME,
    version: VERSION,
  });

  const client = new SmsBulkClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });

  // Keyless catalog/discovery tools. Authenticated tools (SMS/email/wallet) and
  // the in-memory spend/retry guard are registered in later steps (C3+).
  registerCatalogTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Diagnostics to stderr only — stdout is reserved for the JSON-RPC stream.
  console.error(`[${NAME}] v${VERSION} running on stdio (base: ${config.baseUrl})`);
  if (!config.apiKey) {
    console.error(`[${NAME}] warning: SMSBULK_API_KEY is not set — authenticated tools will fail.`);
  }
  if (config.maxSpendPerSession) {
    console.error(`[${NAME}] soft spend cap: $${config.maxSpendPerSession}/session (best-effort).`);
  }
}

main().catch((err) => {
  console.error(`[${NAME}] fatal:`, err);
  process.exit(1);
});
