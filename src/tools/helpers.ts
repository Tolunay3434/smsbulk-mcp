/**
 * Shared helpers for MCP tool handlers.
 */
import { SmsBulkError } from "../smsbulk-client.js";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

/** Relay backend JSON to the MCP client verbatim (pretty-printed). */
export function relay(data: unknown): ToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }] };
}

/** Turn a thrown error into an MCP tool error result with a clear message. */
export function toolError(err: unknown): ToolResult {
  const message =
    err instanceof SmsBulkError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  return { content: [{ type: "text", text: message }], isError: true };
}
