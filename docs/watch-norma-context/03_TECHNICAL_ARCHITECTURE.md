# 03 — Technical Architecture

## Repository Overview

```
Watch-NORMA/
├── app/                              # Expo Router screens
│   ├── (auth)/                       # Auth flows (welcome, sign-in, sign-up)
│   ├── (tabs)/                       # Authenticated tab navigator
│   │   ├── games/                    # Game list + game detail
│   │   ├── alerts/                   # Alert feed
│   │   ├── connections/              # Streaming, sportsbooks, prediction markets
│   │   └── profile/                  # User settings + account
│   └── index.tsx                     # Root redirect
├── components/                       # Reusable React Native components
├── hooks/                            # React Query data-fetching hooks
├── lib/                              # Types, constants, utilities, deep-links
│   └── __tests__/                    # Client-side unit tests
├── __tests__/                        # Component/screen tests
├── assets/                           # App icons, splash, logos
├── scripts/                          # Utility scripts (Twitter OAuth, etc.)
├── supabase/
│   ├── config.toml                   # Local Supabase config
│   ├── seed.sql                      # Seed data
│   ├── migrations/                   # 68 Postgres migrations (001–066 + 4 timestamped)
│   ├── functions/                    # Deno Edge Functions (38 functions)
│   │   └── _shared/                  # Shared backend utilities
│   └── assets/                       # Media asset upload script
├── web/                              # Next.js advertiser portal + landing page
│   ├── src/app/                      # App Router pages
│   │   └── api/waitlist/route.ts     # POST endpoint for landing page email capture
│   ├── src/components/               # Portal UI components
│   │   └── waitlist-form.tsx         # Landing page email signup form
│   ├── src/lib/                      # Supabase clients, utils, types
│   └── public/                       # Static assets
├── docs/                             # Privacy policy, terms, this context folder
├── .github/workflows/ci.yml          # CI/CD pipeline
├── CLAUDE.md                         # Project instructions for AI agents
├── ADVERTISING-ENGINE.md             # Ad engine specification
├── OUTAGE-REPORT-2026-05-16.md       # ESPN status field outage postmortem
├── app.json                          # Expo config
├── eas.json                          # EAS Build config
├── package.json                      # Node dependencies
├── tsconfig.json                     # TypeScript config
├── jest.config.js                    # Jest config
├── babel.config.js                   # Babel config
└── metro.config.js                   # Metro bundler config
```

## Actual Tech Stack

All items verified from repository files.

**Mobile App:**
- React Native 0.81.5 + Expo 54 + Expo Router 6 (file-based routing)
- TypeScript 5.9.2 (strict mode)
- React 19.1.0
- State management: TanStack React Query v5 + React Context
- Styling: React Native StyleSheet with inline color constants (dark slate + orange accent theme)
- Auth: Supabase Auth (email/password + Apple Sign-In via `expo-apple-authentication`)
- Notifications: `expo-notifications` + Expo Push API
- Animations: `react-native-reanimated` 4.1.1
- Secure storage: `expo-secure-store`
- Icons: `@expo/vector-icons` (Ionicons)

**Backend:**
- Supabase (hosted PostgreSQL 15 + Deno Edge Functions + Auth + Realtime)
- Edge Functions written in Deno/TypeScript
- pg_cron for scheduled jobs
- Row-Level Security (RLS) on all user-facing tables

**Advertiser Portal:**
- Next.js 15 + React 19 + TypeScript
- Tailwind CSS 4
- Recharts for data visualization
- Supabase SSR client for auth and data
- Deployed separately (presumably Vercel — `web/.next` build artifacts present)

