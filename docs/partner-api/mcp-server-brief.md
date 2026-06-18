# NORMA MCP Server — Partner Technical Brief

**Endpoint:** `https://mcp.getnorma.app`
**Protocol:** Model Context Protocol (MCP) over HTTP/SSE
**Version:** 1.0
**Contact:** ads@getnorma.app

---

## What Is the MCP Server?

NORMA's MCP server exposes the full ad buying workflow — inventory discovery, campaign creation, bid management, and performance reporting — as structured tool calls that any MCP-compatible AI agent or DSP can invoke programmatically.

This means a media buying agent at FanDuel or DraftKings can connect once, then automate the entire NORMA campaign lifecycle: query available inventory for tonight's games, check projected impressions for a specific moment type, submit a campaign, and pull daily performance data — all without logging into a UI or making raw REST calls.

The MCP server speaks the same protocol used by Claude, Cursor, and other AI-native toolchains. If your team uses an AI assistant for campaign planning, NORMA's inventory is now natively accessible from that workflow.

---

## Who Is This For?

- **Media buying teams** at sportsbooks or streaming services running campaigns in NORMA's intent-moment marketplace
- **DSP engineers** building programmatic integrations against NORMA's inventory
- **AI-powered campaign managers** (internal or third-party) that need structured tool access to NORMA's platform

---

## How to Connect

### 1. Get an API Key

Contact ads@getnorma.app to request a partner API key. Keys are provisioned per advertiser account and scoped to your campaigns.

### 2. Open an SSE Session

```http
GET https://mcp.getnorma.app/sse
Authorization: Bearer <YOUR_NORMA_API_KEY>
```

This opens a persistent Server-Sent Events connection. The server responds with your `sessionId`.

### 3. Send Tool Calls

```http
POST https://mcp.getnorma.app/message?sessionId=<SESSION_ID>
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_moment_types",
    "arguments": {}
  }
}
```

### 4. Health Check

```http
GET https://mcp.getnorma.app/health
```

Returns `{ "status": "ok", "transport": "http-sse" }` — no auth required.

---

## Available Tools

| Tool | Description |
|------|-------------|
| `list_moment_types` | Returns all 11 moment types with floor CPMs, typical CTR ranges, and trigger conditions |
| `get_inventory_forecast` | Returns a 7-day supply forecast (projected impressions) for a given moment type, sport, or date range |
| `create_campaign` | Creates a new campaign with creative, targeting (moment type, sport, geo), bid, and daily budget |
| `update_campaign` | Updates an active campaign's bid, budget cap, creative, or status (pause/resume) |
| `get_campaign_performance` | Returns impression, click, and conversion data for a campaign over a specified date range |
| `submit_brief` | Accepts a plain-language campaign brief and returns a draft campaign configuration for review before creation |

---

## Moment Types and Floor CPMs

| Moment | Floor CPM | Typical CTR |
|--------|-----------|-------------|
| Prediction Resolved | $0.60 | 11–17% |
| Bet Resolved | $0.50 | 9–15% |
| Overtime | $0.40 | 12–18% |
| Close Game | $0.35 | 7–13% |
| Spread Alert | $0.30 | 6–10% |
| Moneyline Alert | $0.30 | 5–9% |
| Total Alert | $0.25 | 4–8% |
| Prop Alert | $0.25 | 4–8% |
| Position Alert | $0.20 | 3–7% |
| Foul Trouble | $0.15 | 2–6% |
| Follow Alert | $0.10 | 2–4% |

All pricing via Vickrey (second-price) auction. You pay one cent above the second-highest bid, never your max.

---

## Example: Create a Campaign via Agent

```json
{
  "name": "create_campaign",
  "arguments": {
    "name": "FanDuel March Madness — Spread Alert Push",
    "demand_type": "sportsbook",
    "moment_types": ["spread_alert", "close_game", "bet_resolved"],
    "sport": "ncaa_basketball",
    "creative": {
      "headline": "Your bet is live",
      "body": "The spread is moving. Open FanDuel now.",
      "cta_url": "https://sportsbook.fanduel.com",
      "cta_label": "Bet Now"
    },
    "bid_cpm_usd": 0.38,
    "daily_budget_usd": 250,
    "attribution_window_minutes": 30
  }
}
```

---

## Also Available: REST API and OpenAPI Spec

For teams not using MCP, the same campaign operations are available via a standard REST API. OpenAPI spec: `https://api.getnorma.app/openapi.json`

The `adagents.json` discovery file at `https://getnorma.app/adagents.json` describes NORMA's full inventory, protocols, and agent endpoint for automated discovery by DSP platforms.

---

## Attribution

NORMA tracks impressions, clicks, and conversion events. Server-to-server postback callbacks are supported for verified conversion attribution (e.g., bet placed after seeing a NORMA ad). Contact ads@getnorma.app to configure postback endpoints.

---

*NORMA — Sports bettor push notification marketplace. getnorma.app*
