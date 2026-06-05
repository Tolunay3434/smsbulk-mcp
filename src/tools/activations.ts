/**
 * SMS activation tools (API key required).
 *
 * Only `request_number` spends money, so it is the ONLY tool wrapped by the
 * best-effort SessionGuard. Reads, completes, cancels and resends are NOT
 * guarded — they are safe/idempotent enough server-side and must always reach
 * the backend.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SmsBulkClient } from "../smsbulk-client.js";
import { SessionGuard } from "../guard.js";
import { relay, toolError } from "./helpers.js";

export function registerActivationTools(
  server: McpServer,
  client: SmsBulkClient,
  guard: SessionGuard,
): void {
  server.registerTool(
    "request_number",
    {
      title: "Request number (purchase)",
      description:
        "Reserve a virtual number for SMS verification. ⚠️ This SPENDS from your wallet immediately. " +
        "Requires an API key. Use list_services / get_service_countries first to pick a serviceCode and countryIso. " +
        "Best-effort retry guard: an identical call in the same session is replayed without charging again. " +
        "To intentionally order a SECOND number for the same service/country, pass a distinct idempotency_token.",
      inputSchema: {
        serviceCode: z
          .string()
          .regex(/^[a-z0-9_]+$/i, "service code is alphanumeric/underscore")
          .max(16)
          .describe("Service code, e.g. 'wa' for WhatsApp (from list_services)."),
        countryIso: z
          .string()
          .min(2)
          .max(5)
          .describe("Country ISO 3166-1 alpha-2 code, e.g. 'TR', 'US'."),
        operator: z
          .string()
          .max(16)
          .optional()
          .describe("Optional carrier filter (provider-dependent), e.g. 'any'."),
        idempotency_token: z
          .string()
          .max(64)
          .optional()
          .describe(
            "Optional. Reuse the SAME token to safely retry one intended order; use a DIFFERENT token to place a separate order with identical args.",
          ),
      },
    },
    async ({ serviceCode, countryIso, operator, idempotency_token }) => {
      try {
        const fp = guard.fingerprint([
          serviceCode.toLowerCase(),
          countryIso.toUpperCase(),
          operator,
          idempotency_token,
        ]);
        const { value, deduped } = await guard.run(fp, () =>
          client.post("/activations", {
            body: { serviceCode, countryIso, operator },
            requireKey: true,
          }),
        );
        const json = JSON.stringify(value, null, 2);
        if (deduped) {
          return {
            content: [
              {
                type: "text",
                text:
                  "NOTE: best-effort retry guard matched a previous request_number call in this " +
                  "session — returning the existing activation WITHOUT charging again. Pass a distinct " +
                  "idempotency_token to order a different number.\n\n" +
                  json,
              },
            ],
          };
        }
        return { content: [{ type: "text", text: json }] };
      } catch (err) {
        return toolError(err);
      }
    },
  );

  const idSchema = {
    id: z.string().min(1).describe("Activation id (from request_number or list_activations)."),
  };

  server.registerTool(
    "get_status",
    {
      title: "Get activation status",
      description:
        "Get the current status and SMS code (if received) for one activation. Requires an API key. Does not spend.",
      inputSchema: idSchema,
    },
    async ({ id }) => {
      try {
        return relay(await client.get(`/activations/${encodeURIComponent(id)}`, { requireKey: true }));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "complete",
    {
      title: "Complete activation",
      description:
        "Mark an activation complete (confirms the SMS was used). Final transition. Requires an API key.",
      inputSchema: idSchema,
    },
    async ({ id }) => {
      try {
        return relay(
          await client.post(`/activations/${encodeURIComponent(id)}/complete`, { requireKey: true }),
        );
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "cancel",
    {
      title: "Cancel activation",
      description:
        "Cancel an activation. Refunds the wallet if no SMS was received. Requires an API key.",
      inputSchema: idSchema,
    },
    async ({ id }) => {
      try {
        return relay(await client.delete(`/activations/${encodeURIComponent(id)}`, { requireKey: true }));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "request_resend",
    {
      title: "Request another SMS",
      description:
        "Ask the provider to send another SMS to the same number. Limited per activation. Requires an API key.",
      inputSchema: idSchema,
    },
    async ({ id }) => {
      try {
        return relay(
          await client.post(`/activations/${encodeURIComponent(id)}/request-resend`, { requireKey: true }),
        );
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "list_activations",
    {
      title: "List activations",
      description:
        "List your activations (cursor-paginated, newest first). Requires an API key. Does not spend.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe("Page size (1-100, default 25)."),
        cursor: z.string().max(64).optional().describe("Pagination cursor from a previous response."),
        status: z
          .string()
          .optional()
          .describe("Optional comma-separated status filter, e.g. 'WAITING,RECEIVED'."),
      },
    },
    async ({ limit, cursor, status }) => {
      try {
        return relay(
          await client.get("/activations", {
            query: { limit, cursor, status },
            requireKey: true,
          }),
        );
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
