# 11. End to End User Journey Map

> **Purpose.** This file is the single entry point for any agent or engineer joining Watch-NORMA. Read it top to bottom once and you will know what the product is, who uses it, what every one of those users experiences step by step, and exactly which file in the repository owns each step. Every claim below was verified against the codebase at the commit noted in the header block, not inferred from prior documentation.
>
> **Verification basis.** Commit `027a4cc`. 594 tracked files, 99 migrations, 45 Edge Functions, 3 deployable surfaces.
>
> **Companion files.** Docs `01` through `10` in this folder go deeper on product, architecture, data, alerts, ads, security, operations, roadmap, and rules. This file is the map that tells you which of them to open and why.

---

## 0. Agent contract

Before you change anything, absorb these five rules. They are enforced socially and, in several cases, by CI.

1. **Read before writing.** This folder is the canonical project brain. If your change touches product behavior, schema, routes, environment variables, integrations, alert logic, streaming routing, ad logic, or privacy assumptions, update the affected doc in the same session. See `10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`.
2. **Migrations are append only and numbered.** The numbering rule at the top of `CLAUDE.md` is mandatory. Never renumber, never edit a shipped migration.
3. **Streaming routing is mission critical and must never degrade.** A subscriber who taps Watch must land inside the provider app, never on a marketing or signup page. This has already caused three corrective migrations (`052`, `053`, `054`).
4. **Never fabricate certainty for the user.** If broadcast data is missing, the UI says so. If a wager integration does not exist, the UI says Coming soon. The product's entire credibility rests on its alerts being earned rather than generated.
5. **Aggregate only for outside parties.** No user level data leaves the system through any advertiser or partner surface. `intent-api` and the ads API return forecasts and counts, never rows about people.

---

## 1. NORMA in ninety seconds

Watch-NORMA answers one compound question that no other app answers: *is something happening right now that I specifically should be watching, and where do I watch it?*

It continuously ingests live game state, sportsbook odds, the user's own wagers, their prediction market positions, and their connected streaming services. When a game crosses into personal relevance for a given user, it sends one push notification that explains why the moment matters and deep links straight into the app that carries the broadcast.

The promise, verbatim from the product: **"Watch-NORMA tells you when to tune in."**

Revenue comes from a second price Vickrey auction that attaches a contextual sponsor to high value alert moments. Advertisers buy through a self serve web portal, a REST API, or an MCP server that lets an AI agent run a campaign conversationally.

**Three deployable surfaces:**

| Surface | Stack | Location | Audience |
|---|---|---|---|
| Mobile app | React Native, Expo Router, TanStack Query | `app/`, `components/`, `hooks/`, `lib/` | Sports fans (iOS, live in the App Store) |
| Advertiser and admin portal | Next.js App Router | `web/` | Advertisers, internal operators |
| Agent interface | MCP server (Node) | `packages/norma-ads-mcp/` | AI buying agents |

**One backend serves all three:** Supabase Postgres plus 45 Deno Edge Functions in `supabase/functions/`.

Live sports: NCAA men's basketball (`ncaam`), NBA (`nba`), MLB (`mlb`). Football (`nfl`, `ncaaf`) is ingested and has alert rules written, but those rules are unreachable behind a guard. See section 9.

---

## 2. System topology

```
                     ┌──────────────────────────────────────────┐
 EXTERNAL DATA       │  ESPN (scores, primary)                  │
                     │  SportsDataIO (schedules, fallback)      │
                     │  Sportradar (play by play, summaries)    │
                     │  The Odds API (DK, FD, BetMGM, ESPNBet)  │
                     │  Kalshi (RSA signed), Polymarket (CLOB)  │
                     └───────────────┬──────────────────────────┘
                                     │  poll-* Edge Functions
                                     ▼
        ┌────────────────────────────────────────────────────────┐
        │  SUPABASE POSTGRES  (63 tables, 99 migrations)         │
        │  games · game_state_cache · wagers · follows ·         │
        │  connections · alerts · alert_throttle · campaigns ·   │
        │  bids · impressions · api_keys · referrals · ...       │
        └───────┬─────────────────────────────┬──────────────────┘
                │                             │
   game-watcher-orchestrator            Vickrey auction
                │                             │
                ▼                             ▼
        evaluate-alerts  ───────────►  sponsor attach
                │
                ▼
            send-push  ──►  Expo Push API  ──►  device
                                                  │
                                                  ▼
                                          deep link chain
                                     (scheme → universal → store)
```

**Orchestration.** `pg_cron` cannot hold long lived state, so scheduling uses a Postgres backed pattern: `game-watcher-orchestrator` reads and writes `watcher_state`, applies backoff and a rate budget, and dispatches the polling functions. Every Edge Function is written to be idempotent because it will be called again. This pattern is documented at `CLAUDE.md` under *Postgres-Backed Orchestration*.

