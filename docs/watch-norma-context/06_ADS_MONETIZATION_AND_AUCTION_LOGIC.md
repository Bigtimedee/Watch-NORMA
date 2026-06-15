# 06 — Ads, Monetization, and Auction Logic

## Monetization Thesis

Watch-NORMA monetizes attention at the exact moment the user is most likely to act. The app's inventory is not generic impressions — it is context-rich, intent-rich sports attention moments. When a user receives an alert that their spread bet is live with 2 minutes left, they are maximally engaged. An ad attached to that moment (e.g., a sportsbook CTA or streaming offer) reaches the user at peak relevance.

This is fundamentally different from banner ads or pre-roll video. NORMA's ad unit is a sponsored line attached to a push notification or in-app alert card. The ad is contextually matched to the moment type, the user's interests, and the game state.

## Ad Surfaces

All ad surfaces are implemented and integrated into the alert pipeline.

**Alert-ad companion (primary).** Every alert that clears the throttle/dedup stage enters the Vickrey auction. If a sponsor wins, their logo, copy, and CTA URL are attached to the alert card. The sponsor text appears below the alert explanation. The CTA button (e.g., "Bet Now on DraftKings") appears alongside the "Watch on [Provider]" button.

**In-app alert card.** The `AlertCard` component renders the sponsor logo, sponsor text, and CTA button when present. Tapping the CTA opens the sportsbook or advertiser deep link.

**Moment types that trigger auctions:** close_game, spread_alert, total_alert, moneyline_alert, player_prop, comeback, overtime, game_resolved, prediction_resolved, foul_trouble, mlb_close_game, mlb_walk_off, and others.

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

## Floor Pricing

### Base Floor Prices

Stored in `floor_prices` table, per moment type. Defaults from `_shared/pricing-engine.ts`:

| Moment Type | Default Floor |
|-------------|---------------|
| `prediction_resolved` | $0.60 |
| `bet_resolved` / `game_resolved` | $0.50 |
| `spread_alert` | $0.40 |
| `close_game` | $0.35 |
| `overtime` | $0.35 |
| `comeback` | $0.30 |
| Default (other types) | $0.25 |

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

Guardrails: max ±20% per day, absolute range $0.05–$2.00, minimum 50 auctions per moment type before any adjustment.

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

## Supply Forecasting

The `forecast-supply` Edge Function runs daily at 2 AM and generates 7-day supply forecasts:

- Uses learned moment rates (historical alerts per game per moment type), blended with hardcoded fallbacks.
- `predicted_moments = games_scheduled × moment_rate`
- `eligible_users = predicted_moments × avg_users_per_game`
- Stored in `supply_forecasts` table. Available to advertisers via the reporting API and the `/inventory` page.

## Advertiser Portal (web/)

The Next.js advertiser portal provides full self-service campaign management:

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

**Campaign approval workflow (implemented):** Campaigns created by advertisers land in `approval_status = 'pending'`. They do not enter the auction until an admin approves them. Admin UI at `/admin/campaigns` shows pending count badge and per-row Approve/Reject controls. Rejection requires a written note that is surfaced to the advertiser. Approved campaigns enter the auction; rejected campaigns are locked. Migration 065 added `approval_status`, `approval_note`, `reviewed_at`, `reviewed_by` to the campaigns table.

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

## Compliance and Risk

- **Gambling-related ads are regulated.** Sportsbook ad geo-filtering is enforced at both the auction level and at the `BetNowButton` CTA level (see Geo-Compliance section above). Both enforcement points use the same `inferStateFromTimezone` logic.
- **Age gating.** The App Store requires apps with gambling-adjacent content to have age restrictions. The app's rating and content descriptors must accurately reflect the presence of sportsbook CTAs.
- **Do not personalize sensitive betting offers unless legally permitted.** The ad personalization toggle gives users control. When off, behavioral signals are excluded.
- **Separate editorial relevance from paid placement.** Alert explanations are generated independently of the ad auction. The sponsor appears as a clearly labeled addition, not as part of the alert content.
- **Frequency cap aggressively.** Max 3 ads per user per day, with fatigue model suppression at 6+ sponsored alerts in 24 hours. This is a trust-preservation mechanism.