**External Data Sources:**
- ESPN API (free, primary scores source — multiple sport endpoints)
- SportsDataIO API (schedules, fallback scores, basketball PBP)
- Sportradar v8 API (primary PBP + summaries for all sports, rate-budgeted)
- The Odds API (sportsbook odds: DraftKings, FanDuel, BetMGM, ESPNBet)
- Kalshi API (prediction market positions, settlement — RSA-PSS authenticated)
- Polymarket CLOB API (on-chain positions via wallet address)
- Anthropic Claude API (bet slip vision parsing, email wager parsing, social content generation)

**Push Notifications:** Expo Push API (exp.host)

**Billing:** Stripe (Checkout Sessions + Webhooks for advertiser wallet deposits)

**Social Publishing:** X/Twitter v2 API with OAuth 1.0a (media upload via v1.1), Instagram Graph API, Facebook Graph API — TikTok and Reddit partially scaffolded.

**CI/CD:** GitHub Actions (Node 20, Deno v2.x, Supabase CLI, EAS OTA updates on main push)

**Testing:** Jest + jest-expo (client), Deno test (Edge Functions)

## Frontend Architecture

**App entry point:** `app/_layout.tsx` is the root layout. It wraps the app in ErrorBoundary, QueryClientProvider (React Query), TapToStreamProvider (global streaming animation context), and AuthGate (redirects unauthenticated users to welcome screen). It also registers for push notifications and handles `gameId` deep links from push payloads.

**Routing:** Expo Router 6 (file-based). Routes map to filesystem under `app/`. Auth routes under `(auth)/`, authenticated routes under `(tabs)/`. Deep link scheme: `norma://`.

**Major screens:** Games list (date + sport filter, live/following tabs), Game detail (scores, odds, wagers, positions, watch button), Alerts feed (real-time insertion), Connections hub (4 categories), Profile (settings, preferences, account management).

**Key components:** `GameCard` (game list item), `AlertCard` (rich alert with explanation, sponsor, actions), `ScoreHeader` (large scoreboard), `WatchNowButton` (tap-to-stream with animation), `OddsDisplay` (multi-sportsbook odds), `WagerCard` (single wager), `PositionCard` (prediction market position), `AddWagerSheet` (manual entry form with parlay support), `KalshiWizard` / `PolymarketWizard` (connection flows), `PreferencesSheet` (settings modal), `TransitionOverlay` + `NormaLine` (tap-to-stream animation), `BetNowButton` (sportsbook deep link CTA).

**State management:** React Query manages all server state (games, alerts, wagers, odds, connections, preferences, positions). Query keys are well-structured. Real-time updates via Supabase Realtime subscriptions that invalidate/update query cache. Local UI state via React useState/Context. TapToStreamContext provides global animation state for the watch flow.

**API client:** Supabase JS client (`lib/supabase.ts`) initialized with `expo-secure-store` adapter for token persistence. All data fetching goes through Supabase's auto-generated REST API (PostgREST) with RLS enforcement, or direct Edge Function invocations.

**Real-time subscriptions:** Games table (UPDATE — score/status changes), Alerts table (INSERT — new alerts arrive instantly), Game odds table (UPDATE — spread/line changes). Subscriptions are per-screen and unsubscribe on unmount.

## Backend Architecture

**Edge Functions (Deno).** There are 20+ Edge Functions. They fall into categories:

*Data Ingestion (cron-driven):*
- `poll-schedule` (30 min) — discovers today's games from ESPN + SportsDataIO + Sportradar
- `poll-schedule-lookahead` (daily 8 AM UTC) — pre-populates upcoming days
- `poll-boxscore` (1 min) — live scores from ESPN (primary) + SportsDataIO (fallback)
- `poll-odds` (5 min) — sportsbook odds from The Odds API
- `poll-markets` (5 min) — Kalshi + Polymarket position sync

*Orchestration (cron-driven):*
- `game-watcher-orchestrator` (1 min) — durable polling coordinator using `watcher_state` table. Creates watcher rows for active games, dispatches PBP/summary/alert evaluation based on next_poll_at, handles backoff on errors, enforces Sportradar rate budget, deactivates watchers for closed games.

