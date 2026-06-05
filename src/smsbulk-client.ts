/**
 * Thin HTTP client for the SMSBulk public v1 API.
 *
 * This is a pure relay: it issues fetch() calls and returns the parsed JSON body
 * verbatim. It does not reshape responses — callers (MCP tools) hand the backend
 * JSON straight through to the client.
 */

/** Error carrying an MCP-friendly message plus the raw HTTP context. */
export class SmsBulkError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "SmsBulkError";
  }
}

export interface SmsBulkClientOptions {
  baseUrl: string;
  /** Optional API key. Catalog tools work without it; authenticated tools require it. */
  apiKey?: string;
  /** Request timeout in milliseconds (default 20000). */
  timeoutMs?: number;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** If true, throw a clear error when no API key is configured before making the call. */
  requireKey?: boolean;
}

type HttpMethod = "GET" | "POST" | "DELETE";

export class SmsBulkClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(opts: SmsBulkClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  hasApiKey(): boolean {
    return Boolean(this.apiKey);
  }

  get<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>("GET", path, opts);
  }

  post<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>("POST", path, opts);
  }

  delete<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>("DELETE", path, opts);
  }

  private async request<T>(method: HttpMethod, path: string, opts: RequestOptions): Promise<T> {
    if (opts.requireKey && !this.apiKey) {
      throw new SmsBulkError(
        "This action requires an API key. Set SMSBULK_API_KEY in your environment.",
        401,
      );
    }

    const url = this.buildUrl(path, opts.query);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.apiKey) headers["x-api-key"] = this.apiKey;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new SmsBulkError(`Request timed out after ${this.timeoutMs}ms: ${method} ${path}`);
      }
      const detail = err instanceof Error ? err.message : String(err);
      throw new SmsBulkError(`Network error reaching SMSBulk (${method} ${path}): ${detail}`);
    } finally {
      clearTimeout(timer);
    }

    const raw = await res.text();
    const parsed = parseJson(raw);

    if (!res.ok) {
      throw this.mapHttpError(res, parsed, method, path);
    }

    return parsed as T;
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const url = new URL(this.baseUrl + (path.startsWith("/") ? path : `/${path}`));
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private mapHttpError(res: Response, body: unknown, method: HttpMethod, path: string): SmsBulkError {
    const apiMsg = extractMessage(body);
    const where = `${method} ${path}`;

    switch (res.status) {
      case 401:
        return new SmsBulkError(
          `Authentication failed (401) on ${where}: invalid or missing SMSBulk API key. Check SMSBULK_API_KEY.`,
          401,
          body,
        );
      case 403:
        return new SmsBulkError(
          `Forbidden (403) on ${where}: ${apiMsg ?? "your API key is not allowed to perform this action."}`,
          403,
          body,
        );
      case 404:
        return new SmsBulkError(`Not found (404) on ${where}: ${apiMsg ?? "resource does not exist."}`, 404, body);
      case 429: {
        const retryAfter = res.headers.get("retry-after");
        const hint = retryAfter ? ` Retry after ${retryAfter}s.` : "";
        return new SmsBulkError(
          `Rate limit or daily quota exceeded (429) on ${where}.${hint} ${apiMsg ?? ""}`.trim(),
          429,
          body,
        );
      }
      default:
        if (res.status >= 500) {
          return new SmsBulkError(
            `SMSBulk server error (${res.status}) on ${where}: ${apiMsg ?? "try again later."}`,
            res.status,
            body,
          );
        }
        return new SmsBulkError(
          `SMSBulk request failed (${res.status}) on ${where}: ${apiMsg ?? res.statusText}`,
          res.status,
          body,
        );
    }
  }
}

function parseJson(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw; // non-JSON body (e.g. plain-text error) — return as-is
  }
}

/** Pull a human message out of a NestJS-style error body, if present. */
function extractMessage(body: unknown): string | undefined {
  if (typeof body === "string") return body || undefined;
  if (body && typeof body === "object") {
    const m = (body as Record<string, unknown>).message;
    if (typeof m === "string") return m;
    if (Array.isArray(m)) return m.join("; ");
  }
  return undefined;
}
