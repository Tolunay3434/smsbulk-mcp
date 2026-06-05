/**
 * Email verification tools (API key required for ALL of them).
 *
 * NOTE on auth: unlike the SMS catalog (which is public/keyless), the email
 * endpoints — including `domains` — sit behind the authenticated
 * v1/email-activations controller, so every tool here sends x-api-key.
 *
 * Only `email_request` spends money, so it is the only tool wrapped by the
 * best-effort SessionGuard (mirrors request_number). `email_reorder` also
 * spends but, like SMS request_resend, is keyed to an existing activation id
 * and is intentionally NOT guarded.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SmsBulkClient } from "../smsbulk-client.js";
import { SessionGuard } from "../guard.js";
import { relay, toolError } from "./helpers.js";

export function registerEmailTools(
  server: McpServer,
  client: SmsBulkClient,
  guard: SessionGuard,
): void {
  const siteSchema = z
    .string()
    .regex(/^[a-z0-9.-]+$/i, "site must be a domain-like string")
    .max(100)
    .describe("Target site the email will be used on, e.g. 'telegram.com'.");

  server.registerTool(
    "email_get_domains",
    {
      title: "List email domains for a site",
      description:
        "List available email provider domains for a target site, with user-facing prices and stock. " +
        "Requires an API key. Use this before email_request to pick a domain. Does not spend.",
      inputSchema: {
        site: siteSchema,
      },
    },
    async ({ site }) => {
      try {
        return relay(await client.get("/email-activations/domains", { query: { site }, requireKey: true }));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "email_request",
    {
      title: "Purchase email address",
      description:
        "Reserve a temporary email address for OTP verification. ⚠️ This SPENDS from your wallet immediately. " +
        "Requires an API key. Pick site + domain via email_get_domains first. " +
        "Best-effort retry guard: an identical call in the same session is replayed without charging again. " +
        "To intentionally order a SECOND address for the same site/domain, pass a distinct idempotency_token.",
      inputSchema: {
        site: siteSchema,
        domain: z
          .string()
          .regex(/^[a-z0-9.-]+$/i, "domain must be a domain-like string")
          .max(64)
          .describe("Email provider domain to purchase, e.g. 'gmx.com' (from email_get_domains)."),
        idempotency_token: z
          .string()
          .max(64)
          .optional()
          .describe(
            "Optional. Reuse the SAME token to safely retry one intended order; use a DIFFERENT token to place a separate order with identical args.",
          ),
      },
    },
    async ({ site, domain, idempotency_token }) => {
      try {
        const fp = guard.fingerprint([site.toLowerCase(), domain.toLowerCase(), idempotency_token]);
        const { value, deduped } = await guard.run(fp, () =>
          client.post("/email-activations", {
            body: { site, domain },
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
                  "NOTE: best-effort retry guard matched a previous email_request call in this " +
                  "session — returning the existing activation WITHOUT charging again. Pass a distinct " +
                  "idempotency_token to order a different address.\n\n" +
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

  server.registerTool(
    "email_list",
    {
      title: "List email activations",
      description:
        "List your most recent email activations (newest first, up to 100; no cursor paging). " +
        "Requires an API key. Does not spend.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe("Max rows to return (1-100, default 50)."),
      },
    },
    async ({ limit }) => {
      try {
        return relay(await client.get("/email-activations", { query: { limit }, requireKey: true }));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  const idSchema = {
    id: z.string().min(1).describe("Email activation id (from email_request or email_list)."),
  };

  server.registerTool(
    "email_get_status",
    {
      title: "Get email activation status",
      description:
        "Get the status, parsed OTP, and raw HTML body (once received) for one email activation. " +
        "Requires an API key. Does not spend.",
      inputSchema: idSchema,
    },
    async ({ id }) => {
      try {
        return relay(await client.get(`/email-activations/${encodeURIComponent(id)}`, { requireKey: true }));
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "email_reorder",
    {
      title: "Reorder email address",
      description:
        "Re-open the same email address for another OTP (email equivalent of SMS request_resend). " +
        "⚠️ This SPENDS from your wallet again. Requires an API key.",
      inputSchema: idSchema,
    },
    async ({ id }) => {
      try {
        return relay(
          await client.post(`/email-activations/${encodeURIComponent(id)}/reorder`, { requireKey: true }),
        );
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "email_cancel",
    {
      title: "Cancel email activation",
      description:
        "Cancel an email activation. Refunds the wallet if no OTP was received. Requires an API key.",
      inputSchema: idSchema,
    },
    async ({ id }) => {
      try {
        return relay(await client.delete(`/email-activations/${encodeURIComponent(id)}`, { requireKey: true }));
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