*Live Data (orchestrator-dispatched):*
- `poll-pbp` — play-by-play from Sportradar (primary) + SportsDataIO (fallback)
- `poll-summary` — game summaries from Sportradar (primary) + SportsDataIO (fallback)

*Alert Pipeline (orchestrator-dispatched):*
- `evaluate-alerts` — 4-stage pipeline: candidate generation → signal extraction → scoring + must-notify → throttle/dedup → auction → delivery

*Notification:*
- `send-push` — delivers via Expo Push API, logs to delivery_log, includes sponsor text
- `morning-briefing` (daily 11 PM UTC / 6 PM CT) — sends "Tonight's Games" push notification to all active users with a summary of games starting that evening

*Wager Processing:*
- `parse-bet-slip` — Claude Vision OCR of bet slip images
- `ingest-email-wagers` — Gmail Pub/Sub webhook → email parsing → wager creation
- `resolve-wagers` — auto-resolves wagers when games close (spread/ML/O-U logic)
- `backfill-targets` — backfills parsed_target on existing wagers

*Prediction Markets:*
- `kalshi-proxy` — authenticated proxy for Kalshi read-only API calls
- `resolve-predictions` — settles positions when games close

*Advertising:*
- `campaign-api` — CRUD for campaigns (state machine: draft → active → completed)
- `reporting-api` — aggregate metrics (never user-level)
- `ad-auto-bidder` (30 min) — adjusts bids based on CPA performance
- `ad-budget-pacer` (5 min) — pauses over-pacing campaigns
- `ad-fraud-check` (hourly) — detects impression stuffing, anomalous CTR, budget drain
- `ad-metrics-refresh` (15 min) — refreshes materialized views
- `floor-price-optimizer` (daily 3 AM ET) — adjusts floor prices based on auction data
- `forecast-supply` (daily 2 AM) — 7-day supply forecast
- `stripe-checkout` — creates Stripe Checkout sessions
- `stripe-webhook` — handles Stripe webhook (credits advertiser balance)

*Social Content:*
- `cmo-generate` (6 hours) — Claude-generated brand tweets
- `cmo-publish` (30 min) — publishes to X with OAuth 1.0a
- `generate-social-content` (daily 6 AM UTC) — multi-platform content
- `publish-social-posts` (hourly) — routes posts to platform publishers
- `generate-recap-content` (daily 11 PM UTC) — post-game recap posts
- `fetch-social-metrics` (daily 9 PM UTC) — pulls engagement from platform APIs

*Monitoring:*
- `health-check` — system health dashboard (watcher state, alert pipeline stats, rate budget)
- `deep-link-health-check` — detects provider deep-link failures
- `renew-gmail-watch` — weekly Gmail Pub/Sub subscription renewal

*Account:*
- `delete-account` — GDPR/App Store compliant full account deletion
- `get-referral-code` — returns/creates the user's referral code for the invite-friends deep-link flow (migration 066)

**Database.** PostgreSQL 15 via Supabase. 68 migration files (001–066 plus four timestamped migrations; prefixes 031 and 032 were never used) covering core schema, provider seeding, odds, advertising, social, email ingestion, deep-link observability, MLB stats, geo-compliance, waitlist, campaign approval, and referrals. Key tables described in `04_DATA_AND_INTEGRATIONS.md`.

> Numbering note: several migrations were renumbered to resolve duplicate prefixes during implementation, so a few files' internal `-- Migration NNN` comments lag their actual filename (e.g., `063_social_cron_schedule.sql` still reads "Migration 060" in its header). The filenames below are authoritative.

