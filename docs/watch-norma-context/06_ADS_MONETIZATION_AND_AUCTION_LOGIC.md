# 06 — Ads, Monetization, and Auction Logic

## Monetization Thesis

Watch-NORMA monetizes attention at the exact moment the user is most likely to act. The app's inventory is not generic impressions — it is context-rich, intent-rich sports attention moments. When a user receives an alert that their spread bet is live with 2 minutes left, they are maximally engaged. An ad attached to that moment (e.g., a sportsbook CTA or streaming offer) reaches the user at peak relevance.

This is fundamentally different from banner ads or pre-roll video. NORMA's ad unit is a sponsored line attached to a push notification or in-app alert card. The ad is contextually matched to the moment type, the user's interests, and the game state.

## Ad Surfaces

All ad surfaces are implemented and integrated into the alert pipeline.

**Alert-ad companion (primary).** Every alert that clears the throttle/dedup stage enters the Vickrey auction. If a sponsor wins, their logo, copy, and CTA URL are attached to the alert card. The sponsor text appears below the alert explanation. The CTA button (e.g., "Bet Now on DraftKings") appears alongside the "Watch on [Provider]" button.

**In-app alert card.** The `AlertCard` component renders the sponsor logo, sponsor text, and CTA button when present. Tapping the CTA opens the sportsbook or advertiser deep link.

**Moment types that trigger auctions:** close_game, spread_alert, total_alert, moneyline_alert, player_prop, comeback, overtime, game_resolved, prediction_resolved, foul_trouble, mlb_close_game, mlb_walk_off, football_close_game, football_two_minute, football_overtime, and others. Football types are in the DB but gated behind `ALERTABLE_SPORTS` until Sept 2026.

## Vickrey Auction Engine

The auction runs inside `_shared/auction-engine.ts` and is called by `evaluate-alerts` for each approved alert.

### Auction Pipeline (11 steps, target < 50ms)

1. **Moment fires** — a scoreable alert passes the threshold.
2. **Fatigue check** — `computeFatigueScore()` calculates exponential decay: `score = 0.5^(sponsored_alerts_last_24h / 3)`. If score < 0.25 (user has seen 6+ sponsored alerts in 24 hours), skip sponsor attachment entirely.
3. **Ad personalization check** — if the user has disabled ad personalization, behavioral signals are excluded from targeting (but the auction still runs).
4. **Frequency caps** — max 3 ads per user per day. Max 1 impression per campaign per user per 24 hours.
5. **Floor price** — `getEffectiveFloor()` from `_shared/pricing-engine.ts` fetches the base floor for the moment type, applies a premium multiplier, and adds dynamic premium modifiers.
6. **Eligible bids** — query bids table for campaigns that: match the moment type, have budget remaining, have not hit daily caps, bid at or above the effective floor, and have `approval_status = 'approved'`.
7. **Direct deal check** — campaigns with `priority_tier > 0` (guaranteed-delivery contracts) auto-win if eligible. Direct deals bypass competitive auction.
8. **Category exclusivity** — max 1 advertiser per category per notification. If two sportsbook advertisers bid on the same moment, only the higher bidder competes.
9. **Budget pacing** — campaigns spending > 110% of their hourly ideal pace are excluded. `ad-budget-pacer` checks every 5 minutes and auto-pauses over-pacing campaigns.
10. **Rank by effective bid value** — `effective_bid = base_bid × game_relevance_boost (1.2x if campaign targets this game/team) × creative_performance_boost (up to 1.1x based on CTR) × segment_match_boost (1.15x if user matches target audience)`.
11. **Second-price clearing** — the winner pays $0.01 above the second-highest bid (Vickrey mechanism). If only one bidder, they pay the floor price.

### Thompson Sampling Creative Selection

After the auction winner is determined, `selectCreativeVariant()` from `_shared/ai-ad-engine.ts` selects which creative variant (A/B/C) to show. It uses a multi-armed bandit approach:

- Each creative variant has `alpha` (successes/taps) and `beta` (failures/no-tap) parameters.
- A random sample is drawn from `Beta(alpha, beta)` for each variant.
- The variant with the highest sample wins.
- After `EXPLORATION_THRESHOLD` (100) impressions per variant, the system locks to the best-performing creative, ending exploration.

