# smsbulk-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for the
[SMSBulk](https://smsbulk.net) SMS & Email verification API.

It lets MCP-compatible AI clients (Claude Desktop, IDE agents, etc.) browse the
SMSBulk service catalog and — with your own API key — order verification numbers
and read back received codes.

> **Status: experimental / v0.1.** Tool surface and behavior may change.

## Features

- 🔌 **Pure relay.** Forwards requests to the SMSBulk public API using *your*
  API key. No secrets stored, no other backend touched.
- 📖 **Keyless catalog browsing.** Services and countries can be listed without
  an API key.
- 📱 **SMS & 📧 Email verification.** Order numbers/addresses and read codes.
- 💸 **Optional soft spend cap.** A best-effort, client-side per-session USD
  limit (`MAX_SPEND_PER_SESSION`).

## Installation

```bash
git clone https://github.com/<your-org>/smsbulk-mcp.git
cd smsbulk-mcp
npm install
npm run build
```

## Configuration

Copy `.env.example` to `.env` and fill in your values:

| Variable                 | Required | Description                                                        |
| ------------------------ | -------- | ------------------------------------------------------------------ |
| `SMSBULK_API_KEY`        | for paid actions | Your personal SMSBulk API key (create one in the dashboard). |
| `SMSBULK_BASE_URL`       | no       | API base URL. Defaults to `https://smsbulk.net/api/v1`.            |
| `MAX_SPEND_PER_SESSION`  | no       | Soft USD spend cap per session. Blank/`0` disables it.             |

The `.env` file is git-ignored — **never commit your API key.**

## Safety & limitations

- **Best-effort retry protection, not guaranteed idempotency.** This server
  keeps a small in-memory guard to catch *accidental* duplicate calls (the same
  order tool fired twice in one session). It is **not** a guarantee — a restart,
  a second client, or a true server-side race can still result in duplicate
  orders. Treat it as a convenience seatbelt, not a contract.
- **Spend cap is soft.** `MAX_SPEND_PER_SESSION` is enforced client-side on a
  best-effort basis and resets when the server restarts.
- Authoritative rate limits, daily quotas, and balance checks are enforced
  server-side by the SMSBulk API per your key.

## License

[MIT](./LICENSE)
