# Sports Ad Inventory, Native to Your AI Workflow

Push notifications are the highest-intent surface in sports media. A bettor who just saw their spread move gets a push at the exact moment they are ready to act. The problem has never been reach — it has been latency. By the time a campaign manager notices a live-game moment, logs into a DSP, and adjusts targeting, the moment is gone.

NORMA built a marketplace around that gap.

---

## The Intent-Moment Model

NORMA is a push notification app for NCAA basketball, NBA, and MLB bettors. The app fires alerts at specific in-game moments: spread movements, close games, overtime, resolved predictions, and eleven moment types in total. Each of those moments is a named inventory slot with a floor CPM and a documented click-through range.

| Moment | Floor CPM | Typical CTR |
|---|---|---|
| prediction_resolved | $0.60 | 11–17% |
| bet_resolved | $0.50 | 9–15% |
| overtime | $0.40 | 12–18% |
| close_game | $0.35 | 7–13% |
| spread_alert | $0.30 | 6–10% |
| moneyline_alert | $0.30 | 5–9% |
| total_alert | $0.25 | 4–8% |
| prop_alert | $0.25 | 4–8% |
| position_alert | $0.20 | 3–7% |
| foul_trouble | $0.15 | 2–6% |
| follow_alert | $0.10 | 2–4% |

The floor CPMs are hard floors. Programmatic bids run a second-price Vickrey auction: you pay one cent above the second-highest bid, not your full bid. There is no separate pricing tier for programmatic versus managed campaigns.

---

## The Agentic Layer

The core problem with live-sports advertising is that the decision window is seconds, not hours. We built NORMA's ad infrastructure so that an AI agent — whether a Claude workflow, a LangChain pipeline, or any MCP-compatible client — can query inventory, evaluate forecasts, and submit a campaign without a human in the loop on each trade.

### MCP Server

The `norma-ads-mcp` npm package exposes six tools:

- `list_moment_types` — returns the full moment type catalog with floor CPMs and CTR ranges
- `get_inventory_forecast` — returns a 7-day supply forecast by moment type and sport
- `create_campaign` — creates a new campaign with creative, targeting, and bid parameters
- `get_campaign_performance` — pulls spend, impressions, taps, and inferred conversions for a campaign
- `update_campaign` — modifies budget, bid, or creative on a live campaign
- `submit_brief` — accepts a human-readable brief and returns a structured campaign draft for review

The server supports two transports. For local development, stdio connects directly from any MCP-compatible host (Claude Desktop, Cursor, etc.) after a single `npm install`. For remote or multi-tenant setups, an HTTP/SSE endpoint is coming at `https://mcp.getnorma.app` — the code and Docker image are production-ready, and the subdomain is pending DNS propagation. Contact ads@getnorma.app for early access.

### Discovery and Spec

Agents that crawl for ad inventory can find NORMA via:

- `https://getnorma.app/adagents.json` — ADCP 1.0 format, IAB categories IAB17 and IAB17-44, protocols `adcp@1.0`, `mcp@1.0`, and `openrtb@2.6`
- `https://api.getnorma.app/openapi.json` — full REST spec for the 18 routes under `/api/ads/`
- `https://getnorma.app/developers` — integration docs

### OAuth

Token issuance follows RFC 6749 Client Credentials at `https://api.getnorma.app/auth/token`. Tokens are RS256-signed JWTs with a 1-hour TTL. Available scopes: `campaigns:read`, `campaigns:write`, `reporting:read`, `inventory:read`. The token endpoint is rate-limited at 10 requests per minute per IP.

---

## Attribution: What We Can Verify Today

This section matters enough to be explicit about.

**App-verified events:** a CTA tap inside NORMA and an app return within the 30-minute attribution window. These are tracked directly by the NORMA client.

**Inferred events:** `sportsbook_open`, `stream_open`, `commerce_open`, and `wager_placed`. These fire when NORMA detects that an external app was opened following a tap. The downstream action — whether a bet was placed, a stream was watched, a purchase was completed — is **not confirmed**. There are no live partner callbacks at this time. Label these as inferred in any reporting you surface to clients.

The 30-minute window covers in-app event tracking. Server-to-server postback is supported for advertisers who want to upgrade inferred conversions to confirmed ones. Contact ads@getnorma.app to configure.

---

## 5-Minute stdio Quickstart

```bash
npm install -g norma-ads-mcp
```

Set your API key:

```bash
export NORMA_API_KEY=your_key_here
```

In any MCP-compatible client, register the server with `norma-ads-mcp` as the command. Then call `submit_brief` with a structured campaign object:

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

Creative constraints: headline max 60 characters, body max 120 characters, icon required (HTTPS URL, 192x192 px recommended), action URL required.

---

## Sports Coverage

NCAA basketball, NBA, and MLB are live today. NFL and NCAAF inventory opens September 1, 2026 at NFL kickoff.

---

## Get Access

Email ads@getnorma.app for an API key, early HTTP/SSE access, or postback configuration. The OpenAPI spec and developer docs are public at `https://getnorma.app/developers`.