**Poll cadence** (`lib/constants.ts`, `POLL_INTERVALS`): schedule 30 minutes, boxscore 60 seconds, play by play 30 seconds, summary 2 minutes, odds 5 minutes. These intervals are cost aware, not arbitrary. Sportradar is the expensive provider and is deliberately polled least.

---

## 3. User type registry

Thirteen human types across three classes, plus machine actors. Auth column states how the system actually identifies the actor.

### Class A: Consumer

| # | Type | Auth state | Primary surface |
|---|---|---|---|
| A1 | Anonymous web visitor | none | `web/src/app/page.tsx`, `/demo`, `/status`, `/developers`, `/advertisers` |
| A2 | Prospect installing the app | none, may carry `?ref=` | App Store, `app/(auth)/welcome.tsx` |
| A3 | Fan (the base type) | Supabase session | `app/(tabs)/games`, `app/(tabs)/alerts` |
| A4 | Bettor | session plus `wagers` rows | game detail, `AddWagerSheet` |
| A5 | Prediction market participant | session plus Kalshi key or Polymarket wallet | `app/(tabs)/connections/prediction-markets.tsx` |
| A6 | Streaming subscriber | session plus `connections` rows | `WatchNowButton`, `TransitionOverlay` |
| A7 | Referrer (NORMA Insider) | session plus `referral_codes` row | `app/(tabs)/profile/index.tsx` |
| A8 | Departing user | session, terminating | `delete-account` |

A3 is the spine. A4 through A7 are capability layers stacked on the same account, not separate accounts. A single person is routinely A3, A4, A5, A6, and A7 simultaneously, and the alert engine scores them as one user with more signal.

### Class B: Commercial

| # | Type | Auth state | Primary surface |
|---|---|---|---|
| B1 | Self serve advertiser | Supabase session, `advertisers` row | `web/src/app/dashboard`, `/campaigns`, `/billing` |
| B2 | Machine buyer (agent or server) | OAuth RS256 JWT or hashed API key | `packages/norma-ads-mcp/`, `/api/ads/*`, `intent-api` |
| B3 | Distribution partner | partner key in URL path | `web/src/app/partners/[partnerKey]/page.tsx` |

### Class C: Internal

| # | Type | Auth state | Primary surface |
|---|---|---|---|
| C1 | Admin operator | session with `app_metadata.role === "admin"` | `web/src/app/admin/*` |
| C2 | Content operator (CMO) | admin session | `web/src/app/cmo/page.tsx` |

### Class D: Machine actors

Not people, but they are users of the system and they write most of its data. `game-watcher-orchestrator`, the `poll-*` family, `evaluate-alerts`, `send-push`, `resolve-wagers`, `resolve-predictions`, `ad-auto-bidder`, `ad-budget-pacer`, `ad-fraud-check`, `floor-price-optimizer`, `cmo-generate`, `cmo-publish`, `purge-old-data`, `monitor-health`, `deep-link-health-check`, `renew-gmail-watch`. All run with the Supabase service role and bypass row level security. Treat any change to them as a privileged change.

---

## 4. Consumer journeys

### A1. Anonymous web visitor

**Entry.** Organic search, press, or a partner link to the marketing site.

| Step | Surface | Backend | Writes |
|---|---|---|---|
| Land on marketing page | `web/src/app/page.tsx` | none | none |
| Try the interactive product demo | `web/src/app/demo/page.tsx`, `demo-form.tsx`, `components/norma-demo.tsx` | `POST /api/demo` (`api/demo/route.ts`) | `demo_requests` |
| Join the waitlist | `components/waitlist-form.tsx` | `POST /api/waitlist` | `waitlist_emails` |
| Check system health | `web/src/app/status/page.tsx` | `health-check` | none |
| Read API documentation | `web/src/app/developers/page.tsx`, `docs/openapi/norma-ads-api.yaml` | `GET /api/ads/openapi.json` | none |

**Exit paths.** App Store install (becomes A2), advertiser signup (becomes B1), or nothing.

**Failure modes.** No middleware protection applies to these routes; `web/src/middleware.ts` only matches the protected list. A misconfigured Supabase anon key surfaces here first because the waitlist and demo writes fail silently to the visitor.

---

### A2. Prospect installing the app

**Entry.** App Store listing, or a referral link carrying `?ref=<code>`.

1. **Referral capture.** `getReferralCode()` in `lib/referral-utils.ts` parses the inbound deep link with `expo-linking` and extracts the `ref` query parameter. This happens before authentication, so the code must survive the signup round trip.
2. **Cold start.** `app/index.tsx` immediately redirects to `/(auth)/welcome`. There is no unauthenticated browsing mode. This is a deliberate product choice: NORMA has nothing to show a user whose preferences it does not know.
3. **Welcome.** `app/(auth)/welcome.tsx` presents the logo, three value propositions (personalized alerts, streaming shortcuts, wager tracking), and two calls to action.
4. **Account creation.** `app/(auth)/sign-up.tsx` supports email and password or Apple Sign In on iOS. Email signup requires verification.
5. **Gate transition.** `AuthGate` in `app/_layout.tsx` watches `supabase.auth.onAuthStateChange`. On session acquisition while inside the `(auth)` group it calls `router.replace("/(tabs)/games")`.
6. **Push registration.** `registerPushToken()` in `app/_layout.tsx` creates the Android `game-alerts` channel, requests iOS permission including provisional and critical alerts, fetches the Expo push token for project `3a418868-5bb5-4852-b565-3282ee4fe91e`, and writes it to `profiles.push_token`.