### Auction Result Recording

`recordAuctionResult()` logs the impression to the `impressions` table with: campaign_id, creative_id, alert_id, user_id, clearing_price, moment_type, game context, and delivery_ms. It also deducts the clearing price from the campaign's remaining budget.

## Floor Pricing (P2-05)

### Per-Category Floor Prices

Stored in `floor_prices` table. Migration 076 added a `sport` column (NULL = global fallback) so floors can be differentiated by `(moment_type, sport)`. The auction engine calls `getCategoryFloor(supabase, momentType, sport)` which prefers a sport-specific row and falls back to the global row.

**Guardrails (migration 076):** Every floor row has `min_floor_cents` (default $0.05) and `max_floor_cents` (default $2.00) columns. The optimizer and manual admin changes are bounded by these values. They are configurable per moment_type × sport.

**Learned floor blending:** When `learned_floor_cents` is set by the optimizer, the effective floor = `learned × 0.6 + base × 0.4`, then clamped to [min, max]. The transform is deterministic and documented.

Hardcoded defaults from `_shared/pricing-engine.ts` (used when DB query fails):

| Moment Type | Default Floor |
|-------------|---------------|
| `prediction_resolved` | $0.60 |
| `bet_resolved` | $0.50 |
| `close_game` | $0.35 |
| `overtime` | $0.40 |
| `spread_alert` | $0.30 |
| `moneyline_alert` | $0.30 |
| `total_alert` | $0.25 |
| Default (other types) | $0.10 |

### Football Floor Prices (migration 20260706000004)

Sport-specific floor prices for NFL and NCAAF moment types, using the `(moment_type, sport)` unique index from migration 076. These supplement (not replace) the global fallback rows. NFL commands a premium over NCAAF due to higher advertiser demand.

| Moment Type | NFL Floor | NCAAF Floor | Notes |
|-------------|-----------|-------------|-------|
| `football_close_game` | $0.40 | $0.35 | Q4/OT one-score games; also covers spread/total/moneyline proximity alerts |
| `football_two_minute` | $0.45 | $0.40 | Q4 two-minute drill; NFL also fires Q2 warning |
| `football_overtime` | $0.50 | $0.45 | Period ≥ 5; highest-drama football moment |

All football floor rows share `min_floor_cents = 5`, `max_floor_cents = 200`. These rows are **gated** — they are in the database but football is not in `ALERTABLE_SPORTS` until the Sept 1, 2026 NFL kickoff.

### Dynamic Premium Multipliers

`computeDynamicPremium()` applies contextual multipliers:

| Condition | Multiplier |
|-----------|------------|
| NCAA Tournament game | 1.5x |
| Weekend (Saturday/Sunday) | 1.2x |
| High density (10+ simultaneous games) | 1.3x |
| Late game / OT (< 2 min remaining, margin ≤ 6) | 1.5x |

### Floor Price Optimizer

The `floor-price-optimizer` Edge Function runs daily at 3 AM ET and adjusts floors based on auction feedback:

- High clearing ratio (> 2.0) + high fill rate (> 80%) → +15% adjustment
- High clearing (> 1.5) + rising trend (> 1.1) → +10%
- Low fill rate (< 30%) + weak clearing (< 1.2) → -10%
- Low fill (< 50%) + declining trend (< 0.9) → -5%

Guardrails: max ±20% per day, bounded by per-row `min_floor_cents`/`max_floor_cents`, minimum 50 auctions per moment type before any adjustment.

### Admin Yield Panel

`/admin/revenue/yield` — server-rendered, admin-gated. Shows floor vs. avg clearing price vs. fill rate per `moment_type × sport`, rolling 30 days. Data source: `floor_yield_stats` view (migration 076). Admins can see which moment/sport combos are hitting guardrails and whether floors are over- or under-priced.

## Demand Categories (P2-06)

Campaigns now have a `demand_type` column (migration 077): `sportsbook | streaming | commerce`. This controls:

| Demand Type | CTA Label | Geo-filter | Conversion type (inferred) |
|-------------|-----------|------------|---------------------------|
| `sportsbook` | Bet Now | Yes — state jurisdiction check | `sportsbook_open`, `wager_placed` |
| `streaming` | Watch Now | No — unrestricted | `stream_open` |
| `commerce` | Shop Now | No — unrestricted | `commerce_open` |