Recent migrations (058–066):
- `058_geo_compliance.sql` — adds `profiles.timezone`, `advertisers.allowed_jurisdictions`, and seeds `sportsbook_restrictions` table with legal states for DraftKings, FanDuel, BetMGM, Caesars, and PointsBet
- `059_waitlist.sql` — `waitlist_emails` table for landing page email capture
- `060_games_status_constraint.sql` — CHECK constraint on `games.status` to prevent invalid ESPN status values (renumbered from duplicate 057)
- `061_gmail_watch_state.sql` — idempotent ensure of `gmail_watch_state` table used by the Gmail Pub/Sub renewal flow (originally created in 035)
- `062_watcher_state_sport.sql` — adds `sport` column to `watcher_state` for multi-sport orchestrator routing
- `063_social_cron_schedule.sql` — pins `generate-social-content` (every 6h) and `publish-social-posts` (hourly) pg_cron entries
- `064_morning_briefing_cron.sql` — schedules `morning-briefing` Edge Function at 11 PM UTC (6 PM CT) daily
- `065_campaign_approval.sql` — adds `approval_status`, `approval_note`, `reviewed_at`, `reviewed_by` to `campaigns` (admin approval gate before auction eligibility)
- `066_referrals.sql` — `referrals` table (referrer/referred/code) for the invite-friends deep-link flow
- `092_prizepicks_underdog_dfs_pickem.sql` — PrizePicks / Underdog in `streaming_providers` (`category=dfs_pickem`, `provider_type=sportsbook`)
- `20260904183000_dfs_fantasy_integration_fixes.sql` — `follows.fantasy_source`, unique `(user_id, entity_type, entity_id)`, season-long fantasy providers, pick'em `sportsbook_restrictions`

**Shared utilities** (`supabase/functions/_shared/`): `alert-scoring.ts` (signal extraction, scoring, "Why Now" generation), `auction-engine.ts` (Vickrey auction), `ai-ad-engine.ts` (Thompson Sampling creative selection), `pricing-engine.ts` (floor prices, dynamic premiums), `fatigue-model.ts` (ad fatigue), `outcome-proximity.ts` (wager proximity scoring), `sportradar.ts` (multi-sport API client with rate budgeting), `team-matching.ts` (fuzzy team name matching with alias map), `polling-state.ts` (game status state machine), `utils.ts` (hash, status mapping), `kalshi-crypto.ts` (RSA-PSS signing), `sportsbook-links.ts` (deep link URLs), `bet-ingestor.ts` (partner API interface), `email-parser.ts`, `social-content-engine.ts`, `social-publishers.ts`, `x-oauth.ts`, `daily-cadence.ts`, `template-vars.ts`, `cors.ts`.

## Data Flow

```
External APIs (ESPN, SportsDataIO, Sportradar, Odds API, Kalshi, Polymarket)
    │
    ▼
Data Ingestion Edge Functions (poll-schedule, poll-boxscore, poll-odds, poll-markets)
    │
    ▼
PostgreSQL (games, teams, game_snapshots, game_odds, prediction_positions)
    │
    ▼
Game Watcher Orchestrator (dispatches per-game: poll-pbp, poll-summary)
    │
    ▼
Enriched Game State (game_events, game_summary_cache, game_state_cache, mlb_game_stats)
    │
    ▼
Alert Engine (evaluate-alerts: candidates → signals → scoring → throttle → auction → deliver)
    │
    ▼
Alerts Table + Delivery Log + Push Notification (Expo Push API)
    │
    ▼
Mobile Client (Supabase Realtime subscription → React Query cache update → AlertCard render)
    │
    ▼
User Action (tap "Watch on [Provider]" → deep-link fallback chain → streaming app)
```

All steps above are **implemented and running in production** except:
- Sportsbook partner API ingestion (planned, depends on partnerships)
- Watch history feedback loop (not possible — no streaming API offers this)

## Environment Variables

**Mobile app (bundled at build time):**

| Variable | Purpose | Required |
|----------|---------|----------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key | Yes |
| `EXPO_PUBLIC_SPORTSDATAIO_API_KEY` | SportsDataIO API key | Yes |

