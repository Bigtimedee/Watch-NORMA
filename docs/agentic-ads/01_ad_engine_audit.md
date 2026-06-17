# NORMA Ad Engine — Technical Audit

_Reference document for P02–P08. Produced by P01 audit pass._

---

## 1. API Inventory

### Campaign Management

**`POST /functions/v1/campaign-api`** — Bearer JWT required

| Action | Description | State Transition |
|--------|-------------|-----------------|
| `activate` | Move draft/paused campaign to pending review or active | draft → pending_review; paused → active |
| `pause` | Pause a running campaign | active → paused |
| `resume` | Resume a paused campaign | paused → active |
| `archive` | Permanently archive a campaign | any → archived |
| `validate` | Dry-run validation (no state change) | — |

Request body: `{ action, campaign_id }`. Validates: name, budget > 0, targeting_rules non-empty, flight_end > flight_start, advertiser wallet balance ≥ remaining budget.

### Reporting

**`POST /functions/v1/reporting-api`** — Bearer JWT required

| Report Type | Description |
|-------------|-------------|
| `overview` | All campaigns summary from `advertiser_reporting` view |
| `campaign_detail` | Single campaign + daily breakdown via `get_campaign_daily_stats()` RPC (cohort ≥ 5 enforced) |
| `creative_performance` | Per-creative impressions, taps, CTR |
| `attribution` | 30-min window; inferred vs app-verified conversions; CPA, action rate |
| `supply_forecast` | 7-day forecasts from `supply_forecasts` table (available to all advertisers) |

### Programmatic Intent API (Scaffolded — Not Production)

**`GET /functions/v1/intent-api/inventory`** — API key required (`Authorization: Bearer <api_key>`)
**`POST /functions/v1/intent-api/bid`** — API key required

Gated by `INTENT_API_ENABLED` Supabase secret. API keys stored as SHA-256 hashes in `api_keys` table. In-memory rate limiting (50 req/min; resets on cold start).

### Internal / Cron-Only Endpoints

| Function | Schedule | Purpose |
|----------|----------|---------|
| `ad-metrics-refresh` | */15 * * * * | Refresh campaign_metrics, daily_impression_stats, moment_type_aggregates |
| `ad-budget-pacer` | */5 * * * * | Pacing checks (does not pause; sets auction skip flag) |
| `ad-auto-bidder` | */30 * * * * | CPA-based bid adjustment |
| `ad-fraud-check` | 0 * * * * | Impression stuffing, anomalous CTR, budget drain, rapid click |
| `floor-price-optimizer` | 0 3 * * * | Daily floor price learning + adjustment |
| `forecast-supply` | 0 2 * * * | 7-day supply forecasts |

---

## 2. Database Schema

### Core Tables

#### `advertisers`
- `auth_user_id` UUID — links to Supabase Auth (unique per advertiser)
- `company_name`, `category` (sportsbook, streaming, qsr, beer, auto, financial, apparel)
- `billing_model` (cpm, cpti, cpwa, flat_rate)
- `balance_cents` INT — wallet balance
- `allowed_jurisdictions` TEXT[] — sportsbook geo-compliance; NULL = unrestricted
- `onboarding_complete` BOOLEAN

#### `campaigns`
- `advertiser_id` FK
- `budget_cents`, `spent_cents`, `daily_budget_cents`
- `flight_start`, `flight_end`
- `targeting_rules` JSONB — game IDs, segment targets, auto-bid params
- `status` — draft → pending_review → active → paused/completed/archived
- `approval_status` — pending → approved/rejected (admin workflow)
- `category_exclusivity` BOOLEAN — locks category for 5-min window
- `priority_tier` INT — > 0 = direct deal, bypasses auction at contracted rate
- `demand_type` TEXT — sportsbook / streaming / commerce

#### `creatives`
- `campaign_id` FK
- `format` — notification_sponsor, tune_in_card, insight_sponsor, recap_sponsor
- `sponsor_text`, `cta_text`, `cta_url`, `logo_url`
- `status` — pending → approved/rejected
- `performance_score` FLOAT — CTR-based Thompson Sampling score (max 1.1× bid multiplier)
- `editorial_separation_ack` BOOLEAN

#### `bids`
- `campaign_id` FK
- `moment_type` TEXT — qualifies for specific alert type
- `bid_cents` INT — max willingness to pay (1¢–500¢)
- `game_id` FK nullable — target specific game or all games
- `user_segment` TEXT nullable — wager_holder / team_follower / position_holder / null (all)
- `daily_impressions_cap`, `impressions_delivered`
- `floor_aware` BOOLEAN

#### `impressions`
- `bid_id`, `campaign_id`, `alert_id` FK chain
- `user_id` UUID — **hidden from advertisers via RLS**
- `user_segment`, `game_id`, `moment_type`, `moment_score`
- `clearing_price_cents` INT
- `delivered_at`, `seen_at`, `tapped_at`