**Live vs. open for first deals (July 2026):** Sportsbook campaigns are live. Streaming and commerce demand types are fully plumbed and open for first advertiser deals (July 2026 audit confirmed end-to-end functionality: campaign creation, brand safety gate, auction eligibility, CTA rendering, geo-filter exemption, and post_outcome moment firing all work correctly). New streaming and commerce campaigns start in `brand_safety_status = 'pending'` review before entering the auction. The campaign creation UI shows a "New" category badge and a "Pending brand review before going live" message for streaming and commerce — not a "scaffolded" or disabled state. See `docs/sales/streaming-commerce-readiness.md` for the full audit report.

**What changes:** Campaign creation flow asks buyers to select a demand type; the CTA placeholder updates accordingly. Auction clearing logic is unchanged — only eligibility and rendering are category-aware.

## Fraud Detection

The `ad-fraud-check` Edge Function runs hourly and detects:

| Fraud Type | Threshold | Action |
|------------|-----------|--------|
| Impression stuffing | > 100 impressions in 1 minute | Auto-pause campaign |
| Anomalous CTR | > 50% CTR in 1 hour (≥ 20 impressions) | Flag for review |
| Budget drain | > 80% daily budget spent in < 1 hour | Auto-pause campaign |
| Rapid clicks | > 3 taps per user per minute on same campaign | Flag + record |

Detected events are logged to `ad_fraud_events` with event type, evidence (JSONB), and affected campaign/user. The admin fraud dashboard (`/admin/fraud`) provides review and resolution.

## Auto-Bidder

The `ad-auto-bidder` Edge Function runs every 30 minutes and adjusts bids for campaigns using automatic bidding strategies:

- **Target CPA strategy:** If observed CPA > target → bid × 0.9; if observed CPA < target → bid × 1.1. Capped at ±10% per adjustment cycle.
- **Maximize Impressions strategy:** bid = floor_price + $0.01 (always bid just above the floor).

## Intent Moment (P2-01) — The Unit of Inventory

The `intent_moments` table (migration 073) is the explicit, normalized record of every qualifying game moment — the tradeable unit of NORMA's marketplace.

One row is written per (game_id, moment_type, period, margin_bucket) per `evaluate-alerts` invocation, **after** delivery. This is observational: it never alters alert behavior or delivery latency.

Fields:
- `intent_score` (0–1) — deterministic transform of alert score + game-state premiums (overtime +0.08, final 2 min +0.05, close game +0.02, final 5 min +0.01), computed by `computeIntentScore()` in `_shared/alert-scoring.ts`
- `eligible_user_count` — number of users who triggered this moment type
- `game_context` — aggregate game state (no user identity)
- `signals_snapshot` — key game-level signals
- `auction_outcome` — `filled` | `unfilled` | `ineligible`
- `clearing_price_cents` — second-price clearing when filled

Privacy: the table contains no user identity (no user_id). Authenticated users can SELECT (aggregate game data); only service_role can write.

The `intent_moments` table feeds:
- Supply forecasting (P2-04): historical moment rates per sport/type
- Per-category floor pricing (P2-05): clearing price history
- Attribution measurement (P2-03): impression → moment linkage
- Live auction dashboard (P2-02): real-time moment stream
- Programmatic Intent API (P2-09): inventory queries

## Supply Forecasting (P2-04)

The `forecast-supply` Edge Function runs daily at 2 AM and generates 7-day supply forecasts:

- Primary source: `intent_moments` historical data per sport (last 30 days). When ≥10 comparable games exist, computes observed fire rates + 80% Wald confidence interval (p ± 1.282 × √(p(1−p)/n)).
- Fallback: blended learned rates (from `learned_moment_rates` table) + hardcoded defaults. Used when a sport has <10 historical games; applies ±50% wide band and labels the forecast "Statistical projection (insufficient history)".
- `predicted_moments = games_scheduled × moment_rate`; `eligible_users = predicted_moments × avg_users_per_game`.
- Stored in `supply_forecasts` table with columns `predicted_moments_low`, `predicted_moments_high` (80% CI bounds) and `basis_note` (human-readable data source description added by migration 075).
- The `/inventory` page surfaces the point estimate, CI band (e.g. "12–18"), and color-codes insufficient-history rows as "Projection" (yellow) vs. data-based rows (green/yellow/red availability). A per-sport basis legend shows the sample size and window.
- Aggregate only — no user-level data exposed to advertisers.