**Edge Functions (Supabase secrets):**

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Auto-provided by Supabase runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-provided; used for admin DB writes |
| `SPORTSDATAIO_API_KEY` | SportsDataIO schedule/scores |
| `SPORTRADAR_API_KEY` | Sportradar PBP/summary (primary) |
| `SPORTRADAR_NBA_API_KEY` | Sportradar NBA-specific key (optional, falls back to `SPORTRADAR_API_KEY`) |
| `SPORTRADAR_MLB_API_KEY` | Sportradar MLB-specific key (optional) |
| `ODDS_API_KEY` | The Odds API for sportsbook odds |
| `ANTHROPIC_API_KEY` | Claude API for bet slip parsing, email parsing, social content |
| `EXPO_ACCESS_TOKEN` | Expo Push API for notifications |
| `STRIPE_SECRET_KEY` | Stripe for advertiser billing |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Gmail API service account for email wager ingestion |
| `GMAIL_PUBSUB_TOKEN` | Verification token for Gmail Pub/Sub push |
| `X_API_KEY` | Twitter/X API key |
| `X_API_SECRET` | Twitter/X API secret |
| `X_ACCESS_TOKEN` | Twitter/X OAuth access token |
| `X_ACCESS_SECRET` | Twitter/X OAuth access secret |
| `SLACK_WEBHOOK_URL` | Slack notifications for CMO approvals/failures |
| `INSTAGRAM_ACCESS_TOKEN` | Instagram Graph API (social publishing) |
| `INSTAGRAM_ACCOUNT_ID` | Instagram account ID |
| `FACEBOOK_ACCESS_TOKEN` | Facebook Graph API |
| `FACEBOOK_PAGE_ID` | Facebook page ID |

**CI/CD:**

| Variable | Purpose |
|----------|---------|
| `EXPO_TOKEN` | EAS OTA update publishing (GitHub Actions secret) |

**Production warnings:** Never commit actual secret values. All Edge Function secrets are set via `supabase secrets set`. The `.env.example` file contains only the three mobile-side variables. The `.gitignore` excludes `.env` files.

## API Surface

**Client-facing (via Supabase PostgREST + RLS):**

All client queries go through the Supabase JS client which auto-generates REST calls. RLS policies ensure users can only access their own data. Key tables exposed to the client: `games` (read), `teams` (read), `alerts` (read own), `wagers` (CRUD own), `follows` (CRUD own), `connections` (CRUD own), `user_preferences` (CRUD own), `game_odds` (read), `prediction_positions` (read own), `profiles` (read/update own), `streaming_providers` / `provider_registry` (read).

**Edge Function endpoints (invoked by client or cron):**

| Function | Method | Auth | Purpose |
|----------|--------|------|---------|
| `kalshi-proxy` | POST | JWT | Connect Kalshi, proxy read-only queries |
| `parse-bet-slip` | POST | JWT | OCR bet slip image via Claude |
| `delete-account` | POST | JWT | Permanent account deletion |
| `campaign-api` | POST | JWT (advertiser) | Campaign CRUD + state transitions |
| `reporting-api` | GET | JWT (advertiser) | Aggregate campaign metrics |
| `stripe-checkout` | POST | JWT (advertiser) | Create Stripe Checkout session |
| `stripe-webhook` | POST | Stripe signature | Handle payment completion |
| `health-check` | GET | Service key | System health dashboard |

**Cron-invoked (not client-facing):**

