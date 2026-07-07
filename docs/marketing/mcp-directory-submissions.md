# MCP Directory Submissions

> **IMPORTANT:** Do not submit any of these entries until `mcp.getnorma.app` DNS is confirmed live and returning 200 from `GET https://mcp.getnorma.app/health`.

---

## Standard Metadata Blurb

Use this blurb as the base for all submissions. Adjust formatting to match each directory's form fields.

**Name:** NORMA Sports Ad Marketplace

**Description:** NORMA is a push notification ad platform for NCAA basketball, NBA, and MLB. The MCP server gives AI agents programmatic access to live sports inventory via six tools: list moment types, get supply forecasts, create and update campaigns, retrieve performance data, and submit campaign briefs. Second-price Vickrey auction; 11 named moment types from follow_alert ($0.10 floor) to prediction_resolved ($0.60 floor).

**MCP Endpoint:** `https://mcp.getnorma.app`

**Transports:** stdio (local, via `norma-ads-mcp` npm package), HTTP/SSE (remote)

**Auth Method:** OAuth 2.0 Client Credentials (RFC 6749), RS256-signed JWT, 1-hour TTL. Token endpoint: `https://api.getnorma.app/auth/token`

**npm Package:** `norma-ads-mcp`

**Health Check:** `GET https://mcp.getnorma.app/health` (no auth required)

**Tags/Categories:** advertising, ad tech, sports, push notifications, programmatic, MCP, DSP, media buying

---

## Directory Submissions

### 1. MCP Official Server List

**Submission URL:** `https://github.com/modelcontextprotocol/servers` (submit via pull request to the README or servers list)

**Notes:** The official MCP server list is maintained as an open-source GitHub repository. Open a PR adding an entry under the relevant category (tools / data / APIs). Follow the existing entry format in the repo.

**Paste-ready entry (Markdown list format):**

```
- [NORMA Sports Ad Marketplace](https://mcp.getnorma.app) — Programmatic access to sports push notification ad inventory. Six tools for inventory forecasting, campaign management, and performance reporting. NCAA basketball, NBA, and MLB live. OAuth 2.0 auth.
```

---

### 2. Smithery

**Submission URL:** `https://smithery.ai` (look for "Submit a server" or "Add server" in the dashboard)

**Notes:** Smithery is an MCP server marketplace. As of knowledge cutoff, submissions are handled via their web interface. Verify the current submission path at smithery.ai before proceeding.

**Paste-ready metadata:**

```
Name: NORMA Sports Ad Marketplace
npm: norma-ads-mcp
Endpoint: https://mcp.getnorma.app
Transport: stdio, HTTP/SSE
Auth: OAuth 2.0 Client Credentials
Description: Push notification ad inventory for live sports moments. Six MCP tools covering supply forecasts, campaign creation, performance reporting, and brief submission. NCAA basketball, NBA, and MLB. Second-price Vickrey auction. Floor CPMs from $0.10 to $0.60 by moment type.
Tags: advertising, programmatic, sports, push notifications, ad tech
```

---

### 3. Glama

**Submission URL:** `https://glama.ai` (verify current submission path at the site — as of knowledge cutoff, Glama maintains a curated MCP directory)

**Notes:** Glama indexes MCP servers with metadata for agent discovery. Verify whether they accept self-submissions via a form or require a PR.

**Paste-ready metadata:**

```
Name: NORMA Sports Ad Marketplace
Package: norma-ads-mcp (npm)
Remote endpoint: https://mcp.getnorma.app
Transports: stdio, HTTP/SSE
Auth: OAuth 2.0 (client credentials), RS256 JWT
Tools: list_moment_types, get_inventory_forecast, create_campaign, get_campaign_performance, update_campaign, submit_brief
Sports: NCAA basketball, NBA, MLB
Description: AI-native ad platform for sports push notifications. Agents can query live inventory, place programmatic bids, and manage campaigns without human intervention. Moment-targeted inventory with documented floor CPMs and CTR ranges.
```

---

### 4. Anthropic Partner Directory

**Submission URL:** verify URL before submitting — `https://www.anthropic.com/partners` or contact partners@anthropic.com

**Notes:** Anthropic maintains a partner and integration directory for Claude-compatible tools. As of knowledge cutoff, there is no confirmed self-serve submission form for MCP servers specifically. Reach out via partners@anthropic.com or check the developers portal at `https://docs.anthropic.com` for current guidance.

**Paste-ready description:**

```
NORMA Sports Ad Marketplace — MCP server (norma-ads-mcp) giving Claude agents native access to sports push notification ad inventory. Six tools. OAuth 2.0. NCAA basketball, NBA, MLB live. ADCP 1.0 and OpenRTB 2.6 compatible. Discovery at https://getnorma.app/adagents.json.
```

---

## IAB and AdTech Indexes

### 5. IAB ADCP Registry

**Notes:** ADCP (Agent-Driven Campaign Protocol) is an emerging standard. As of knowledge cutoff, a formal IAB self-serve ADCP registry submission form is not confirmed to exist publicly. The `adagents.json` file at `https://getnorma.app/adagents.json` already follows ADCP 1.0 format with IAB categories IAB17 and IAB17-44, which is the discoverable artifact the protocol depends on.

**Action:** verify URL before submitting — check `https://iabtechlab.com` for any ADCP registry or listing process. If none exists, the `adagents.json` endpoint is the correct self-publication mechanism.

### 6. ads.txt and sellers.json

These files are already served from the domain. No submission is required — crawlers discover them automatically. Confirm the following are accessible before launch:

- `https://getnorma.app/ads.txt`
- `https://getnorma.app/sellers.json`

If either file is missing or returns a non-200, resolve before outbound outreach to DSPs or agency buyers.

---

## Checklist

- [ ] `mcp.getnorma.app` DNS live and `/health` returns 200
- [ ] MCP Official Server List PR opened
- [ ] Smithery submission completed
- [ ] Glama submission completed
- [ ] Anthropic partner directory — contact initiated
- [ ] IAB ADCP registry — URL verified or confirmed not yet available
- [ ] `ads.txt` accessible at domain root
- [ ] `sellers.json` accessible at domain root