## Advertiser Portal (web/)

The Next.js advertiser portal provides full self-service campaign management:

## Attribution Measurement (P2-03)

NORMA provides closed-loop attribution: impression → CTA tap → downstream action within a 30-minute window.

**Attribution window:** 30 minutes (configurable). Industry-standard for direct-response sports advertising.

**Honest labeling — inferred vs app-verified:**

| Conversion type | Status | Reason |
|-----------------|--------|--------|
| `cta_tap` | App-verified | User tapped CTA button inside NORMA |
| `app_return` | App-verified | User returned to NORMA within window |
| `sportsbook_open` | Inferred | External sportsbook app/site opened — wager **not confirmed** (no partner callback) |
| `stream_open` | Inferred | External stream app/site opened — watch **not confirmed** |
| `commerce_open` | Inferred | External commerce site opened — purchase **not confirmed** |
| `wager_placed` | Inferred | Via email parse — not a direct sportsbook data feed |

Upgrading inferred → verified requires a partner server-to-server callback (P2-08). Until that partnership exists, the UI always labels these as inferred. Never imply verified sportsbook or streaming conversions.

**Metrics surfaced:**
- Attributed conversion count + action rate
- Click-through (CTA tap → action) vs view-through (seen → action, no tap)
- CPA (total spend / attributed conversions within window)
- Avg time from impression to conversion per type

**Access:** `reporting-api` `attribution` report type. UI: `/reporting` Attribution panel (click "View" on any campaign row).

**Advertiser-facing pages:**
- `/dashboard` — campaign overview, key metrics
- `/campaigns` — campaign list with status badges
- `/campaigns/new` — create new campaign (name, budget, targeting, flight dates)
- `/campaigns/[id]` — campaign detail with sub-pages: bidding strategy, creatives, targeting rules, reporting
- `/billing` — wallet balance, deposit via Stripe, transaction history
- `/inventory` — supply forecasts (available moments by type, day)
- `/reporting` — aggregate performance metrics
- `/settings` — account settings
- `/onboarding` — new advertiser setup flow

**Admin-only pages:**
- `/admin/dashboard` — system-wide metrics
- `/admin/advertisers` — advertiser management (approve, suspend)
- `/admin/campaigns` — all campaigns (approve, reject, pause)
- `/admin/fraud` — fraud event review and resolution
- `/admin/revenue` — revenue dashboard, bucket analysis, lifetime value
- `/admin/users` — user management
- `/admin/auction-engine` — auction configuration (floor prices, multipliers)
- `/admin/auction-engine/live` — **(P2-02) Live auction monitor**: rolling 5/15/60-min windows of moments fired by type, fill rate, avg/median clearing price, no-fill reason breakdown (filled/unfilled/ineligible). Updates via Supabase Realtime subscription on `intent_moments`. Aggregate only — no user identity. Implemented in `LiveAuctionDashboard` client component.
- `/cmo` — social content calendar, approve/reject/publish posts

**Campaign state machine:** draft → pending_review → active → paused/completed/archived. Activation requires sufficient wallet balance for remaining budget.

**Campaign approval workflow (implemented):** Campaigns created by advertisers land in `approval_status = 'pending'`. They do not enter the auction until an admin approves them. Admin UI at `/admin/campaigns` shows pending count badge and per-row Approve/Reject controls. Campaign names are clickable links that open the campaign detail page (`/admin/campaigns/[id]`). Rejection requires a written note that is surfaced to the advertiser. Approved campaigns enter the auction; rejected campaigns are locked. Migration 065 added `approval_status`, `approval_note`, `reviewed_at`, `reviewed_by` to the campaigns table.

**Creative pre-screening (AI-assisted, human gate):** When an advertiser submits a creative via `POST /api/ads/campaigns/[id]/creatives`, the route creates the creative (status: `pending`) and immediately fires the `creative-prescreen` edge function asynchronously — the advertiser API response is never blocked. The function calls `claude-haiku-4-5-20251001` with a structured rubric and records one of four outcomes in the `prescreen_status` column: `pass`, `flag`, `error`, or `pending`. A `flag` verdict includes an array of violated rules in `prescreen_reasons` (JSONB). AI sets `prescreen_status` only. The `status` column (which controls auction eligibility) remains `pending` until a human admin clicks Approve. AI never auto-approves creatives into the live auction.