| Function | Schedule | Purpose |
|----------|----------|---------|
| `poll-schedule` | Every 30 min | Discover games |
| `poll-schedule-lookahead` | Daily 8 AM UTC | Pre-populate future days |
| `poll-boxscore` | Every 1 min | Live scores |
| `game-watcher-orchestrator` | Every 1 min | Dispatch PBP/summary/alerts |
| `poll-odds` | Every 5 min | Sportsbook odds |
| `poll-markets` | Every 5 min | Prediction market positions |
| `ad-auto-bidder` | Every 30 min | Adjust bids |
| `ad-budget-pacer` | Every 5 min | Pace campaign spend |
| `ad-fraud-check` | Hourly | Fraud detection |
| `ad-metrics-refresh` | Every 15 min | Refresh materialized views |
| `floor-price-optimizer` | Daily 3 AM ET | Optimize floor prices |
| `forecast-supply` | Daily 2 AM | Supply forecasting |
| `cmo-generate` | Every 6 hours | Generate social content |
| `cmo-publish` | Every 30 min | Publish to X |
| `generate-social-content` | Daily 6 AM UTC | Multi-platform content |
| `publish-social-posts` | Hourly | Route to platform publishers |
| `generate-recap-content` | Daily 11 PM UTC | Post-game recaps |
| `fetch-social-metrics` | Daily 9 PM UTC | Pull engagement data |
| `morning-briefing` | Daily 11 PM UTC | "Tonight's Games" push notification |
| `renew-gmail-watch` | Weekly | Renew Gmail Pub/Sub watch |
| `deep-link-health-check` | Periodic | Monitor provider links |

## Activation Analytics

**Migration:** `20260706000001_app_events.sql`

**`app_events` table** — first-party event stream for the activation funnel. Columns: `id`, `user_id` (FK auth.users), `event_name TEXT`, `properties JSONB`, `created_at TIMESTAMPTZ`. RLS: users insert own events; admin role reads all; service role bypasses RLS.

**`lib/analytics.ts`** — `trackEvent(name, props?)` helper for the mobile app. Fire-and-forget; fails silently; requires authenticated session.

**Tracked events (mobile):**
- `onboarding_welcome_viewed` — welcome screen mount (fails silently if unauthenticated)
- `signup_completed` — fired in `useAuth` SIGNED_IN handler via AsyncStorage flag set in sign-up.tsx
- `first_connection_added` — `useConnections.useToggleConnection` onSuccess (connect only, not disconnect)
- `first_team_followed` — `useFollows.useAddFollow` onSuccess
- `watch_tap` — `AlertCard.handleWatch` + `WatchNowButton.handlePress`; props include `source` and `provider`
- `alert_feedback` — `AlertCard.handleFeedback`; props include `rating` (up/down) and `alert_type`
- `bet_now_tap` — `SponsorCTAButton.handlePress`; props include `provider` and `alert_id`
- `share_moment` — added by Prompt 3
- `referral_share` — added by Prompt 2

**Tracked events (server-side, service role):**
- `first_alert_received` — `evaluate-alerts/index.ts` bulk-inserts after push dispatch, one row per user per invocation

**SQL views** (readable by service role and admin JWT):
- `daily_activation_funnel` — per signup cohort-day counts for each funnel step
- `retention_cohorts` — D1/D7/D30 retention by signup week (±tolerance window)

**Admin page:** `/admin/growth` — funnel table + retention cohort table, queries via `createSupabaseAdmin()` (service role).

## Background Jobs and Scheduling

All scheduled jobs use pg_cron (configured in migrations 004, 007, 013, 018, 022, 027, 029, 034, 035, 040, 044, 045, 046, 047, 056, 057, 063, 064, and the timestamped `20260307000001_cmo_agent.sql`). The `game-watcher-orchestrator` acts as a secondary scheduler, dispatching sub-functions (`poll-pbp`, `poll-summary`, `evaluate-alerts`, `resolve-predictions`) based on the `watcher_state` table rather than fixed cron schedules. This allows per-game polling intervals, backoff on errors, and concurrency limits.

Sport-specific polling intervals: NCAA basketball PBP every ~30 seconds, summary every ~120 seconds. MLB PBP every ~60 seconds, summary every ~90 seconds. These intervals are configured in the orchestrator and adapt based on game state and Sportradar rate budget.
