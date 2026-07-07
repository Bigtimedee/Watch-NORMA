# X (Twitter) Launch Thread — NORMA Agentic Ad Platform

Target audience: ad tech engineers, DSP engineers, AI agent builders, MCP ecosystem.
Tone: matter-of-fact, technical credibility.
Count: 9 posts.

---

**1/9**

We built a sports ad marketplace where an AI agent can buy push notification inventory, manage campaigns, and pull performance data without a human in the loop on each trade.

It runs over MCP.

Here is what we built and how it works.

---

**2/9**

NORMA is a push notification app for NCAA basketball, NBA, and MLB bettors.

The app fires alerts at 11 named in-game moments: spread moves, close games, overtime, resolved predictions, and more.

Each moment is a named inventory slot with a documented floor CPM and CTR range.

---

**3/9**

Floor CPMs by moment:

prediction_resolved: $0.60 (11–17% CTR)
bet_resolved: $0.50 (9–15%)
overtime: $0.40 (12–18%)
close_game: $0.35 (7–13%)
spread_alert: $0.30 (6–10%)

Down to follow_alert at $0.10 floor.

Second-price Vickrey auction. You pay $0.01 above second-highest bid.

---

**4/9**

The MCP server (`norma-ads-mcp` on npm) registers 6 tools:

• list_moment_types
• get_inventory_forecast
• create_campaign
• update_campaign
• get_campaign_performance
• submit_brief

Supports stdio (local) and HTTP/SSE (remote).

Discovery at getnorma.app/adagents.json in ADCP 1.0 format.

---

**5/9**

Here is what a `submit_brief` call looks like:

```json
{
  "name": "create_campaign",
  "arguments": {
    "demand_type": "sportsbook",
    "moment_types": ["spread_alert", "close_game", "bet_resolved"],
    "sport": "ncaa_basketball",
    "bid_cpm_usd": 0.38,
    "daily_budget_usd": 250,
    "attribution_window_minutes": 30
  }
}
```

The agent queries inventory, drafts the campaign, and submits. No dashboard required.

---

**6/9**

Auth is OAuth 2.0 Client Credentials (RFC 6749) at api.getnorma.app/auth/token.

RS256 JWT, 1-hour TTL. Scopes: campaigns:read, campaigns:write, reporting:read, inventory:read.

OpenAPI spec at api.getnorma.app/openapi.json. REST API has 18 routes under /api/ads/.

---

**7/9**

Attribution transparency:

CTA tap in NORMA = app-verified.
App return within 30 min = app-verified.

sportsbook_open, wager_placed, stream_open = **inferred**. We detect the external app opened. We do not confirm the downstream action. No live partner callbacks yet.

S2S postback supported to upgrade inferred to confirmed. Email ads@getnorma.app.

---

**8/9**

Sports live today: NCAA basketball, NBA, MLB.

NFL and NCAAF inventory opens September 1, 2026.

The remote HTTP/SSE endpoint (mcp.getnorma.app) is code-complete and Docker-ready. DNS is not yet propagated. Email ads@getnorma.app for early access.

stdio works today via `npm install -g norma-ads-mcp`.

---

**9/9**

If you are building ad-buying agents, media planning workflows, or AI-native DSP tooling and want programmatic access to high-intent sports push inventory:

Docs: getnorma.app/developers
OpenAPI: api.getnorma.app/openapi.json
Discovery: getnorma.app/adagents.json

Email: ads@getnorma.app
