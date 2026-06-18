# How Watch NORMA Uses Claude to Power Intelligent Sports Alerts

## Company Introduction

Watch NORMA is a real-time sports intelligence app that tells fans and bettors exactly when to tune into a live game based on their personal wagers, team loyalties, and prediction market positions. Built on React Native and Supabase, NORMA evaluates live play-by-play data across the NFL, NBA, MLB, NHL, and college sports and fires a single, precisely timed push notification when a user's stake is genuinely on the line.

---

## The Challenge: Sports Betting Data Is Deeply Unstructured

Sports bettors interact with their wagers across a dozen different surfaces. A DraftKings bet confirmation arrives as an email. A FanDuel slip gets screenshotted from a phone. A parlay sits as a handwritten note in a group chat. There is no standard format, no universal API for consumer wager data, and no clean way for a third-party app to know what a specific user has bet without the user doing manual work to enter it.

NORMA's core promise is that alerts are tied to what a user actually has at stake, not generic game state. That promise breaks down if wager data entry is a burden. The team needed to eliminate friction at three points: when a user photographs a paper bet slip, when a user forwards a sportsbook confirmation email, and when the content team needs to reach new users via social media. Each of these required understanding unstructured input and producing accurate, structured output at low latency.

---

## The Solution: Claude Across Three Distinct Pipelines

### 1. Bet Slip OCR via Claude Vision (`parse-bet-slip`)

When a user photographs a bet slip in the NORMA app, the image is sent as a base64-encoded payload to a Supabase Edge Function running on Deno. The function calls the Claude API with the image and a structured prompt that instructs Claude to extract every wager on the slip as a typed JSON object.

Claude returns each wager with its sportsbook, wager type (spread, moneyline, over/under, prop), team name, numeric line, and American odds string. Optional game context pulled from the NORMA database is appended to the prompt to improve entity matching when the user has already associated the slip with a specific game. Claude's confidence rating (high, medium, or low) is passed back to the client so the UI can surface a review prompt when extraction is uncertain.

The model used is `claude-sonnet-4-5`, which provides the accuracy and image understanding needed for real sportsbook UI layouts at a latency and cost suitable for a mobile on-demand call. The function enforces a 30-second abort timeout and handles markdown-wrapped JSON responses gracefully.

### 2. Email Wager Parsing with Claude Fallback (`ingest-email-wagers`)

Users can forward sportsbook confirmation emails to `bets@getnorma.app`. A Gmail Pub/Sub push subscription delivers new messages to a Supabase Edge Function, which uses a shared `email-parser` module to extract wager details from the email body.

The parser uses structured regex patterns for known sportsbook confirmation formats (DraftKings, FanDuel, BetMGM, Caesars). For emails that do not match a known template, the parser falls back to Claude via the Anthropic API to interpret the unstructured text and return a normalized wager object. Claude serves as the universal fallback for ambiguous or novel email formats, removing the need to maintain a growing library of brittle regex rules. Extracted wagers are inserted with `source = 'email_parse'` and flagged for in-app user confirmation before they drive alerts.

### 3. CMO Social Content Generation (`cmo-generate`)

NORMA's content pipeline uses Claude to generate Twitter posts for the `@watchNORMA` account on a recurring schedule driven by pg_cron. The `cmo-generate` Edge Function calls `claude-opus-4-5` with a detailed brand voice system prompt and a theme-specific user prompt to produce 2 to 4 posts per run.

The system prompt encodes NORMA's dual audience (bettors and advertisers), 11 proprietary moment types, specific brand voice rules (direct, insider, no corporate jargon), and strict Twitter formatting constraints (280 characters including hashtags, 2 to 4 hashtags max, at most one emoji). Themes rotate based on the day of the week and posting hour so content stays varied across a 7-day cycle. Posts are written to a `content_calendar` table as drafts for human review before scheduling.

---

## Technical Highlight: The NORMA Ads MCP Server

NORMA exposes its advertising inventory to AI agents via a Model Context Protocol (MCP) server hosted on Railway at `mcp.getnorma.app`. The MCP server (`norma-ads-mcp`) is an npm package that implements the MCP specification and provides six tools:

| Tool | Description |
|---|---|
| `create-campaign` | Launch a push notification ad campaign targeting specific moment types and sports |
| `update-campaign` | Modify budget, creative, or targeting mid-flight |
| `get-campaign-performance` | Retrieve impressions, clicks, spend, and CTR for a campaign |
| `get-inventory-forecast` | Estimate available impressions for a moment type and sport combination |
| `list-moment-types` | Enumerate NORMA's 11 proprietary moment types |
| `submit-brief` | Submit a natural-language advertising brief for AI-assisted campaign setup |

The MCP server connects any Claude-powered AI agent or Anthropic-compatible tooling directly to NORMA's Vickrey second-price auction engine. An advertising agency running a Claude-based media buying agent can call `get-inventory-forecast`, determine bid pricing via `get-campaign-performance` comparables, then call `create-campaign` with a complete creative payload, all without a human touching the NORMA dashboard.

This positions NORMA as one of the first sports advertising platforms with a native MCP interface, enabling agentic ad buying in a market that has historically required manual insertion orders.

---

## Results

*The following metrics are placeholders to be updated with live data after the App Store launch.*

| Metric | Result |
|---|---|
| Bet slip parse accuracy (high-confidence extractions) | [X]% |
| Average parse latency (image to structured JSON) | [X] seconds |
| Email wager parse success rate (all formats) | [X]% |
| Claude fallback rate for ambiguous emails | [X]% |
| Social posts generated per week via CMO agent | [X] posts |
| MCP server uptime | [X]% |
| Estimated engineering hours saved vs. manual rule-based parsers | [X] hours/month |

---

## Quote Placeholder

> "[Placeholder: Dave's quote about using Claude. Suggested angle: what it meant to ship bet slip scanning in a single Sprint, or what it felt like when the email parser correctly read a DraftKings parlay confirmation without any custom code for that format.]"
>
> Dave Maloney, Founder, Watch NORMA

---

## Outreach Email Template — Anthropic Developer Relations / Partnerships

**To:** developers@anthropic.com or partnerships@anthropic.com
**Subject:** Claude Case Study — Watch NORMA: AI-Powered Sports Bet Tracking and Agentic Ad Marketplace

---

Hi [Name],

I'm the founder of Watch NORMA (getnorma.app), a sports alert app that uses Claude at three distinct points in our product: Vision-based bet slip OCR, email wager parsing, and AI-generated social content via our CMO agent.

We also just shipped an MCP server (`norma-ads-mcp`) that exposes our sports push notification ad inventory to Claude-powered AI agents, making NORMA one of the first advertising platforms with native MCP tooling for agentic ad buying.

I'd love to explore a case study with the Anthropic team. Here is a quick summary of what we built:

**Bet Slip OCR** — Users photograph a bet slip; we call `claude-sonnet-4-5` with a structured prompt and get back a typed JSON wager object in under 5 seconds. This replaced what would have been a library of brittle per-sportsbook regex parsers.

**Email Wager Parsing** — Users forward bet confirmation emails to `bets@getnorma.app`. A regex layer handles known formats; Claude handles everything else. The fallback rate is low but the coverage is complete.

**CMO Social Agent** — `claude-opus-4-5` generates Twitter content on a pg_cron schedule using a detailed brand voice system prompt. Posts are reviewed by a human before scheduling.

**NORMA Ads MCP** — A deployed MCP server at `mcp.getnorma.app` lets any Claude-powered agent create, manage, and optimize push notification ad campaigns against our sports intent inventory via six typed tools.

I'd be happy to share code samples, a TestFlight build, or a short demo call. If Anthropic publishes developer case studies, I think NORMA is a strong story: a two-sided marketplace (consumer app + ad platform) where Claude is core infrastructure in both the user-facing product and the B2B go-to-market motion.

Thank you for building an API that made all of this achievable without a machine learning team.

Dave Maloney
Founder, Watch NORMA
dave@thed10.com
getnorma.app / @watchNORMA