**Failure modes.** If push permission is denied the function returns early and `profiles.push_token` stays null. Every downstream alert for that user will be created in `alerts` but will not be pushed. In app delivery still works. An agent debugging "user says they get no alerts" should check `profiles.push_token` before touching the alert engine.

---

### A3. Fan (the spine)

This is the core loop. Everything else in the product is a modifier on it.

**Navigation shell.** `app/(tabs)/_layout.tsx` defines four tabs. Note the label mismatch that trips up new agents: the route segment is `connections` but the visible tab label is **Watch**. The Alerts tab carries a live badge fed by `useUnreadAlertCount()` from `hooks/useAlerts.ts`.

**Step 1: Orientation on the Games tab** (`app/(tabs)/games/index.tsx`)
- Horizontal date picker, plus or minus five days, Eastern timezone (`components/DatePicker.tsx`)
- Sport filter pills driven by `lib/sport-context.tsx` (`components/SportSelector.tsx`)
- Three way switcher: All Games, Live, Following
- Game cards with teams, score, status badge, broadcast, venue (`components/GameCard.tsx`)
- Pull to refresh, backed by `hooks/useGames.ts`

**Step 2: Declaring relevance.** Relevance is the currency of this product, and the user can spend it four ways:

| Signal | Where | Writes |
|---|---|---|
| Follow a team or game | game detail heart control, `hooks/useFollows.ts` | `follows` |
| Import a fantasy roster | `components/ImportRosterSheet.tsx`, `lib/roster-import.ts`, `lib/fantasy-platforms.ts` | `follows` with `source: "fantasy"` and `fantasy_source` = platform key |
| Connect PrizePicks / Underdog | `app/(tabs)/connections/pickem.tsx` | `connections` row, `provider_registry.category = dfs_pickem` |
| Scan a pick'em entry slip | `parse-bet-slip`, `ReviewScannedWagersSheet` | `wagers` with `market_type = player_prop`, `provider_key` prizepicks/underdog |
| Connect a streaming service | `app/(tabs)/connections/streaming.tsx` | `connections` |
| Log a wager or position | see A4, A5 | `wagers`, `prediction_positions` |

Roster import is worth calling out because it is absent from older documentation: `buildRosterFollowRows()` splits a pasted multi line blob of player names into normalized `follows` rows tagged `fantasy`, which turns a fantasy lineup into alert eligibility in one paste.

**Step 3: Setting the volume.** `components/PreferencesSheet.tsx`, reached from Profile, writes `user_preferences`: favorite teams, quiet hours, max alerts per game (default 5), max alerts per hour (default 10), and channel selection for push and in app.

**Step 4: Receiving the alert.** Detailed in section 5. From the user's seat: a push arrives, its body explains itself, and tapping it opens the app.

**Step 5: Acting on it.** The notification response listener in `app/_layout.tsx` branches:
- If the push payload carries `streamProviderKey`, it looks the provider up in the TanStack Query cache and calls `tapToStream.triggerStream(provider, { skipAnticipation: true })`, going straight to the stream without an interstitial.
- Otherwise, if the payload carries `gameId`, it routes to `/games/[gameId]`.

**Step 6: Game detail** (`app/(tabs)/games/[gameId].tsx`) composes `ScoreHeader`, `OddsDisplay`, `WatchNowButton`, the wager section, `MarketPrices`, and `NormaLine`.

**Step 7: Feedback.** A deliberately subordinate thumbs up and thumbs down control below each alert card writes to `alert_feedback` through `hooks/useAlertFeedback.ts`, upserted one row per user per alert with optimistic local state. It accumulates for future scoring weight tuning and does not alter live scoring.

**Step 8: Sharing.** `components/MomentShareCard.tsx` and `lib/formatShareCard.ts` produce a shareable card; the event lands in `share_events`.

**Step 9: The review ask.** `lib/review-prompt.ts` implements a disciplined App Store review gate. `recordAppOpen()` is called once per session from the root layout and accumulates distinct active days. `maybeRequestReview(trigger)` fires only when the native API is available and actionable, the user has opened the app on at least 3 distinct days, and no prompt has been shown in 120 days. It never throws, so it is safe to call at any delight moment.

**Failure modes.** Games tab empty on a valid date usually means schedule ingestion, not the client: check `poll-schedule` and `poll-schedule-lookahead`. Alerts arriving in app but not on the device points at `profiles.push_token` or quiet hours, not at scoring.

---

### A4. Bettor