The campaign detail page (`/admin/campaigns/[id]`) shows each creative with its prescreen badge (pass=green, flag=red, pending=gray, error=orange) and the violation reasons when flagged. Pass creatives surface as "Pre-approved" to signal lower manual review burden; flagged creatives show reasons inline for the reviewer. The Approve button is the single human-click gate that sets `status = 'approved'` and makes the creative eligible for auction.

Migration `20260706000006_creative_prescreen.sql` adds `prescreen_status`, `prescreen_reasons`, and `prescreen_at` columns to `creatives`. The rubric is in `supabase/functions/creative-prescreen/rubric.ts`; the handler is `supabase/functions/creative-prescreen/index.ts`. The human approve API is `POST /api/admin/campaigns/[id]/creatives/[creativeId]/approve` (admin-role required).

## Revenue Models

**Implemented:**
- **CPC/CPA auction** — the Vickrey auction is the primary revenue mechanism. Advertisers pay per impression at the second-price clearing rate. Conversion tracking (stream_open, sportsbook_open, wager_placed, cta_tap, app_return) is implemented.
- **Advertiser wallet** — prepaid balance funded via Stripe Checkout. Impression costs are deducted from the wallet in real-time.
- **Direct deals** — guaranteed-delivery contracts with priority_tier > 0 bypass competitive auction.

**Partially implemented / in progress:**
- **Sportsbook referral CTA** — `BetNowButton` provides deep links to sportsbook apps from alert cards. Referral tracking infrastructure exists but affiliate partnerships may not be live.

**Planned / potential:**
- Premium ad-free subscription tier
- Streaming affiliate/referral (when streaming services have affiliate programs)
- Ticketing affiliate
- Merchandise affiliate
- Sponsorship packages (branded moment types, e.g., "The DraftKings Comeback Alert")

## Geo-Compliance

Geographic enforcement for sportsbook advertising is implemented at the foundation level.

### Data Model

- **`profiles.timezone`** — captured from the user's device at signup/login via the runtime `Intl.DateTimeFormat().resolvedOptions().timeZone` API. This is the authoritative jurisdiction signal.
- **`sportsbook_restrictions` table** — maps each sportsbook key (e.g., `draftkings`, `fanduel`, `betmgm`, `caesars`, `pointsbet`) to an array of US state codes where that sportsbook is legally permitted to advertise (e.g., `['AZ', 'CO', 'IL', 'NJ', ...]`). Seeded via migration 058.
- **`advertisers.allowed_jurisdictions`** — advertiser-level override for jurisdiction allowlists, used when an advertiser's legal footprint differs from the default sportsbook restriction list.

### Auction Engine Enforcement

Before a sportsbook campaign enters the eligible-bids step of the auction, the engine performs a geo-filter:

1. Resolve the user's US state from `profiles.timezone` (IANA timezone → state mapping, e.g., `America/New_York` → `NY`).
2. If the timezone is null or cannot be resolved to a US state, the user is treated as **unknown jurisdiction** and all sportsbook category bids are excluded.
3. Look up the user's state against `sportsbook_restrictions` for the campaign's advertiser key.
4. If the state is not in the allowed list, the campaign is excluded from the auction for this user.

Non-sportsbook advertisers (streaming services, merchandise, ticketing) are not subject to the geo-filter.

### CTA Geo-Gating (implemented)

Two canonical geo-compliance modules exist — one per runtime:

- **Server** (`supabase/functions/_shared/geo-compliance.ts`) — exports `inferStateFromTimezone()` and `isGeoEligible()`. Used by the auction engine.
- **Client** (`lib/geo-compliance.ts`) — exports the same `inferStateFromTimezone()` function with an identical `STATE_BY_TIMEZONE` map. Used by the `useSportsbookGeo` hook.

Both files must remain in sync. `supabase/functions/_shared/geo-compliance_test.ts` enforces parity: it verifies that `isGeoEligible(state, allowedJurisdictions)` (auction path) and `allowedStates.includes(state)` (CTA path) produce identical results for every mapped (timezone → state) × sportsbook combination in the `sportsbook_restrictions` seed data. 20 tests; all pass.

