# 04 — Data and Integrations

## Live Sports Data

Watch-NORMA ingests live sports data from multiple providers with a primary/fallback hierarchy to maximize reliability and minimize cost.

### ESPN (Primary Real-Time Source, All Sports)

ESPN's public API is the canonical real-time source for live scores and game status across every sport NORMA supports. It is free, requires no API key, and provides accurate, low-latency data. NORMA does not use Sportradar for real-time scoring; Sportradar is reserved for supplementary play-by-play and summary statistics on the sports that carry an active Sportradar contract.

- **Endpoints used:** Sport-specific scoreboard endpoints — `.../basketball/mens-college-basketball`, `.../basketball/nba`, `.../baseball/mlb`, `.../football/college-football`, `.../football/nfl` (constants in `lib/constants.ts` → `ESPN_BASE_URLS`, mirrored in `poll-schedule/index.ts` and `poll-boxscore/index.ts` as `ESPN_BASES`).
- **Data extracted:** Team names, scores, game status (`status.type.description`), period, clock, venue, broadcast info.
- **Polling frequency:** Schedules every 30 minutes via `poll-schedule` (multi-sport ESPN loop, all sports except NCAAM basketball which also reads SportsDataIO); live scores every 1 minute via `poll-boxscore`.
- **Critical rule (#19):** Always use `status.type.description` (human-readable: "In Progress"), never `status.type.name` (machine code: "STATUS_IN_PROGRESS"). The May 2026 outage was caused by reading the wrong field — see `OUTAGE-REPORT-2026-05-16.md`.
- **Status mapping:** ESPN descriptions are normalized to canonical values: "scheduled", "inprogress", "halftime", "closed", "cancelled", "postponed" via `_shared/utils.ts`.
- **Required User-Agent header (added 2026-08-19):** ESPN's public scoreboard edge returns HTTP 403 when the request UA is `Mozilla/*`, `Deno/*`, or a custom identifier like `Watch-NORMA/1.0`. It only accepts well-known HTTP-client-library UAs (`curl/*`, `python-requests/*`, `Go-http-client/*`, `okhttp/*`, `axios/*`). Both `poll-schedule` and `poll-boxscore` now send `User-Agent: curl/8.7.1 (Watch-NORMA/1.0 <function>)` on every ESPN fetch. Without this header the multi-sport ingestion silently ingests zero games (fetch returns 403, `!res.ok` branch continues to the next sport). This was the load-bearing bug behind the 2026-08-19 NCAAF/NFL activation appearing to fail after CI deploy.

### SportsDataIO (Schedules + Fallback Scores)

SportsDataIO is the primary source for game schedules (especially NCAA) and a fallback for scores when ESPN data is incomplete.

- **Endpoints used:** `GamesByDate` (schedules), `Scores` (live scores), `BoxScore` (basketball stats), `PlayByPlay` (basketball PBP)
- **API key required:** Yes (`SPORTSDATAIO_API_KEY`)
- **Polling frequency:** Schedules every 30 minutes via `poll-schedule`; scores used as fallback in `poll-boxscore`
- **Sports supported:** NCAA basketball (primary), NBA (supplementary), MLB (limited)

### Sportradar v8 (Play-by-Play + Summaries)

Sportradar provides detailed play-by-play events and game summaries used by the alert engine for signal extraction.

- **Endpoints used:** PBP (sport-specific), Summary (sport-specific), Schedule (cross-mapping)
- **API keys:** `SPORTRADAR_API_KEY` (primary), with optional sport-specific keys (`SPORTRADAR_NBA_API_KEY`, `SPORTRADAR_MLB_API_KEY`)
- **Rate budgeting:** The system tracks API calls per minute and per hour via `api_rate_log` table. The orchestrator checks remaining budget before dispatching PBP/summary requests. If nearing the limit, lower-priority polls are skipped.
- **Sports supported:** NCAA basketball, NBA, MLB (with sport-specific parsing for MLB including pitcher/batter stats, no-hitter detection)
- **Fallback:** SportsDataIO BoxScore/PBP for basketball when Sportradar is unavailable or rate-limited

### The Odds API (Sportsbook Odds)

The Odds API provides pre-game and live odds from major sportsbooks.

- **Endpoints used:** `basketball_ncaab` (NCAAB), `basketball_nba` (NBA), `baseball_mlb` (MLB)
- **Bookmakers tracked:** DraftKings, FanDuel, BetMGM, ESPNBet
- **Market types:** Spreads, totals (over/under), head-to-head (moneyline)
- **Polling frequency:** Every 5 minutes via `poll-odds`; all three sports fetched sequentially in one invocation
- **Game matching:** Odds API events are matched to DB games using fuzzy team name matching (`_shared/team-matching.ts`) with 80+ aliases including NBA and MLB name variants. Each sport fetch is pre-filtered by the DB `sport` column (e.g., only `sport='nba'` teams/games are passed when fetching NBA odds), preventing cross-sport team-name collisions (e.g., "Indiana Pacers" vs "Indiana Hoosiers").
- **Quota usage:** 3 API calls per 5-minute cycle (one per sport). To disable a sport without redeploying, set `ODDS_DISABLED_SPORTS=basketball_nba,baseball_mlb` (comma-separated Odds API sport keys).
- **Per-sport coverage audit (P1-08):** Previously only `basketball_ncaab` was fetched; NBA and MLB were silent gaps. Extended in P1-08 to cover all three sports NORMA supports. No schema change needed — the `sport` column on `games` and `teams` (migration 049) was already in place.

## Streaming Availability Data

### Provider Registry

The `provider_registry` table (originally `streaming_providers`, renamed in migration 011 with a backward-compatibility view) is the single source of truth for all streaming/TV/sportsbook provider metadata.

Each provider record includes:
- `key` — unique identifier (e.g., `youtube_tv`, `espn_plus`)
- `name` — display name
- `category` — streaming, tv, sportsbook, prediction_market
- `ios_scheme` — native app deep link (e.g., `youtube://tv.youtube.com`)
- `android_deep_link` — Android intent/scheme
- `universal_link` — HTTPS URL that opens the app or falls back to web
- `fallback_store_url` — App Store / Play Store URL
- `ios_app_store_url` — iOS App Store direct link
- `web_url` — web fallback

### Deep Linking

The `lib/deep-links.ts` module implements the 3-step fallback chain:
1. Try `ios_scheme` via `Linking.canOpenURL` / `Linking.openURL`
2. If fails → try `universal_link`
3. If fails → open `fallback_store_url`

Success/failure and method used are logged to `deep_link_events` table for monitoring.

### ESPN → SportsDataIO Automatic Failover (P1-06)

`poll-boxscore` now makes failover **explicit and automatic**. For each poll:

1. ESPN is tried first. If the API request fails (non-2xx, timeout, network error), `fetchFailed=true` is returned and a structured `event: "espn_unavailable"` log is emitted.
2. Per game, source selection is tracked: `"espn+sdio"` (both available), `"espn_only"`, or `"sdio_only"` (failover).
3. When a game falls back to SportsDataIO-only, a structured `event: "failover"` log is emitted with `reason: "espn_api_down"` or `"no_espn_match"`.
4. The `source` field in `game_snapshots.payload` accurately reflects which data source was used.
5. `health-check` surfaces `espn_failover.espn_degraded = true` when any `sdio_only` snapshot was created in the last 5 minutes.
6. `monitor-health` pages Slack when `espn_degraded` is true (fingerprint: `espn_score_source_failover`).

**Non-negotiable preserved:** ESPN `status.type.description` is still used (never `status.type.name`). When both sources fail, no score is fabricated — the game record is not updated.

### Proactive Universal-Link Verification (P1-05)

`verify-provider-links` is a separate Edge Function (not part of `deep-link-health-check`) that proactively tests each `streaming`/`tv` provider's `universal_link` every 6 hours (pg_cron, migration 069). It does not modify routing behavior — detection only.

**Classification rules** (see `supabase/functions/verify-provider-links/logic.ts`):

| Result | Condition |
|--------|-----------|
| `ok` | HTTP 200/2xx, or final path matches an ok fragment (`/watch`, `/live`, `/login`, `/sports`, `/browse`, etc.) |
| `suspect` | Final path matches a marketing fragment (`/welcome`, `/signup`, `/get-started`, `/plans`, etc.) |
| `broken` | 4xx/5xx, timeout, or network error |

The `ok` fragment list takes precedence over `suspect` — `/watch/signup` is `ok`. Results are recorded in `provider_link_checks`; Slack is paged when a provider's status changes from a previous check.

**YouTube TV history:** This function was motivated by migrations 052–054, where `universal_link = 'https://tv.youtube.com'` silently redirected to `/welcome` (sign-up page) instead of opening the app. The suspect/ok path classification would have caught this immediately.

### Broadcast Mapping

Games from ESPN/SportsDataIO include a `broadcast` field (e.g., "ESPN", "TNT", "CBS"). The function `getBroadcastProviderKeys()` maps these broadcast strings to provider keys. The function `getBestWatchProvider()` intersects broadcast providers with the user's connected providers to determine the best watch destination.

### Known Limitations

- **No blackout detection.** Broadcast data reflects national coverage only. Regional sports network games and local blackouts are not detected.
- **Stale broadcast data.** Broadcast assignments can change close to game time. The system relies on the most recent poll data.
- **Universal link accuracy.** Provider universal links have been a recurring issue (see migrations 036, 052–054 for YouTube TV fixes). The `deep-link-health-check` function monitors for regressions by analyzing `deep_link_events`.

## Sportsbook Integrations

### Current State: Tier C (Manual Tracking)

All sportsbook tracking is currently manual. The user indicates which sportsbooks they use (DraftKings, FanDuel, BetMGM, etc.) via the Connections tab, but no credentials or API access is involved.

Wagers enter the system via three paths:
1. **Manual entry** (`AddWagerSheet`) — user fills in sportsbook, market type, description, line, odds, stake, parlay legs
2. **Bet slip scan** (`parse-bet-slip`) — user photographs a bet slip, Claude Vision extracts details, user confirms
3. **Email forwarding** (`ingest-email-wagers`) — user forwards sportsbook confirmation emails to `bets@getnorma.app`, system parses and creates wagers with `source = 'email_parse'`

Wagers are auto-resolved when games close: `resolve-wagers` checks spread, moneyline, and over/under outcomes.

### Tier A: Partner API (Scaffolded)

The `BetIngestor` interface is defined in `_shared/bet-ingestor.ts` with `NormalizedWager` types and a registry lookup via `getIngestor()`. Stub adapters exist for DraftKings and FanDuel but return empty results — no public consumer API exists for these services. When partnerships are secured, only the adapter implementation needs to change.

### Sportsbook Deep Links

The `BetNowButton` component and `_shared/sportsbook-links.ts` provide deep-link routing to sportsbook apps as a CTA from alerts. These are referral-style links, not account integrations.

## Prediction Market Integrations

### Kalshi (Implemented)

- **Connection:** User provides API Key ID + RSA private key (.pem) via `KalshiWizard`
- **Auth:** RSA-PSS signed requests (SHA-256) via `kalshi-crypto.ts`
- **Credential encryption:** On connect, `kalshi-proxy` encrypts the RSA private key with AES-GCM (WebCrypto, 256-bit key) using `KALSHI_ENCRYPTION_KEY` (Supabase secret). Ciphertext (IV prepended, base64) is stored in `connections.private_key_enc` (migration 071). The API key ID is stored in `connections.metadata` (no private key plaintext in metadata for new connections). Legacy connections with `metadata.private_key` still work via a fallback read path — users are encouraged to reconnect to migrate.
- **Proxy:** `kalshi-proxy` Edge Function whitelists read-only GET requests (balance, positions, markets, events). No trade execution is permitted.
- **Position sync:** `poll-markets` fetches positions every 5 minutes, matches markets to games via team name extraction from market titles
- **Settlement:** `resolve-predictions` settles positions when games close, using Kalshi public market API for outcomes, with fallback to score inference
- **Storage:** `connections` table (`private_key_enc` column for encrypted key; `metadata` for API key ID), `prediction_positions` table (positions with settlement status)

### Polymarket (Implemented)

- **Connection:** User provides wallet address via `PolymarketWizard`
- **Auth:** None (public wallet address, read-only)
- **Position sync:** `poll-markets` fetches from Polymarket CLOB API using wallet address
- **Game matching:** Market titles parsed for team names, matched to DB games
- **Settlement:** Handled by `resolve-predictions` with Kalshi-style logic

## User Data

### Profile and Preferences

- `profiles` — user_id, display_name, email, push_token, push_enabled, timezone, ad_personalization, avatar_url
- `user_preferences` — user_id, favorite_teams (JSONB), notification_settings (JSONB: quiet hours, max alerts per game/hour, channels), bet_forwarding_email

### Activity Data

- `follows` — user follows for teams, games, with entity_type/entity_id for player/league follows
- `connections` — connected streaming/TV/sportsbook/prediction-market providers with metadata (Kalshi API key, Polymarket wallet, etc.)
- `wagers` — all wagers with source (manual, bet_slip_scan, email_parse), provider_key, market_type, legs (parlay), stake, odds, status, parsed_target
- `prediction_positions` — Kalshi/Polymarket positions with market title, side, quantity, prices, P&L, settlement status
- `alerts` — all generated alerts with type, score, explanation (JSONB), sponsor fields, read status
- `delivery_log` — push delivery attempts with status, provider_message_id
- `alert_throttle` — dedup hashes for throttling

### Social Content Media

- `media_assets` — real NORMA app screenshots in the `social-images` bucket. Consumer auto-posts (`generate-social-content`, `cmo-generate`, `generate-recap-content`) select via `_shared/social-media-select.ts`. Settings / connections / Tier-C chrome (`sportsbooks-manual.png`, `sportsbooks-email.png`, `tv-providers.png`, `prediction-markets.png`, `streaming-services.png`) is denylisted and `eligible_for_consumer_auto_post = false` (migration `20260905160000`). Preferred tags: `alerts`, `why_now`, `red_zone`, `never_miss`. The watch/alert fallback is `game-detail-watch.png`. Dedicated red-zone / Why Now alert screenshots still need a Design upload.

### Advertising Data

- `impressions` — ad impressions with clearing price, tap status, conversion tracking
- `conversions` — post-impression actions (stream_open, sportsbook_open, wager_placed, cta_tap)
- `ad_fraud_events` — detected fraud signals

## Integration Status Table

| Integration | Purpose | Status | Relevant Files | Notes |
|---|---|---|---|---|
| ESPN API | Live scores, game status, broadcast info | **Implemented** | `poll-boxscore`, `poll-schedule` | Free, no key needed. Use `type.description` not `type.name`. |
| SportsDataIO API | Schedules, fallback scores, basketball PBP | **Implemented** | `poll-schedule`, `poll-boxscore`, `poll-pbp`, `poll-summary` | Requires API key. Primary for NCAA schedules. |
| Sportradar v8 API | PBP, summaries, cross-mapping | **Implemented** | `poll-pbp`, `poll-summary`, `poll-schedule`, `_shared/sportradar.ts` | Rate-budgeted. Multi-sport (NCAAM, NBA, MLB). |
| The Odds API | Sportsbook odds (DK, FD, BetMGM, ESPNBet) | **Implemented** | `poll-odds` | NCAA basketball odds. |
| Kalshi API | Prediction market positions, settlement | **Implemented** | `kalshi-proxy`, `poll-markets`, `resolve-predictions`, `_shared/kalshi-crypto.ts` | RSA-PSS auth. Read-only. |
| Polymarket CLOB API | On-chain prediction positions | **Implemented** | `poll-markets`, `resolve-predictions` | Wallet-address based. |
| Expo Push API | Push notifications | **Implemented** | `send-push` | Badge count, delivery logging. |
| Anthropic Claude API | Bet slip OCR, email parsing, social content | **Implemented** | `parse-bet-slip`, `ingest-email-wagers`, `cmo-generate`, `generate-social-content` | Claude Sonnet (vision), Claude Opus (content). |
| Gmail API | Email wager ingestion | **Implemented** | `ingest-email-wagers`, `renew-gmail-watch` | Pub/Sub push, service account JWT. |
| Stripe | Advertiser billing | **Implemented** | `stripe-checkout`, `stripe-webhook` | Checkout Sessions + Webhooks. |
| X/Twitter API | Social publishing | **Implemented** | `cmo-publish`, `publish-social-posts`, `fetch-social-metrics` | OAuth 1.0a, v2 API + v1.1 media upload. |
| Instagram Graph API | Social publishing + metrics | **Partial** | `publish-social-posts`, `fetch-social-metrics`, `_shared/social-publishers.ts` | Publisher code exists. Needs verification. |
| Facebook Graph API | Social publishing + metrics | **Partial** | `publish-social-posts`, `fetch-social-metrics`, `_shared/social-publishers.ts` | Publisher code exists. |
| TikTok API | Social publishing | **Scaffolded** | `_shared/social-publishers.ts` | Reference structure only. |
| Reddit API | Social publishing | **Scaffolded** | `_shared/social-publishers.ts` | Reference structure only. |
| DraftKings API | Sportsbook wager sync | **Planned (no API exists)** | `_shared/bet-ingestor.ts` | Stub adapter. Depends on partnership. |
| FanDuel API | Sportsbook wager sync | **Planned (no API exists)** | `_shared/bet-ingestor.ts` | Stub adapter. Depends on partnership. |
| PrizePicks / Underdog | Pick'em roster import + slip/email parse + sponsor CTA | **Tier B/C** | `ImportRosterSheet`, `lib/roster-import.ts`, `parse-bet-slip`, `email-parser.ts`, `sportsbook-links.ts` (`buildPickEmLink` / `contextualizeSponsorCtaUrl`), `auction-engine.ts`, migrations 092 + `20260904183000` | No public consumer API. Platform persisted on `follows.fantasy_source`. Player follows are alert candidates when the player is in the game. Auction CTAs rewrite pick'em URLs to a sport-scoped board. `sportsbook_restrictions` seeds Player Picks (PrizePicks) and Pick'em-or-Champions (Underdog) so `useSportsbookGeo` is not fail-closed for those keys. |
| Sleeper / Yahoo Fantasy / ESPN Fantasy | Season-long roster paste | **PARTIAL / Tier C** | `lib/fantasy-platforms.ts`, `ImportRosterSheet`, migration `20260904183000` | UI picker + provider_registry deep-link metadata. No live roster API. No sportsbook_restrictions (not a wagering CTA). |
| DraftKings DFS | DFS lineup paste | **PARTIAL / Tier C** | `FANTASY_PLATFORMS` key `draftkings_dfs` | Distinct from DraftKings Sportsbook. Import-only. No provider_registry row. |
| Streaming service APIs | Watch history | **Not possible** | — | No streaming service offers this API. |

## Data Quality Risks

- **Stale sports data.** If ESPN or SportsDataIO returns cached data, scores may lag by 30–60 seconds. During high-traffic periods (March Madness), delays increase.
- **Delayed game state.** The orchestrator polls on intervals, so there is inherent latency between a real-world event and the alert reaching the user. Target: under 90 seconds end-to-end.
- **Incorrect broadcast mapping.** Broadcast fields from ESPN/SportsDataIO may not reflect last-minute changes, regional overrides, or streaming-only exclusives.
- **Regional restrictions.** No blackout detection means some users may be routed to a provider that blacks out their local market.
- **Account connection failures.** Kalshi API keys can expire or be revoked. Polymarket wallet addresses can be entered incorrectly. Gmail Pub/Sub watches expire weekly.
- **Duplicate alerts.** The dedup system uses hash-based suppression, but rapid game state changes (e.g., a scoring run) can generate multiple alerts within the cooldown window.
- **Incorrect provider routing.** Deep link schemes and universal links change when providers update their apps. The `deep-link-health-check` monitors for degradation.
- **Bad odds/market mapping.** Team name matching uses fuzzy logic with aliases. Edge cases (e.g., teams with similar names across conferences) can cause mismatches.
- **Privacy-sensitive account data.** Kalshi API keys and Polymarket wallet addresses are stored in `connections.metadata`. RLS restricts access to the owning user.

## Data Lifecycle and Retention (P1-04)

High-volume tables are pruned daily by the `purge-old-data` Edge Function (9 AM UTC / 4 AM ET, pg_cron via migration 068). Deletes are batched in groups of 500 rows to avoid holding long locks.

| Table | Retention | Reason |
|-------|-----------|--------|
| `game_snapshots` | 30 days | Transient polling state; not user-facing |
| `deep_link_events` | 90 days | Observability window; no PII |
| `delivery_log` | 180 days | Delivery audit; user-linked but not billing |
| `impressions` | 397 days (13 months) | Advertiser YoY reporting requires full prior-season data |
| `conversions` | Cascades with `impressions` | `ON DELETE CASCADE` — no separate window needed |

**Rollup preservation:** The `daily_impression_stats` materialized view is refreshed (via `refresh_daily_impression_stats()` RPC) before any impression rows are deleted. Advertiser reporting (`advertiser_reporting` view, `reporting-api`, `/admin/revenue`) reads from the materialized view and is unaffected by raw purges.

**Dry-run mode:** Invoking `purge-old-data` without `{"dry_run": false}` in the request body returns row counts that would be deleted without performing any deletions. The cron job always passes `dry_run: false`.