Wager connectivity is tiered by what the outside world actually permits. This tiering is a permanent architectural fact, not a roadmap item, and is spelled out in `CLAUDE.md` under *Wager Connectivity Tiers*.

**Tier C, manual entry.** `components/AddWagerSheet.tsx` captures sportsbook, market type, description, line, odds, stake, and parlay legs, writing to `wagers` through `hooks/useWagers.ts`.

**Tier B, assisted capture.** Two paths:
- *Bet slip scan.* The user photographs a physical or screenshot bet slip. `hooks/useBetSlipScanner.ts` sends it to the `parse-bet-slip` Edge Function, which uses Claude Vision to extract structured wager fields. The user confirms in `components/ReviewScannedWagersSheet.tsx`. Nothing is written until the human approves.
- *Email forwarding.* The user forwards sportsbook confirmation emails to a NORMA address. `ingest-email-wagers` parses them, `renew-gmail-watch` keeps the Gmail push subscription alive, and the user reviews in `components/ReviewEmailWagersSheet.tsx`. State lives in `email_imports` and `gmail_watch_state`.

**Tier A, partner API.** Scaffolding only. A `BetIngestor` interface and stub adapters exist. No consumer facing public API exists at DraftKings or FanDuel, and scraping violates their terms. Any agent asked to "finish the DraftKings integration" should stop and read this paragraph aloud: the blocker is contractual, not technical.

**Connecting a sportsbook means nothing more than "I use this."** No credentials are exchanged. `app/(tabs)/connections/sportsbooks.tsx` writes a `connections` row that shapes which sportsbook deep links appear on `BetNowButton`.

**Geographic compliance.** `lib/geo-compliance.ts` infers a US state from the device timezone via a `STATE_BY_TIMEZONE` table, and `hooks/useSportsbookGeo.ts` combines that with `sportsbook_restrictions` to suppress bet calls to action where the book is not legal. This is a coarse inference by design: it is a compliance guardrail, not a location service, and it never asks for GPS.

**Resolution.** When a game closes, `resolve-wagers` settles spread, moneyline, and over under wagers automatically and updates `wagers`.

**Alert consequence.** A wager transforms the user's scoring profile. Thresholds live in `lib/constants.ts` under `ALERT_THRESHOLDS`: spread margin proximity 4 points, total pace divergence 8, moneyline close margin 8, minimum 15 minutes of game data before pace is computed. A final whistle on a game where the user holds a wager is an unconditional must notify.

**Hard guardrail.** NORMA gives no betting advice and promises no outcomes. It never fabricates account balances or bet status.

---

### A5. Prediction market participant

**Kalshi (true API integration).** `components/KalshiWizard.tsx` runs a five step flow: create an API key in the Kalshi dashboard, enter the Key ID, upload the `.pem` private key, read the FAQ, confirm. Requests are RSA signed and proxied through the `kalshi-proxy` Edge Function so the private key never travels through client accessible paths. `poll-markets` syncs positions every five minutes into `prediction_positions`; `resolve-predictions` settles them when the game closes.

**Polymarket (wallet based).** `components/PolymarketWizard.tsx` runs a three step flow ending in a wallet address. Positions are read from the Polymarket CLOB API. Read only: NORMA never holds keys that can move funds.

**Display.** `components/PositionCard.tsx` and `components/MarketPrices.tsx` show market title, YES or NO side, quantity, average price, current price, and profit and loss. `hooks/useKalshi.ts`, `hooks/usePolymarket.ts`, and `hooks/usePredictionMarkets.ts` are the data layer.

**Failure modes.** `hooks/useConnectionHealth.ts` surfaces a degraded connection rather than showing stale positions as current. A revoked Kalshi key must present as broken, never as an empty portfolio.

---

### A6. Streaming subscriber

The highest stakes interaction surface in the product. Read this section before touching anything under `lib/deep-links.ts`.

**Resolution chain.**
1. `games.broadcast`, populated from ESPN and SportsDataIO, holds network names such as ESPN, TNT, CBS, FOX.
2. `getBroadcastProviderKeys()` maps those strings to provider keys.
3. `getBestWatchProvider()` intersects broadcast keys with the user's connected providers (`connections`) and the full registry (`streaming_providers`, `provider_registry`) and picks the best match. Covered by `lib/__tests__/watch-provider-selection.test.ts`.

**Presentation.** `components/WatchNowButton.tsx` shows exactly one primary action, "Watch on [Provider]". Honesty rules are encoded in the component:

| Condition | What the user sees |
|---|---|
| Connected provider carries the game | Watch on [Provider] |
| Multiple connected providers carry it | Best match by priority |
| Broadcast known, no connected match | "On ESPN" with no watch action |
| Broadcast null and game live | "Broadcast TBD" |
| Regional sports network detected | Watch action plus "May be subject to local blackout" |