#### `conversions`
- `impression_id` FK
- `conversion_type` — stream_open, sportsbook_open, wager_placed, cta_tap, app_return
- `attribution_window_ms` INT — typically 1,800,000 (30 min)
- `verification_source` — inferred (default) / partner_api

#### `floor_prices`
- `moment_type` UNIQUE
- `floor_cents`, `premium_multiplier`
- `sport` TEXT nullable — sport-specific override; NULL = global default
- `min_floor_cents` (5¢), `max_floor_cents` ($2.00)
- `learned_floor_cents` nullable — blended 60/40 with base floor

#### `api_keys`
- `key_hash` TEXT — SHA-256 of raw key
- `scopes` TEXT[] — inventory:read, bid:write
- `rate_limit_per_minute` INT (default 50)
- `is_active` BOOLEAN, `revoked_at`

### Supporting Tables

| Table | Purpose |
|-------|---------|
| `ad_fraud_events` | Fraud flag log per campaign |
| `floor_price_history` | Audit trail of floor changes |
| `learned_engagement_rates` | Observed CTR per moment type (confidence-weighted) |
| `learned_moment_rates` | Observed fire rate per moment type |
| `intent_moments` | One row per qualifying game moment — inventory unit, no user PII |
| `advertiser_transactions` | Wallet ledger (deposits, spend, refunds) |
| `supply_forecasts` | 7-day projections per sport × moment_type |

### Views & Materialized Views

| View | Refresh | Purpose |
|------|---------|---------|
| `advertiser_impressions` | Live | Strips user_id from impressions |
| `campaign_metrics` | Every 15 min | Aggregate impressions/conversions/spend per campaign |
| `daily_impression_stats` | Every 15 min | Daily breakdown per campaign × moment_type |
| `moment_type_aggregates` | Every 15 min | 30-day rolling stats per moment type |
| `advertiser_reporting` | Live | Joined campaign_metrics + campaigns; computes seen_rate_pct, ctr_pct, effective_cpm |
| `floor_yield_stats` | Live | Per-category floor performance |

---

## 3. Auction Logic

**Location**: `supabase/functions/_shared/auction-engine.ts`

**Triggered by**: `send-push` edge function during alert delivery

### Auction Steps (in order)

1. **Fatigue check** — `0.5^(sponsored_ads_last_24h / 3)`; skip if score < 0.25
2. **Ad personalization preference** — skip if user has opted out
3. **Frequency caps** — max 5 sponsored/user/day; max 2 from same advertiser/user/day
4. **Floor price** — `floor_prices` lookup (sport-specific → global fallback); blend with learned_floor (60/40)
5. **Dynamic premium** — multipliers: 10+ live games ×1.3, prediction_resolved ×1.4, OT/close/late-period ×1.5, March Madness ×1.5, weekend ×1.2
6. **Eligible bids query** — status active, approved creatives, matching moment_type + game + segment, within flight, within budget, wallet > 0
7. **Geo-filter** — timezone → state mapping (conservative; unknown timezone = skip all restricted advertisers)
8. **Brand-safety filter** — streaming/commerce require `brand_safety_status = 'approved'`
9. **Direct deals** — `priority_tier > 0` bids bypass auction at contracted rate
10. **Floor filter** — remove bids below effective_floor
11. **Category exclusivity** — 5-min window lock after first sponsor from a category
12. **Budget pacing** — skip over-pacing bids
13. **Rank** — effective_value = bid_cents × game_match_bonus(1.2) × creative_score × segment_match_bonus(1.15)
14. **Winner** — highest effective_value
15. **Clearing price (Vickrey second-price)** — `max(ceil(2nd_value) + 1¢, effective_floor)`, capped at winner's bid
16. **Creative selection (Thompson Sampling)** — Beta(α=taps+1, β=delivered-taps+1); locks at highest CTR after ≥100 impressions per variant
17. **Record** — insert impression, call `record_auction_result()` RPC (atomic spend + wallet debit)

### CPA Auto-Bid Adjustment (`ad-auto-bidder`, every 30 min)

- `target_cpa` strategy: ±10% if observed CPA diverges from target
- `maximize_impressions` strategy: bid at floor

---

## 4. Authentication & Authorization

### Advertiser Portal (Current)

**Method**: Supabase Auth JWT (email/password or OAuth)

Flow: `Authorization: Bearer <JWT>` → `supabase.auth.getUser(token)` → RLS policies enforce advertiser-own-data access on all tables.

**Machine client access today**: None. The JWT flow requires a browser-based login session. No service-account or client-credentials grant exists for non-browser callers.

### Programmatic Intent API (Scaffolded)

**Method**: Static API keys (SHA-256 hashed in `api_keys` table)

Flow: `Authorization: Bearer <api_key>` → hash → lookup → scope check → rate limit (in-memory, 50 req/min). **Not in production.** Rate limiter resets on cold start — needs persistent backend before going live.

---

## 5. Reporting & Analytics

