/**
 * Keyless catalog tools — service & country discovery.
 *
 * These do NOT require an API key (the SMSBulk v1 catalog endpoints are public),
 * which makes them ideal for browsing before authenticating. Every handler is a
 * pure relay: it returns the backend JSON verbatim, never reshaping it here.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SmsBulkClient } from "../smsbulk-client.js";
import { relay, toolError } from "./helpers.js";

export function registerCatalogTools(server: McpServer, client: SmsBulkClient): void {
  server.registerTool(
    "list_services",
    {
      title: "List services",
      description:
        "List all active SMS verification services with stock and minimum-price summaries. " +
        "No API key required. Use this to discover available services and their slugs/codes.",
      inputSchema: {},
    },
    async () => {
      try {
        return relay(await client.get("/services"));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "list_countries",
    {
      title: "List countries",
      description:
        "List all supported countries with flags and ISO codes. No API key required.",
      inputSchema: {},
    },
    async () => {
      try {
        return relay(await client.get("/countries"));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  const slugSchema = {
    slug: z
      .string()
      .min(1)
      .describe("Service SEO slug (e.g. 'whatsapp-verification') or service code (e.g. 'wa')."),
  };

  server.registerTool(
    "get_service",
    {
      title: "Get service",
      description:
        "Get details for a single service by its SEO slug or service code. No API key required.",
      inputSchema: slugSchema,
    },
    async ({ slug }) => {
      try {
        return relay(await client.get(`/services/${encodeURIComponent(slug)}`));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "get_service_countries",
    {
      title: "Get service countries",
      description:
        "List in-stock countries for a service (stock > 0) with prices, currency, stock, and speed tiers. " +
        "No API key required. Use the returned isoCode + service code/slug to order a number.",
      inputSchema: slugSchema,
    },
    async ({ slug }) => {
      try {
        return relay(await client.get(`/services/${encodeURIComponent(slug)}/countries`));
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