`isRegionalBroadcast()` recognizes Bally Sports, NESN, MSG, YES Network, SNY, MASN, Root Sports, Altitude, Spectrum Sports, and AT&T SportsNet. The caveat is honest uncertainty, and it never blocks routing. True per market blackout detection would require an API that does not exist.

**Routing.** On tap, `lib/tap-to-stream-context.tsx` starts the portal transition rendered by `components/TransitionOverlay.tsx`, then `openStreamingApp()` walks a three step fallback: native `ios_scheme`, then `universal_link`, then `fallback_store_url`. Method and outcome are logged to `deep_link_events`. `hooks/useAppDetection.ts` informs whether the native app is present.

**The rule that generates bugs when forgotten.** `provider_registry.universal_link` must point at a watch or login URL, never a marketing URL. Routing an existing YouTube TV subscriber to a signup page is the worst outcome the product can produce. `deep-link-health-check` and `verify-provider-links` run continuously against this, writing to `provider_link_checks`.

**Monetization link.** `streaming_affiliate_events` records affiliate attribution on these transitions.

---

### A7. Referrer (NORMA Insider)

**Loop.** Profile exposes `shareReferralLink` (`app/(tabs)/profile/index.tsx`, line 237). The `get-referral-code` Edge Function issues or returns the user's code from `referral_codes`. The shared link carries `?ref=<code>`, which A2 step 1 captures on the recipient's first open. Attribution lands in `referrals`, and milestone rewards accrue in `referral_rewards` (migration `20260706000002`).

Partner sourced codes are tracked separately in `partner_referral_codes` so that partner driven acquisition can be measured against organic referral.

---

### A8. Departing user

Deletion is a first class flow because the App Store requires it and GDPR requires it.

`handleDeleteAccount` in `app/(tabs)/profile/index.tsx` (line 355) confirms twice, then invokes the `delete-account` Edge Function, which performs cascading removal across user owned tables. Sign out (line 347) is separate and non destructive.

Any agent adding a table that stores user data **must** extend `delete-account` in the same change. A new table holding user rows that is not covered by deletion is a compliance defect, not a backlog item.

---

## 5. The alert pipeline: where every consumer journey converges

Read `05_ALERTS_STREAMING_AND_LIVE_SPORTS_LOGIC.md` for the full treatment. This is the operational summary with verified constants.

**Owner:** `supabase/functions/evaluate-alerts/index.ts`, with pure logic in `supabase/functions/_shared/alert-scoring.ts` and `evaluate-alerts/logic.ts`.

**Stage 0, candidate generation.** For a live game, gather every user who follows a participating team or player, holds a mapped wager, or holds a mapped prediction position.

**Stage 1, signal extraction.** Game signals (margin, clock, period, lead changes, foul trouble) plus user signals (has wager, covering or not, follows team, follows player on court).

**Stage 2, scoring and rules.** `computeScore(signals)` returns a number. `meetsThreshold(score)` compares it against `SCORE_THRESHOLD = 40`, defined at `_shared/alert-scoring.ts` line 60. In parallel, `checkMustNotify()` bypasses the threshold for critical moments: game final while the user holds a wager, overtime, one possession endgame, star player foul trouble.

**Stage 2b, the Why Now explanation.** `buildWhyNow()` produces a headline, bullets, stats, a confidence level, and wager impact. Nothing ships to a user without this. An alert that cannot explain itself is a bug.

**Stage 3, throttling and dedup.** Checked against `alert_throttle` for duplicate hash, per user per game cap, per hour cap, cooldown (`ALERT_COOLDOWN_MINUTES = 10`), and quiet hours.

**Stage 4, delivery.** The auction attaches a sponsor if a relevant one clears; the ad never delays or obscures the alert. The row is inserted into `alerts`, `send-push` dispatches through the Expo Push API, and the outcome is written to `delivery_log`.

**Firing condition, verbatim from `index.ts` line 404:**

```ts
const shouldAlert = mustNotify != null || meetsThreshold(score) || v1Candidates.length > 0;
```

The third clause is a compatibility path for v1 candidates and is the most common source of surprise when an alert fires below threshold.

---

## 6. Commercial journeys

### B1. Self serve advertiser

**Gate.** `web/src/middleware.ts` protects `/dashboard`, `/campaigns`, `/reporting`, `/billing`, `/inventory`, `/settings`, `/onboarding`, `/admin`, redirecting unauthenticated requests to `/auth/login`. Authenticated users hitting an auth page are bounced forward to `/dashboard`, or `/admin/dashboard` if they hold the admin role. `/auth/reset-password` is deliberately exempt because it needs a live session to call `updateUser`.

| Step | Route | Notes |
|---|---|---|
| Sign up | `/auth/signup` | Supabase auth, creates `advertisers` row |
| Onboard | `/onboarding` | Account setup |
| Fund the wallet | `/billing` | `stripe-checkout`, confirmed by `stripe-webhook`, ledgered in `advertiser_transactions` |
| Create a campaign | `/campaigns/new` | Writes `campaigns` |
| Configure | `/campaigns/[id]/bidding`, `/targeting`, `/creatives` | Writes `bids`, `creatives` |
| Await approval | none | Human gate, see C1 |
| Monitor | `/campaigns/[id]/reporting`, `/reporting` | Reads `impressions`, `ad_clicks`, `conversions` |
| Forecast | `/inventory` | Reads `supply_forecasts` from `forecast-supply` |

