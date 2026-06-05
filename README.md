# smsbulk-mcp

An AI-native **SMS + Email verification** [Model Context Protocol](https://modelcontextprotocol.io)
(MCP) server for [SMSBulk](https://smsbulk.net). Use SMSBulk straight from Claude
Desktop, Cursor, or any MCP-compatible client — browse the catalog, order
verification numbers and disposable email addresses, and read back the codes.

> Unlike SMS-only providers, SMSBulk exposes **both phone and email** OTP
> verification through this server — the email tools (`email_*`) have no
> equivalent in most competing MCP servers.

> **Status: experimental / v0.1.** The tool surface may change.

## Features

- 🔌 **Pure relay.** Forwards requests to the SMSBulk public API using *your*
  API key. No secrets stored, no other backend touched.
- 📖 **Keyless catalog browsing.** List services and countries without a key.
- 📱 **SMS verification.** Order numbers and read SMS codes.
- 📧 **Email verification.** Order disposable addresses and read OTP/HTML — a
  genuine differentiator vs SMS-only servers.
- 🛟 **Best-effort retry guard** and an optional **soft spend cap** (see
  [Safety & limitations](#safety--limitations) — honestly scoped, not magic).

## Prerequisites

- **Node.js 18+**
- A **SMSBulk API key** — create one at
  [smsbulk.net/dashboard/api-keys](https://smsbulk.net/dashboard/api-keys).
  (The catalog tools work without a key; everything else needs one.)

## Installation

```bash
git clone https://github.com/Tolunay3434/smsbulk-mcp.git
cd smsbulk-mcp
npm install
npm run build
```

This produces `dist/index.js`, the executable MCP server.

## Configuration

Set these via your MCP client's `env` block (below) or a local `.env` (copy
`.env.example`):

| Variable                | Required          | Default                        | Description                                                  |
| ----------------------- | ----------------- | ------------------------------ | ------------------------------------------------------------ |
| `SMSBULK_API_KEY`       | for paid actions  | —                              | Your personal API key. Catalog tools work without it.       |
| `SMSBULK_BASE_URL`      | no                | `https://smsbulk.net/api/v1`   | API base URL. Override only if self-hosting.                |
| `MAX_SPEND_PER_SESSION` | no                | _(disabled)_                   | Soft USD spend cap per session. Blank/`0` disables it.       |

> The `.env` file is git-ignored — **never commit your API key.**

### Claude Desktop

Edit your config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "smsbulk": {
      "command": "node",
      "args": ["/absolute/path/to/smsbulk-mcp/dist/index.js"],
      "env": {
        "SMSBULK_API_KEY": "your_api_key_here",
        "MAX_SPEND_PER_SESSION": "5"
      }
    }
  }
}
```

Restart Claude Desktop. The SMSBulk tools appear in the tools menu.

### Cursor

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per-project):

```json
{
  "mcpServers": {
    "smsbulk": {
      "command": "node",
      "args": ["/absolute/path/to/smsbulk-mcp/dist/index.js"],
      "env": {
        "SMSBULK_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

> Replace `/absolute/path/to/smsbulk-mcp` with the real path where you cloned the
> repo. On Windows, use a full path like
> `C:\\Users\\you\\smsbulk-mcp\\dist\\index.js`.

## Tool reference

18 tools. Catalog tools need no key; all others send your `x-api-key`.

### Catalog — no API key required

| Tool                    | Parameters | Description                                                       |
| ----------------------- | ---------- | ----------------------------------------------------------------- |
| `list_services`         | —          | All active services with stock and minimum-price summaries.       |
| `list_countries`        | —          | All supported countries with flags and ISO codes.                 |
| `get_service`           | `slug`     | One service by SEO slug or service code.                          |
| `get_service_countries` | `slug`     | In-stock countries for a service, with prices, stock, speed tiers.|

### SMS verification — API key required

| Tool              | Parameters                                                | Description                                                                 |
| ----------------- | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `request_number`  | `serviceCode`, `countryIso`, `operator?`, `idempotency_token?` | **Spends.** Reserve a number for SMS verification. Retry-guarded.       |
| `get_status`      | `id`                                                      | Status + SMS code (once received) for one activation.                       |
| `complete`        | `id`                                                      | Mark an activation complete (final).                                        |
| `cancel`          | `id`                                                      | Cancel; refunds the wallet if no SMS arrived.                               |
| `request_resend`  | `id`                                                      | Ask the provider to send another SMS to the same number.                    |
| `list_activations`| `limit?`, `cursor?`, `status?`                            | Your activations, cursor-paginated, newest first.                           |

### Wallet — API key required

| Tool                | Parameters         | Description                                          |
| ------------------- | ------------------ | ---------------------------------------------------- |
| `get_balance`       | —                  | Current wallet balance.                              |
| `list_transactions` | `limit?`, `cursor?`| Recent deposits, debits, and refunds.                |

### Email verification — API key required _(not available on SMS-only servers)_

| Tool                | Parameters                              | Description                                                            |
| ------------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| `email_get_domains` | `site`                                  | Available email provider domains for a target site, with prices/stock. |
| `email_request`     | `site`, `domain`, `idempotency_token?`  | **Spends.** Reserve a disposable email address. Retry-guarded.         |
| `email_list`        | `limit?`                                | Your recent email activations (newest first, up to 100; no cursor).    |
| `email_get_status`  | `id`                                    | Status, parsed OTP, and raw HTML body (once received).                 |
| `email_reorder`     | `id`                                    | **Spends.** Re-open the same address for another OTP.                  |
| `email_cancel`      | `id`                                    | Cancel; refunds the wallet if no OTP arrived.                          |

## Safety & limitations

Please read this — these guards are **convenience seatbelts, not guarantees.**

### Best-effort retry protection (not guaranteed idempotency)

`request_number` and `email_request` keep a small **in-memory** guard that catches
the common accidental case: the same order tool fired twice in one session with
identical arguments. The second call **replays the first result without charging
again.**

It is **not** guaranteed idempotency:

- It lives only in this process's memory and **resets on restart**.
- It does **not** coordinate across multiple clients or processes.
- It **cannot** prevent a true server-side race.

To safely retry one intended order, pass the **same** `idempotency_token`. To
deliberately place a **second** order with identical arguments, pass a
**different** `idempotency_token`.

### Soft spend cap (`MAX_SPEND_PER_SESSION`)

When set, the server tracks the **real** cost of each successful order and
**blocks the next order** once the running total reaches your cap.

- It's **soft and in-memory** — resets on restart, this session only.
- It blocks the **next** request; it does **not** split or pre-authorize a single
  request. An order made while still under the cap is allowed even if it pushes
  the total over.
- It's an **extra** layer — your account's authoritative limits (balance, daily
  quota, rate limits) are always enforced server-side.

## Troubleshooting

| Symptom                                   | Fix                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `Authentication failed (401)`             | Check `SMSBULK_API_KEY` is set and valid. The key is sent as the `x-api-key` header. |
| `This action requires an API key`         | A paid/account tool was called with no key. Set `SMSBULK_API_KEY`.             |
| Out of stock / `503`                      | No numbers right now for that service+country. Try another country or service. |
| Insufficient balance / `400`              | Top up at [smsbulk.net/dashboard](https://smsbulk.net/dashboard).              |
| `Rate limit or daily quota exceeded (429)`| Slow down, or wait for the daily quota (UTC) to reset.                         |

## Links

- 🌐 Website: [smsbulk.net](https://smsbulk.net)
- 🔑 API keys: [smsbulk.net/dashboard/api-keys](https://smsbulk.net/dashboard/api-keys)
- 📱 SMS API docs: [smsbulk.net/docs/sms-activate](https://smsbulk.net/docs/sms-activate)
- 📧 Email API docs: [smsbulk.net/docs/email-api](https://smsbulk.net/docs/email-api)
- 📚 Interactive API reference (Swagger): [smsbulk.net/api/docs](https://smsbulk.net/api/docs)

## License

[MIT](./LICENSE)