The `useSportsbookGeo` hook reads `profiles.timezone` and checks `sportsbook_restrictions` at component mount. `BetNowButton` renders disabled with "Not available in your region" when the user's derived state is not in the sportsbook's allowed list. Optimistic-renders as enabled while the check loads to avoid blocking UX.

## Post-Outcome Commerce Moment (P2-07)

A `post_outcome` intent moment is written once per closed game with a decisive winner (non-tied score). It fires AFTER all push notifications are dispatched — never alters live alert behavior or delivery latency (rule #11).

**Qualifying conditions:** `gameState.status === "closed"` AND `home_score !== away_score`.

**Qualifier flags** stored in `game_context`: `is_upset` (margin ≤ 5), `is_blowout` (margin > 20), `is_overtime` (period > 4 for basketball).

**Dedup key:** `{game_id}:post_outcome:final:0` — guarantees at most one row per game.

**Auction eligibility:** eligible for `commerce` demand campaigns. With no live commerce demand, the row records `auction_outcome: "unfilled"` — never a fabricated fill.

**Attribution:** `commerce_open` is inferred (same honest labeling as `sportsbook_open`). No merchant callback exists. Never implies verified purchase.

## Partner-API Readiness Scaffold (P2-08)

**Status: Interface defined. No live partners. Requires BD agreement to activate.**

Migration 078 adds `verification_source TEXT NOT NULL DEFAULT 'inferred'` to `conversions`. Only `'partner_api'` is the other allowed value, and it can only be set when a real signed partner callback arrives via a live `ConversionIngestor` adapter.

`_shared/conversion-ingestor.ts` defines the `ConversionIngestor` interface + disabled stub adapters for DraftKings, FanDuel, and Fanatics. All stubs return `{ accepted: false, reason: "not_live" }` — no conversion can be marked verified without a live adapter.

**Auth model (defined, not live):** HMAC-SHA256 signed callbacks; replay window 300s; secrets stored as Supabase secrets, never in the DB, never logged.

## Programmatic Intent API (P2-09)

**Status: Live. Activated June 2026 via `INTENT_API_ENABLED=true` Supabase secret.**

To enable: `supabase secrets set INTENT_API_ENABLED=true --project-ref <project_ref>`
To disable: `supabase secrets set INTENT_API_ENABLED=false --project-ref <project_ref>`

Full API reference: `docs/partner-api/intent-api-reference.md`

Migration 079 creates the `api_keys` table: SHA-256 hash storage (raw key never stored), per-advertiser scoping, rate limit per key (default 50 req/min), revocation via `is_active=false`. See migration file for key provisioning seed instructions.

Edge function `intent-api` implements:
- `GET /inventory` — returns next-7-day supply forecasts joined with floor prices from the DB. Aggregate-only, no user data.
- `POST /bid` — validates campaign ownership, floor price, and 500c cap; upserts into the existing `bids` table. Programmatic bids enter the unchanged second-price Vickrey auction identically to manual bids.

Rate limit: 50 req/min per key (in-memory; resets on cold start). Auth: Bearer token → SHA-256 hash lookup in `api_keys` table.

## Brand Safety & Editorial Separation (P2-10)

Migration 080 adds:
- `brand_safety_status TEXT` on `campaigns` (pending | approved | flagged). Streaming and commerce campaigns require `approved` before entering the auction.
- `editorial_separation_ack BOOLEAN` on `creatives` — advertiser acknowledges the "Sponsored" label requirement.

**Auction step 5c:** After geo-filter, streaming/commerce bids are filtered out unless `brand_safety_status = 'approved'`. Sportsbook bids pass (covered by geo-compliance). Clearing logic unchanged.

**Ad labeling:** Every paid CTA is labeled "Sponsored" — visually distinct from NORMA's editorial "why now" copy. The auction winner's sponsor_text appears as a clearly labeled addition. Alert relevance is never influenced by which campaigns are in the auction.

**Admin:** `/admin/campaigns` shows a Brand Safety badge per campaign (pending/approved/flagged).

## Agentic Advertising Infrastructure

NORMA's ad platform is fully accessible to AI agents and DSPs through a layered stack of machine-readable standards. This is not aspirational — all components are implemented and tested as of June 2026.

### MCP Server (`packages/norma-ads-mcp/`)

A Model Context Protocol server exposes all six ad operations as named tools. It runs as a Node.js process and supports two transports:

- **stdio** — for Claude Desktop and local agent integrations. Install via `npm install -g norma-ads-mcp`.
- **HTTP/SSE** — for remote agents, DSPs, and any MCP-compatible client connecting over the network. Deploy via Docker/Railway; see `Dockerfile` and `railway.toml` in the package.

**Tools:**

| Tool | Purpose |
|------|---------|
| `list_moment_types` | Returns all 11 moment types with floor CPMs and CTR ranges |
| `get_inventory_forecast` | 7-day supply forecast with bid guidance per moment/sport |
| `create_campaign` | Full campaign creation with budget, targeting, flight dates, creative |
| `get_campaign_performance` | Impressions, CTR, CPA, spend — breakdown by day/moment/sport/creative |
| `update_campaign` | Adjust bid, budget, CPA target, status, end date |
| `submit_brief` | Natural-language brief → two-stage plan/execute flow |

**Auth:** Bearer token (NORMA API key). All tool calls require a valid key set via `NORMA_API_KEY` env var for stdio, or passed as `Authorization: Bearer <key>` header for HTTP/SSE.

**Source:** `src/server-factory.ts` exports `createNormaServer()` — a factory that returns a fresh, fully-configured MCP `Server` instance. Both transports use this factory (MCP SDK 1.x enforces 1:1 server-per-transport; each HTTP/SSE connection gets its own instance).

**HTTP/SSE server:** `src/http-server.ts` — Express app, `SSEServerTransport` on `GET /sse`, JSON-RPC routing on `POST /message?sessionId=<id>`, unauthenticated `GET /health`. Exports `startServer(port)` for programmatic startup and clean shutdown (used by tests). Contains an explicit pre-check for missing `Authorization` headers to prevent the SDK's stdio bypass from allowing unauthenticated HTTP connections.

**Tests:** 6 Jest integration tests in `src/__tests__/http-server.test.ts` — health check, auth enforcement (missing/wrong key → 401), invalid session (404), SSE session establishment, and full SSE + tools/list round-trip. All pass. Shell e2e script at `scripts/test-e2e.sh` runs 10 curl-based tests; all pass.

### Deployment Gap (pending DNS only)

The HTTP/SSE server is production-ready and containerized. The `adagents.json` and `aamp-seller-profile.json` declare `mcp_server_url: "https://mcp.getnorma.app"`. The remaining step is:

1. Deploy the `packages/norma-ads-mcp/` Docker image to Railway (see `railway.toml`).
2. Add a DNS CNAME record: `mcp.getnorma.app → <railway-service>.up.railway.app`.

Until those two steps are complete, `mcp.getnorma.app` resolves to nothing. The code is production-ready; the subdomain is not yet live.

### Agent Discovery (`web/public/adagents.json`)

Published at `getnorma.app/adagents.json`. Declares:
- MCP server URL and transport types (`stdio`, `http-sse`)
- OAuth token endpoint and required scopes
- All 11 moment types with floor CPMs and CTR ranges
- Attribution configuration (postback, click tracking, conversion windows)
- IAB AAMP protocol support (`adcp@1.0`, `mcp@1.0`, `openrtb@2.6`)

### OAuth Token Endpoint (`/api/auth/token`)

Implements RFC 6749 Client Credentials. POST `client_id` + `client_secret` → RS256-signed JWT (1-hour TTL) scoped to `campaigns:read`, `campaigns:write`, `reporting:read`, `inventory:read`. Rate-limited at 10 req/min per IP. Every `/api/ads/*` route requires a valid Bearer token (except `GET /api/ads/moment-types`).

### REST API (`/api/ads/`)

18 routes covering the full campaign lifecycle. Complete OpenAPI 3.0.3 spec at `getnorma.app/api/ads/openapi.json` (also served at `/.well-known/openapi.json`). Includes campaigns, creatives, reporting with breakdown dimensions, market-level data (percentile CPMs, fill rates, auction depth), inbound conversion postbacks, and outbound HMAC-signed webhooks.

### IAB AAMP Registry

`web/public/aamp-seller-profile.json` and `web/public/sellers.json` are the seller-side registry documents. `web/public/.well-known/openapi.json` is the machine-readable API spec that agents crawl for introspection. The developers page meta tag `"adcp:endpoint": "https://mcp.getnorma.app"` is the machine-readable hook for agent discovery crawlers.

## Automated Advertiser Performance Reports

`advertiser-weekly-report` is a Deno Edge Function scheduled every Monday at 13:00 UTC (9 AM ET, summer/DST) via pg_cron (migration `20260706000003_report_log.sql`).

### What it does

For each advertiser with an active or recently completed campaign (within 30 days):

1. Fetches impression rows for the current week (last completed Mon–Sun) and the prior week from the `impressions` table, joined through `bids → creatives` for variant labels.
2. Fetches conversion rows for those impression IDs from the `conversions` table.
3. Computes `WeeklyMetrics`: impressions, taps, CTR, spend, avg clearing price, CPA, conversions split by `verifiedConversions` (cta_tap + app_return) and `inferredConversions` (sportsbook_open + stream_open + commerce_open + wager_placed).
4. Computes `MetricDeltas`: week-over-week changes in impressions, taps, spend, and CTR in percentage points.
5. Generates one automatic insight per report (rule-based: clearing headroom, zero conversions, inferred-only tracking gap, or best moment CTR).
6. Builds a clean HTML email with a metric grid, attribution disclaimer, insight box, moment-type breakdown table, creative-variant breakdown table, and a "Deposit / Raise Budget" CTA linking to `/billing`.
7. Sends via Resend API (`RESEND_API_KEY` secret). Sender address is `reports@getnorma.app`.
8. Logs to the `report_log` table (advertiser_id, period_start, period_end, email_to, impressions, spend_cents, conversions, status, error_detail).

### Attribution labeling rule (non-negotiable)

Every report email includes a permanent attribution note. Conversions labeled **verified** are app-confirmed (cta_tap, app_return). Conversions labeled **inferred** indicate an external app or site was opened — the downstream action was not confirmed. This labeling is enforced in `buildHtmlEmail()` and is never suppressed regardless of conversion count.

### Source files

| File | Purpose |
|------|---------|
| `supabase/functions/advertiser-weekly-report/logic.ts` | Pure functions: `computeWeeklyMetrics`, `computeDeltas`, `generateInsight`, `buildHtmlEmail` |
| `supabase/functions/advertiser-weekly-report/index.ts` | Main handler: query loop, Resend API call, report_log write |
| `supabase/functions/advertiser-weekly-report/logic_test.ts` | 18 Deno unit tests |
| `supabase/migrations/20260706000003_report_log.sql` | `report_log` table + pg_cron schedule |

### Environment variable

`RESEND_API_KEY` — add via `supabase secrets set RESEND_API_KEY=re_...`. Required for email delivery. Without it, the function returns HTTP 500 with `RESEND_API_KEY not configured` and logs the error.

## Compliance and Risk

- **Gambling-related ads are regulated.** Sportsbook ad geo-filtering is enforced at both the auction level and at the `BetNowButton` CTA level (see Geo-Compliance section above). Both enforcement points use the same `inferStateFromTimezone` logic.
- **Age gating.** The App Store requires apps with gambling-adjacent content to have age restrictions. The app's rating and content descriptors must accurately reflect the presence of sportsbook CTAs.
- **Do not personalize sensitive betting offers unless legally permitted.** The ad personalization toggle gives users control. When off, behavioral signals are excluded.
- **Separate editorial relevance from paid placement.** Alert explanations are generated independently of the ad auction. The sponsor appears as a clearly labeled addition ("Sponsored"), never as part of the alert content. This is enforced by `editorial_separation_ack` on creatives.
- **Frequency cap aggressively.** Max 3 ads per user per day, with fatigue model suppression at 6+ sponsored alerts in 24 hours. This is a trust-preservation mechanism.
- **No verified conversion claims without partner API.** All `sportsbook_open`, `stream_open`, `commerce_open`, and `wager_placed` conversions are labeled `inferred`. `verification_source = 'partner_api'` requires a live signed server-to-server callback. No live partners exist as of 2026.