**Autonomous support.** `ad-auto-bidder` adjusts bids, `ad-budget-pacer` spreads spend, `floor-price-optimizer` tunes `floor_prices` with history in `floor_price_history`, `ad-fraud-check` writes `ad_fraud_events`, and `advertiser-weekly-report` emails performance summaries. Thompson Sampling drives creative optimization. Full mechanics live in `06_ADS_MONETIZATION_AND_AUCTION_LOGIC.md`.

---

### B2. Machine buyer

The most architecturally distinctive user type in the system: a buyer that is a program, sometimes an AI agent, and is treated as a first class customer rather than a scripting afterthought.

**Three doors.**

1. **MCP server** (`packages/norma-ads-mcp/`). Six tools: `submit-brief`, `create-campaign`, `update-campaign`, `list-moment-types`, `get-inventory-forecast`, `get-campaign-performance`. Auth in `src/lib/auth.ts`, HTTP transport in `src/http-server.ts`, tool assembly in `src/server-factory.ts`. `src/lib/brief-extraction-prompt.ts` turns a natural language media brief into structured campaign parameters, logged to `brief_log`.
2. **REST API** (`web/src/app/api/ads/*`). Campaigns, creatives, pause and resume, moment types, reporting, inventory, webhooks, postback. Specified in `docs/openapi/norma-ads-api.yaml` and served at `/api/ads/openapi.json`.
3. **Intent API** (`supabase/functions/intent-api/`). Server to server buyers holding raw API keys. `GET /inventory` and `POST /bid`, the latter entering the same Vickrey auction as everyone else. **Status is disputed between the source comment and doc 06: see section 9 entry 4 before relying on it either way.** Gated by the `INTENT_API_ENABLED` secret. Auth is a bearer key hashed with SHA 256 against `api_keys`; the rate limit is 50 requests per minute per key, held in memory and therefore reset on cold start.

**Auth model** (`web/src/lib/oauth.ts`, `web/src/lib/scope-middleware.ts`). RS256 JWTs, one hour expiry, key id defaulting to `norma-ads-key-1`, public keys published at `/api/auth/.well-known/jwks.json`, tokens minted at `/api/auth/token`. Four scopes and only four:

```
campaigns:read   campaigns:write   reporting:read   inventory:read
```

`requireAuth(request, requiredScope)` tries JWT verification first and falls back to a legacy hashed API key, which is treated as carrying all scopes. Missing token yields 401; wrong scope yields 403. Clients are managed at `/api/settings/oauth-clients` and stored in `oauth_clients` and `oauth_access_tokens`.

**Outbound.** `webhook_endpoints`, `webhook_delivery_log`, and `web/src/lib/webhook-delivery.ts` push events back to the buyer; `/api/ads/postback` receives conversion signals.

**Invariant.** Every one of these doors returns aggregates. No endpoint exposes a user row, and clearing logic is identical regardless of which door the bid arrived through.

---

### B3. Distribution partner

`web/src/app/partners/[partnerKey]/page.tsx` renders a co marketing landing page per partner from the `partners` table, with attribution through `partner_referral_codes`. Admin management sits at `/admin/partners` with server actions in `admin/partners/actions.ts`. Partner facing collateral (Kalshi, Polymarket, streaming, fantasy, editorial, Apple) is written up under `docs/partnerships/`.

---

## 7. Internal journeys

### C1. Admin operator

**Gate.** Two layers. `web/src/middleware.ts` rejects non admins at the edge, and `requireAdmin()` in `web/src/lib/admin.ts` re checks `user.app_metadata.role === "admin"` server side and redirects to `/dashboard` on failure. Role lives in Supabase `app_metadata`, so it cannot be set by the client.

| Console | Route | Responsibility |
|---|---|---|
| Overview | `/admin/dashboard` | System state |
| Advertisers | `/admin/advertisers`, `/[id]` | Account management |
| Campaigns | `/admin/campaigns`, `/[id]` | Approve and reject campaigns and creatives |
| Direct deals | `/admin/campaigns/direct-deals` | Negotiated inventory |
| Auction engine | `/admin/auction-engine`, `/live` | Configuration plus live auction view (`components/live-auction-dashboard.tsx`) |
| Fraud | `/admin/fraud` | Review `ad_fraud_events` |
| Revenue | `/admin/revenue`, `/yield`, `/affiliates` | Financial reporting |
| Users | `/admin/users` | User management |
| Growth | `/admin/growth` | Weekly report from `growth-weekly-report`, stored in `growth_reports` |
| Partners | `/admin/partners` | Partner records |