### Available Metrics

| Metric | Granularity | Source |
|--------|-------------|--------|
| Impressions (delivered, seen, tapped) | Campaign / day / moment_type / creative | `daily_impression_stats` |
| CTR (seen_rate, tap_rate) | Campaign | `advertiser_reporting` view |
| Conversions (by type) | Campaign | `conversions` table + `get_attribution_metrics()` |
| CPA | Campaign | Computed from spent_cents / conversions |
| Clearing price (avg) | Campaign | `campaign_metrics` |
| Unique users reached | Campaign | `campaign_metrics` |
| 7-day supply forecast | Sport × moment_type | `supply_forecasts` table |
| Win rate | Not currently exposed | Derivable from bid count vs impression count |

### Privacy Controls

- `get_campaign_daily_stats()` RPC enforces cohort ≥ 5 unique users; returns NULL otherwise
- `advertiser_impressions` view permanently strips `user_id` and `alert_id`
- No user-level data ever accessible to advertisers

---

## 6. Forecasting

**Location**: `supabase/functions/forecast-supply/index.ts` + `supply_forecasts` table

**Schedule**: Daily at 2 AM

**Algorithm**:
1. For each sport × moment_type × date in next 7 days
2. Count scheduled games from games table
3. Fetch historical moment fire rates from `intent_moments` (≥ 10 samples → observed rate + Wald 80% CI; < 10 samples → hardcoded fallback ±50%, low confidence)
4. `predicted_moments = game_count × moment_rate`
5. `predicted_eligible_users = predicted_moments × avg_users_per_game`
6. Upsert into `supply_forecasts`

**Exposure**: Readable via `supply_forecast` report type in `reporting-api`; also queryable directly by authenticated users.

---

## 7. Gaps Summary — What Agentic Buyers Need That Doesn't Exist Yet

| Capability | Current State | Gap |
|-----------|--------------|-----|
| Machine-client authentication (OAuth 2.0 client_credentials) | Not built; JWT requires browser login; API key flow scaffolded but not live | **Critical** — no stable way for an agent to authenticate without a user session |
| Campaign CRUD via API (create, read, update, delete) | `campaign-api` only handles lifecycle state transitions (activate/pause/archive); no create/update endpoints | **Critical** — agents can't create or modify campaigns programmatically |
| Bid management via API (create, update, delete bids) | No endpoint; bids must be set up through UI | **High** — agents can't set or adjust bids |
| Real-time inventory / floor price query | `supply_forecast` report exists but is day-old batch data; no real-time inventory endpoint | **High** — agents need current floor + available moments before placing a bid |
| Creative upload / management via API | No endpoint; creatives must be submitted through UI | **High** — agents need to supply ad copy programmatically |
| Webhook / postback for conversion events | No outbound webhook; conversions recorded internally only | **High** — agents can't close the attribution loop without a postback |
| Streaming reporting (real-time metrics) | Materialized views refresh every 15 min; no streaming endpoint | **Medium** — agents use polling; acceptable for now |
| OpenAPI machine-readable spec | No spec exists | **Medium** — required for MCP tool generation and SDK auto-generation |
| MCP server (tool definitions for agentic platforms) | Does not exist | **High** — blocks discovery by Claude, ChatGPT plugins, and major DSPs |
| `adagents.json` discovery file | Does not exist | **High** — blocks IAB Agent Registry listing and AdCP-compatible buyers |
| NLP brief → campaign translation | Does not exist | **Low (Phase 4)** — valuable but not blocking |
| Rate-limit persistence for API keys | In-memory only (resets on cold start) | **Medium** — must be Postgres-backed before production API key launch |

---

## File Locations Reference

| Component | Path |
|-----------|------|
| Auction engine | `supabase/functions/_shared/auction-engine.ts` |
| Pricing engine | `supabase/functions/_shared/pricing-engine.ts` |
| AI / Thompson Sampling | `supabase/functions/_shared/ai-ad-engine.ts` |
| Fatigue model | `supabase/functions/_shared/fatigue-model.ts` |
| Geo-compliance | `supabase/functions/_shared/geo-compliance.ts` |
| Campaign API | `supabase/functions/campaign-api/index.ts` |
| Reporting API | `supabase/functions/reporting-api/index.ts` |
| Intent API (scaffolded) | `supabase/functions/intent-api/index.ts` |
| Auto-bidder | `supabase/functions/ad-auto-bidder/index.ts` |
| Budget pacer | `supabase/functions/ad-budget-pacer/index.ts` |
| Fraud check | `supabase/functions/ad-fraud-check/index.ts` |
| Metrics refresh | `supabase/functions/ad-metrics-refresh/index.ts` |
| Floor optimizer | `supabase/functions/floor-price-optimizer/index.ts` |
| Supply forecast | `supabase/functions/forecast-supply/index.ts` |
| Core migrations | `supabase/migrations/019_advertising_tables.sql` through `080_*.sql` |