**The human gate.** `creative-prescreen` uses Claude to pre screen creatives, but approval routes through `POST /api/admin/campaigns/[id]/creatives/[creativeId]/approve` and requires a human. The model narrows the queue; it does not decide. Preserve this. It is the single most important behavioral property of the ads pipeline.

---

### C2. Content operator

`web/src/app/cmo/page.tsx` is the content calendar and approval surface. `cmo-generate` drafts brand social content with Claude, `generate-social-content` and `generate-recap-content` produce post and recap variants, `publish-social-posts` and `cmo-publish` distribute, and `fetch-social-metrics` reads performance back into `social_posts` and `social_hashtag_performance`. Consumer auto-post images are chosen by `_shared/social-media-select.ts` — settings / Tier-C sportsbook chrome is denylisted; alert / Why Now / red-zone screenshots are preferred. X and Twitter publishing is connected; Instagram, Facebook, TikTok, and Reddit are built but not fully wired to their platform APIs.

`lib/__tests__/no-ai-image-generation.test.ts` enforces a standing prohibition on AI generated imagery in published content. Do not weaken that test.

---

## 8. Codebase tour

```
app/                      Expo Router routes. (auth) and (tabs) groups.
                          _layout.tsx holds AuthGate, push registration,
                          and notification response routing. Start here.
components/               27 presentational and sheet components.
                          WatchNowButton and AlertCard are the two that
                          carry the most product weight.
hooks/                    20 TanStack Query hooks. One per domain.
                          This is the client data layer; there is no
                          separate service layer.
lib/                      Pure logic, constants, deep links, geo
                          compliance, share formatting, referral,
                          Supabase client. Heavily unit tested.
lib/__tests__/            22 Jest suites. Read these to learn intended
                          behavior faster than reading implementations.
supabase/functions/       45 Deno Edge Functions plus _shared/.
                          _shared/alert-scoring.ts is the single most
                          important backend file in the repository.
supabase/migrations/      99 migrations, append only, strictly numbered.
web/                      Next.js App Router. src/app for routes,
                          src/lib for auth, scopes, and API clients,
                          src/middleware.ts for the access gate.
packages/norma-ads-mcp/   MCP server exposing six advertising tools.
docs/watch-norma-context/ This folder. The canonical project brain.
docs/partnerships/        Partner facing collateral.
docs/openapi/             API specification.
scripts/, plugins/        Build and operational tooling.
__tests__/                Root level integration tests.
```

**Conventions.** TypeScript throughout. Route files are lowercase with hyphens; components are PascalCase; hooks are `useThing.ts`. Edge Functions are lowercase with hyphens and are idempotent by contract. Migrations follow the mandatory numbering rule in `CLAUDE.md`.

**Where to start for a given task:**

| Task | Open first |
|---|---|
| Change what triggers an alert | `supabase/functions/_shared/alert-scoring.ts` |
| Change where Watch sends a user | `lib/deep-links.ts`, `components/WatchNowButton.tsx` |
| Add a screen | `app/(tabs)/`, then the matching hook in `hooks/` |
| Change ad pricing or auction | `06_ADS...md`, then `floor-price-optimizer` |
| Add an advertiser API capability | `web/src/app/api/ads/`, then `docs/openapi/` |
| Add an agent tool | `packages/norma-ads-mcp/src/tools/` |
| Add any user data table | the migration, then `delete-account` |

---

## 9. Verified findings

Every entry below was confirmed against at least two sources (code plus a doc, a migration, or a second file). Entries that did not survive that check have been deleted rather than annotated. Treat this as a live list: resolve an entry, delete it.

1. **Football is complete and deliberately gated.** `_shared/alert-scoring.ts` has sport aware `checkMustNotify` and `extractSignals` for `nfl` and `ncaaf`, `evaluate-alerts/logic.ts` has the spread, total, moneyline, and close game evaluators, and floor prices are seeded for all three football moment types (migration `20260706000004`). `evaluate-alerts/index.ts` line 103 holds it behind `ALERTABLE_SPORTS = new Set(["ncaam", "nba", "mlb"])`. **The gate is intentional. Activation target is September 1, 2026, NFL kickoff.** Do not remove it as cleanup. `lib/__tests__/sport-football-scaffold.test.ts` mirrors the gate on purpose and its assertions are correct.
   *Verified: code line 103 plus `09_ROADMAP_KNOWN_GAPS_AND_DECISIONS.md` line 19.*

2. **The sport base URL maps in `lib/constants.ts` are dead.** `SPORTSDATAIO_BASE_URLS`, `SPORTRADAR_BASE_URLS`, and `ESPN_BASE_URLS` have no consumer anywhere in the repository. Real ingestion URLs live inside the Edge Functions (`poll-schedule`, `poll-boxscore`, `_shared/sportradar.ts`) and already cover `nfl` and `ncaaf`. Do not read them as a source of truth for supported sports, and do not add keys expecting an effect.
   *Verified: repository wide grep returns zero importers; football URLs confirmed present in the Edge Functions.*

3. **The Connections tab is labeled Watch.** The route segment is `connections`; `app/(tabs)/_layout.tsx` sets `title: "Watch"`. Searching either the code or the docs by the visible label will mislead you.
   *Verified: route tree plus tab layout.*

4. **The intent API is unreachable by design conflict, not by feature flag.** `verify_jwt` is `true` on the deployed `intent-api` function, so Supabase rejects any request whose `Authorization` header is not a valid Supabase JWT before the function body executes. The API's documented auth is a raw API key in that same header. The two cannot coexist. Setting `INTENT_API_ENABLED` does nothing while this holds. Fix by setting `verify_jwt = false` for this function, as `poll-boxscore` and `publish-social-posts` already do, and only then revisit the flag. The function is deployed at version 1 dated 2026-06-18 and has never been redeployed; `api_keys` holds zero rows, so nothing has ever authenticated against it.
   *Verified: live function metadata from the Supabase project, `intent-api/index.ts` auth path, and a count against `api_keys`.*

5. **The intent API rate limiter does not survive a restart.** `intent-api/index.ts` holds its counters in a module level `Map` that resets on Edge Function cold start, so the effective ceiling is looser than the advertised 50 per minute. Not currently exploitable, since entry 4 means nothing can reach the endpoint, but it must be fixed before the API opens to partners. Note that `api_rate_log` is **not** the table for this: it comes from migration `012`, is keyed by `provider` and `window_start`, and tracks sports data provider budgets. Durable per key limiting needs a new table.
   *Verified: in memory Map in code plus migration `012` schema.*

6. **Two APIs share one key table, with two different auth mechanisms.** This is by design, not a defect, but it catches people:
   - The **ads API** (`web/src/app/api/ads/*`) authenticates RS256 JWTs or hashed API keys via `scope-middleware.ts`, against four scopes: `campaigns:read`, `campaigns:write`, `reporting:read`, `inventory:read`.
   - The **intent API** (`supabase/functions/intent-api/`) authenticates **only** a SHA 256 hashed key against `api_keys`. It does not verify JWTs at all. Its `POST /bid` enforces a `bid:write` scope that the ads API's `Scope` type does not contain.
   - Consequence: an OAuth client can never hold `bid:write`, because migration `081` constrains `oauth_clients.scopes` to the four. An OAuth or MCP agent therefore cannot use `POST /bid`.
   - **This does not block agents from bidding.** Agents bid through campaigns: `create-campaign` (MCP) sends `bid_cpm_usd` to `POST /api/ads/campaigns`, which validates against the floor and writes one row per moment type into `bids`, entering the same Vickrey auction. `POST /bid` is a separate door for server to server buyers holding raw keys.
   *Verified: `oauth.ts`, `scope-middleware.ts`, `intent-api/index.ts` line 138, migration `081` CHECK constraint, `api/ads/campaigns/route.ts` line 182, and the MCP `create-campaign` tool.*

7. **`api_keys.scopes` is `NOT NULL`,** with a column default of `ARRAY['inventory:read', 'bid:write']` (migration `079`). The `?? [...]` fallback inside `resolveApiKey()` is therefore unreachable dead code. Harmless, but do not reason from it.
   *Verified: migration `079` line 14 plus `scope-middleware.ts`.*

8. **`OUTAGE-REPORT-2026-05-16.md` at the repository root is required reading before touching ingestion.** It documents a 37 day P0 caused by reading ESPN's `status.type.name` instead of `status.type.description`, and rule 19 in doc `10` makes the correct field permanent.
   *Verified: outage report plus rule 19.*

---

9. **The repository is not what production runs.** As of 2026-07-29, 34 migrations were unapplied, eight Edge Functions had never been deployed, and four cron jobs had never succeeded. Twenty nine of those migrations have since been applied. See `12_PRODUCTION_RECONCILIATION_2026_07.md` before assuming any feature described in this document is actually live. The migration ledger itself is unreliable in both directions.
   *Verified: schema state queried directly against the live project, function list from the Supabase API, and `cron.job_run_details`.*

---

## 10. Update protocol

This file describes behavior, and behavior changes. Keep it true.

**Update this file whenever you change:** a route, a screen, an auth gate or role check, an OAuth scope, an alert threshold or must notify rule, the deep link chain or provider registry semantics, a wager or position ingestion path, the deletion cascade, an admin console, an agent facing tool, or the set of supported sports.

**How to update it well:**
- Cite the file and, where it is load bearing, the line. A claim without a location is a claim the next agent has to re verify.
- When you resolve one of the findings in section 9, delete the entry rather than annotating it. That section is a live defect list, not a changelog.
- If you find this document wrong, fix it in the same session. A stale map is worse than no map, because it is trusted.
- Update `README.md` in this folder if you add a sibling document.

**Session closing checklist:** confirm `10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md` is satisfied, confirm migrations are numbered correctly, confirm affected docs in this folder are updated, and confirm any new user data table is covered by `delete-account`.
