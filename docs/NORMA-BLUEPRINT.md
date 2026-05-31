# NORMA — Comprehensive Architecture & Services Blueprint

> **Purpose:** Single reference document for all services, integrations, credentials, accounts, and infrastructure used by Watch-NORMA. This file is the canonical source of truth for onboarding, debugging, and future development.
>
> **Last updated:** 2026-05-30

---

## 1. Product Summary

Watch-NORMA is a personalized sports-viewing intelligence app. It monitors live games, user wagers, prediction-market positions, and streaming availability, then sends push notifications at the exact moment a game becomes personally relevant. Revenue comes from a proprietary second-price Vickrey auction ad engine.

The app is live in the Apple App Store. The system comprises three deployable units: a React Native/Expo iOS app, a Supabase backend (Postgres + Deno Edge Functions), and a Next.js advertiser portal.

---

## 2. Accounts & Identifiers

### 2.1 Apple / App Store

| Field | Value |
|-------|-------|
| Apple ID (developer account) | `dtmaloney@gmail.com` |
| Apple Team ID | `RACZS57SUP` |
| App Store Connect App ID (ASC) | `6759508383` |
| Bundle Identifier | `com.norma.app` |
| Current App Version | `1.2.4` (build 22) |
| Deep Link Scheme | `norma://` |

### 2.2 Expo / EAS

| Field | Value |
|-------|-------|
| Expo Owner | `d10dave` |
| Expo Project ID | `3a418868-5bb5-4852-b565-3282ee4fe91e` |
| EAS Update URL | `https://u.expo.dev/3a418868-5bb5-4852-b565-3282ee4fe91e` |
| OTA Channel (production) | `production` |
| EAS CLI Version | `>= 12.0.0` |
| Node for prod builds | `22.14.0` |

**Credential:** `EXPO_TOKEN` — stored as GitHub Actions secret. Used for EAS OTA publishing.
**Credential:** `EXPO_ACCESS_TOKEN` — stored as Supabase secret. Used by `send-push` for Expo Push API.

### 2.3 Supabase

| Field | Value |
|-------|-------|
| Project URL | Set via `EXPO_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` (not committed) |
| Anon Key | Set via `EXPO_PUBLIC_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (not committed) |
| Service Role Key | Set via `SUPABASE_SERVICE_ROLE_KEY` (Supabase secret, auto-provided at runtime) |
| Database | PostgreSQL 15 (17 local dev) |
| Migrations | 57+ files in `supabase/migrations/` |
| Auth callback | `norma://auth-callback` |
| Local API port | 54321 |
| Local DB port | 54322 |
| Local Studio port | 54323 |

**Where to find these values:** Supabase Dashboard → Project Settings → API. The URL and anon key are public. The service role key is private and auto-injected into Edge Functions.

### 2.4 Meta / Facebook

| Field | Value |
|-------|-------|
| Meta App Name | NORMA Social Publisher |
| Meta App Console | `https://developers.facebook.com/apps/` (select "NORMA Social Publisher") |
| Graph API Explorer | `https://developers.facebook.com/tools/explorer` |
| Graph API Version | v18.0 (used in code) / v25.0 (latest in explorer) |

**Credentials (Supabase secrets):**

| Secret Name | Purpose | Where to Obtain |
|-------------|---------|-----------------|
| `META_FACEBOOK_PAGE_ACCESS_TOKEN` | Publishing posts + reading metrics on the NORMA Facebook page | Graph API Explorer → generate User Token with `pages_manage_posts`, `pages_read_engagement`, `pages_show_list` → exchange for long-lived token → call `/me/accounts` → copy the page-level `access_token`. See section 8 for step-by-step. |
| `META_FACEBOOK_PAGE_ID` | Facebook Page ID for NORMA | Same `/me/accounts` response → `id` field for the NORMA page |

**Also used by code (env var names in `social-publishers.ts` / `fetch-social-metrics.ts`):**

| Code Variable | Maps to Supabase Secret |
|---------------|------------------------|
| `META_FACEBOOK_PAGE_ACCESS_TOKEN` | `META_FACEBOOK_PAGE_ACCESS_TOKEN` |
| `META_FACEBOOK_PAGE_ID` | `META_FACEBOOK_PAGE_ID` |

**Permissions required:** `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`

**Token lifecycle:** Page access tokens derived from a long-lived user token do not expire as long as the user token remains valid. If the user changes their Facebook password or deauthorizes the app, the token will break.

### 2.5 Meta / Instagram

| Secret Name | Purpose | Where to Obtain |
|-------------|---------|-----------------|
| `META_INSTAGRAM_ACCESS_TOKEN` | Publishing posts + reading insights on the NORMA Instagram account | Meta Developer Console → Instagram Graph API. Requires a Facebook Page linked to the Instagram Professional Account. Same long-lived token flow as Facebook. |
| `META_INSTAGRAM_USER_ID` | Instagram account ID | `/me/accounts` → select page → `instagram_business_account.id` |

### 2.6 X / Twitter

| Secret Name | Purpose | Where to Obtain |
|-------------|---------|-----------------|
| `X_CONSUMER_KEY` | Twitter API key (OAuth 1.0a) | X Developer Portal → App → Keys and Tokens → API Key |
| `X_CONSUMER_SECRET` | Twitter API secret | X Developer Portal → App → Keys and Tokens → API Key Secret |
| `X_ACCESS_TOKEN` | OAuth 1.0a access token | X Developer Portal → App → Keys and Tokens → Access Token |
| `X_ACCESS_TOKEN_SECRET` | OAuth 1.0a access token secret | X Developer Portal → App → Keys and Tokens → Access Token Secret |

**Note:** The code consistently uses `X_CONSUMER_KEY` / `X_CONSUMER_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` (in `cmo-publish`, `fetch-social-metrics`, `social-publishers.ts`). The doc in `03_TECHNICAL_ARCHITECTURE.md` lists them as `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_SECRET` — the doc names are outdated. Use the code names when setting secrets.

**Token lifecycle:** OAuth 1.0a tokens are long-lived and do not expire unless revoked.

### 2.7 TikTok (Pending App Review)

**App:** "NORMA Social Publisher" — App ID: `7646062068575160341`
**Products:** Login Kit + Content Posting API (Direct Post enabled)
**Scopes:** `user.info.basic`, `video.publish`, `video.upload`
**Status as of 2026-05-31:** App form nearly complete (1 error remaining: demo video). Domain verified, all fields populated.

**Completed:**
- DNS TXT record added at name.com → `getnorma.app` domain verified in TikTok portal
- App icon uploaded (1024x1024 NORMA logo)
- Category: Sports
- Description filled
- ToS URL: `https://getnorma.app/terms-of-service` (verified domain)
- Privacy Policy URL: `https://getnorma.app/privacy-policy` (verified domain)
- Web/Desktop URL: `https://getnorma.app`
- Login Kit Redirect URI: `https://getnorma.app/auth/tiktok/callback`
- Content Posting API: Direct Post enabled
- App review usage description submitted
- Next.js rewrites added in `web/next.config.ts` to proxy legal pages from GitHub Pages

| Secret Name | Purpose | Status |
|-------------|---------|--------|
| `TIKTOK_CLIENT_KEY` | TikTok OAuth Client Key | **Set** 31 May 2026 |
| `TIKTOK_CLIENT_SECRET` | TikTok OAuth Client Secret | **Set** 31 May 2026 |
| `TIKTOK_ACCESS_TOKEN` | TikTok Content Publishing API | **Not yet configured** — requires OAuth flow after app approval |

**Remaining steps:**
1. Record and upload demo video showing sandbox TikTok integration flow (mp4/mov, ≤50MB)
2. Deploy `web/next.config.ts` rewrite changes to Vercel (git push)
3. Submit app for TikTok review
4. After approval: complete OAuth flow to obtain `TIKTOK_ACCESS_TOKEN`
5. Update `social-publishers.ts` to use Client Key/Secret OAuth flow instead of static access token

### 2.8 Reddit (Blocked — Awaiting Commercial Approval)

**Status as of 2026-05-31:** Reddit removed self-service app creation at `reddit.com/prefs/apps` in late 2024. The "Create App" button now displays a policy gate instead of issuing credentials. New API apps require pre-approval via Reddit Help Center ticket. NORMA is commercial use (ad-supported app), which Reddit requires a signed contract for — see "Commercial Use; Fees" section of [Developer Platform & Accessing Reddit Data](https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data).

**Actions taken:**
- Commercial access request ticket submitted 2026-05-31 via Reddit Help Center
- Posting guardrails added to `social-publishers.ts` (rate limit, dedup, self-promotion cap per Responsible Builder Policy)
- Code fully scaffolded — no further code work until credentials are issued

**Risk:** Reddit explicitly prohibits displaying Reddit content alongside advertisements. NORMA's ad engine may conflict with this policy. Evaluate terms carefully if/when commercial approval is granted.

| Secret Name | Purpose | Status |
|-------------|---------|--------|
| `REDDIT_CLIENT_ID` | Reddit API OAuth client ID | **Blocked** — requires Reddit commercial API approval |
| `REDDIT_CLIENT_SECRET` | Reddit API OAuth client secret | **Blocked** — requires Reddit commercial API approval |
| `REDDIT_USERNAME` | Reddit account username | **Blocked** — requires Reddit commercial API approval |
| `REDDIT_PASSWORD` | Reddit account password | **Blocked** — requires Reddit commercial API approval |

### 2.9 Sports Data Providers

| Secret Name | Purpose | Where to Obtain |
|-------------|---------|-----------------|
| `SPORTSDATAIO_API_KEY` | SportsDataIO — schedules, fallback scores, basketball PBP | SportsDataIO account dashboard |
| `EXPO_PUBLIC_SPORTSDATAIO_API_KEY` | Same key, bundled in mobile app (client-side schedule calls) | Same as above |
| `SPORTRADAR_API_KEY` | Sportradar v8 — primary PBP + summaries (all sports) | Sportradar developer portal |
| `SPORTRADAR_NBA_API_KEY` | Sportradar NBA-specific key (optional, falls back to primary) | Sportradar developer portal |
| `SPORTRADAR_MLB_API_KEY` | Sportradar MLB-specific key (optional) | Sportradar developer portal |
| `THE_ODDS_API_KEY` | The Odds API — sportsbook odds (DK, FD, BetMGM, ESPNBet) | `the-odds-api.com` account |

**ESPN:** Free public API, no key required. Endpoints are sport-specific scoreboard URLs.

### 2.10 Anthropic (Claude)

| Secret Name | Purpose | Where to Obtain |
|-------------|---------|-----------------|
| `ANTHROPIC_API_KEY` | Bet slip OCR (Claude Sonnet vision), email wager parsing, social content generation (Claude Opus) | Anthropic Console → API Keys |

### 2.11 Stripe (Advertiser Billing)

| Secret Name | Purpose | Where to Obtain |
|-------------|---------|-----------------|
| `STRIPE_SECRET_KEY` | Create Checkout Sessions, process payments | Stripe Dashboard → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Verify Stripe webhook signatures | Stripe Dashboard → Developers → Webhooks → Signing Secret |

**Stripe API version in code:** `2024-04-10`

### 2.12 Google / Gmail (Email Wager Ingestion)

| Secret Name | Purpose | Where to Obtain |
|-------------|---------|-----------------|
| `GMAIL_SERVICE_ACCOUNT_JSON` | Service account credentials (JSON) for Gmail API access | Google Cloud Console → IAM → Service Accounts → Create key (JSON) |
| `GMAIL_PUBSUB_TOKEN` | Bearer token for verifying Gmail Pub/Sub push notifications | Set manually; must match the token configured in Google Cloud Pub/Sub subscription |
| `GMAIL_PUBSUB_TOPIC` | Google Cloud Pub/Sub topic for Gmail push | Google Cloud Console → Pub/Sub → Topics |
| `GMAIL_WATCHED_ADDRESS` | Email address being watched (default: `bets@getnorma.app`) | Set via Supabase secret or defaults |

**Scopes:** `https://www.googleapis.com/auth/gmail.readonly`
**Watch renewal:** `renew-gmail-watch` Edge Function runs weekly to keep the Pub/Sub subscription active.

### 2.13 Slack

| Secret Name | Purpose | Where to Obtain |
|-------------|---------|-----------------|
| `SLACK_WEBHOOK_URL` | Incoming webhook for CMO approval notifications and failure alerts | Slack → Apps → Incoming Webhooks → Add webhook to channel |

### 2.14 Vercel (Advertiser Portal)

The Next.js advertiser portal (`web/`) is presumably deployed on Vercel. Environment variables needed:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only, for admin operations) |

### 2.15 GitHub

| Secret Name | Purpose |
|-------------|---------|
| `EXPO_TOKEN` | GitHub Actions secret for EAS OTA update publishing |

CI/CD: `.github/workflows/ci.yml` runs on push to main and PRs. Node 20, Deno v2.x, Supabase CLI.

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        iOS APP (Expo)                           │
│  React Native 0.81 · Expo 54 · Expo Router 6 · TypeScript 5.9  │
│  TanStack React Query v5 · Supabase Realtime · expo-secure-store│
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS / WSS
┌──────────────────────────┼──────────────────────────────────────┐
│                      SUPABASE                                    │
│                                                                  │
│  Edge Functions (Deno)      PostgreSQL 15       Supabase Auth    │
│  ├─ Data Ingestion          ├─ 57+ migrations   ├─ Email/Pass   │
│  ├─ Orchestrator            ├─ RLS everywhere    ├─ Apple SSO    │
│  ├─ Alert Pipeline          ├─ pg_cron jobs      └─ JWT sessions │
│  ├─ Ad Auction Engine       ├─ Realtime (WAL)                    │
│  ├─ Social Publishing       └─ watcher_state                     │
│  ├─ Wager Processing                                             │
│  ├─ Prediction Markets                                           │
│  └─ Billing (Stripe)                                             │
└──────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│                  ADVERTISER PORTAL                               │
│  Next.js 15 · React 19 · Tailwind CSS 4 · Recharts              │
│  Deployed on Vercel (presumed)                                   │
└──────────────────────────────────────────────────────────────────┘

External APIs:
  ESPN (free)  ·  SportsDataIO  ·  Sportradar v8  ·  The Odds API
  Kalshi  ·  Polymarket  ·  Anthropic Claude  ·  Stripe
  X/Twitter  ·  Instagram  ·  Facebook  ·  Gmail  ·  Expo Push
```

---

## 4. Edge Functions (All 30+)

### Data Ingestion (cron-driven)

| Function | Schedule | Source | Key Used |
|----------|----------|--------|----------|
| `poll-schedule` | 30 min | ESPN + SportsDataIO + Sportradar | `SPORTSDATAIO_API_KEY`, `SPORTRADAR_API_KEY` |
| `poll-schedule-lookahead` | Daily 8 AM UTC | ESPN + SportsDataIO | `SPORTSDATAIO_API_KEY` |
| `poll-boxscore` | 1 min | ESPN (primary) + SportsDataIO (fallback) | `SPORTSDATAIO_API_KEY` |
| `poll-odds` | 5 min | The Odds API | `THE_ODDS_API_KEY` |
| `poll-markets` | 5 min | Kalshi + Polymarket | (user credentials from `connections` table) |

### Orchestration

| Function | Schedule | Purpose |
|----------|----------|---------|
| `game-watcher-orchestrator` | 1 min | Durable polling coordinator. Manages `watcher_state` table, dispatches PBP/summary/alerts, handles backoff, enforces Sportradar rate budget. |

### Live Data (orchestrator-dispatched)

| Function | Dispatched By | Source | Key Used |
|----------|--------------|--------|----------|
| `poll-pbp` | Orchestrator | Sportradar (primary) + SportsDataIO (fallback) | `SPORTRADAR_API_KEY` (+ sport-specific keys) |
| `poll-summary` | Orchestrator | Sportradar (primary) + SportsDataIO (fallback) | `SPORTRADAR_API_KEY` (+ sport-specific keys) |

### Alert Pipeline

| Function | Dispatched By | Purpose |
|----------|--------------|---------|
| `evaluate-alerts` | Orchestrator | 4-stage pipeline: candidate generation → signal extraction → scoring + must-notify → throttle/dedup → auction → delivery |
| `send-push` | evaluate-alerts | Delivers via Expo Push API, logs to `delivery_log`, includes sponsor ad text | Uses `EXPO_ACCESS_TOKEN` |

### Wager Processing

| Function | Trigger | Key Used |
|----------|---------|----------|
| `parse-bet-slip` | Client (on-demand) | `ANTHROPIC_API_KEY` |
| `ingest-email-wagers` | Gmail Pub/Sub webhook | `GMAIL_SERVICE_ACCOUNT_JSON`, `ANTHROPIC_API_KEY` |
| `resolve-wagers` | Orchestrator (game close) | — |
| `backfill-targets` | Manual | — |

### Prediction Markets

| Function | Trigger | Purpose |
|----------|---------|---------|
| `kalshi-proxy` | Client (on-demand) | Authenticated proxy for Kalshi API (read-only) |
| `resolve-predictions` | Orchestrator (game close) | Settles positions using Kalshi public API or score inference |

### Advertising Engine

| Function | Schedule | Purpose |
|----------|----------|---------|
| `campaign-api` | On-demand (client) | Campaign CRUD, state machine |
| `reporting-api` | On-demand (client) | Aggregate campaign metrics |
| `ad-auto-bidder` | 30 min | Adjusts bids based on CPA performance |
| `ad-budget-pacer` | 5 min | Pauses over-pacing campaigns |
| `ad-fraud-check` | Hourly | Detects impression stuffing, anomalous CTR, budget drain |
| `ad-metrics-refresh` | 15 min | Refreshes materialized views |
| `floor-price-optimizer` | Daily 3 AM ET | Adjusts floor prices from auction data |
| `forecast-supply` | Daily 2 AM | 7-day supply forecast |
| `stripe-checkout` | On-demand (client) | Creates Stripe Checkout sessions | Uses `STRIPE_SECRET_KEY` |
| `stripe-webhook` | Stripe push | Credits advertiser balance on payment | Uses `STRIPE_WEBHOOK_SECRET` |

### Social Content Pipeline

| Function | Schedule | Keys Used |
|----------|----------|-----------|
| `cmo-generate` | 6 hours | `ANTHROPIC_API_KEY` |
| `cmo-publish` | 30 min | `X_CONSUMER_KEY`, `X_CONSUMER_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`, `SLACK_WEBHOOK_URL` |
| `generate-social-content` | Daily 6 AM UTC | `ANTHROPIC_API_KEY` |
| `publish-social-posts` | Hourly | All social platform credentials (X, Instagram, Facebook, TikTok, Reddit) |
| `generate-recap-content` | Daily 11 PM UTC | `ANTHROPIC_API_KEY` |
| `fetch-social-metrics` | Daily 9 PM UTC | X + Instagram + Facebook credentials |

### Monitoring & Maintenance

| Function | Schedule | Purpose |
|----------|----------|---------|
| `health-check` | On-demand | System health dashboard |
| `deep-link-health-check` | Periodic | Monitors provider deep-link failures |
| `renew-gmail-watch` | Weekly | Renews Gmail Pub/Sub subscription | Uses `GMAIL_SERVICE_ACCOUNT_JSON`, `GMAIL_PUBSUB_TOPIC` |
| `delete-account` | On-demand (client) | GDPR/App Store compliant full account deletion |

---

## 5. Database Schema (Key Tables)

| Table | Purpose |
|-------|---------|
| `profiles` | User profile (display name, email, push token, timezone, ad personalization) |
| `user_preferences` | Favorite teams, notification settings (quiet hours, caps), bet forwarding email |
| `games` | All games (NCAA, NBA, MLB) with scores, status, broadcast info |
| `teams` | Team metadata |
| `game_snapshots` | Historical score snapshots (hash-deduped) |
| `game_events` | Play-by-play events from Sportradar/SportsDataIO |
| `game_summary_cache` | Cached Sportradar summaries |
| `game_state_cache` | Cached game state for alert engine |
| `mlb_game_stats` | MLB-specific stats (pitcher, batter, no-hitter tracking) |
| `game_odds` | Sportsbook odds (spreads, totals, moneyline) |
| `follows` | User follows (teams, games, players, leagues via entity_type/entity_id) |
| `connections` | Connected providers (streaming, TV, sportsbook, prediction market) with metadata |
| `provider_registry` | Provider metadata (deep link schemes, URLs, categories) |
| `wagers` | User wagers (manual, bet_slip_scan, email_parse) with parlay legs |
| `prediction_positions` | Kalshi/Polymarket positions with settlement status |
| `alerts` | Generated alerts with score, explanation, sponsor fields |
| `delivery_log` | Push delivery attempts |
| `alert_throttle` | Dedup hashes for throttling |
| `watcher_state` | Per-game orchestrator state (poll times, error counts, concurrency slots) |
| `api_rate_log` | Sportradar API rate tracking |
| `deep_link_events` | Deep link success/failure logging |
| `impressions` | Ad impressions with clearing price, tap status |
| `conversions` | Post-impression actions |
| `ad_fraud_events` | Detected fraud signals |
| `advertiser_wallets` | Advertiser prepaid balances (Stripe-funded) |
| `social_posts` | Generated social content with approval status |
| `social_accounts` | Connected social media accounts |

---

## 6. Complete Credentials Inventory

This is the master list of every secret/credential the system uses. All are set via `supabase secrets set` unless noted otherwise.

### Auto-Provided by Supabase Runtime

| Variable | Notes |
|----------|-------|
| `SUPABASE_URL` | Injected automatically into Edge Functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Injected automatically; admin-level DB access |

### Must Be Set Manually (Supabase Secrets)

| # | Variable | Service | Status | How to Obtain |
|---|----------|---------|--------|---------------|
| 1 | `SPORTSDATAIO_API_KEY` | SportsDataIO | **Active** | SportsDataIO dashboard |
| 2 | `SPORTRADAR_API_KEY` | Sportradar | **Active** | Sportradar dev portal |
| 3 | `SPORTRADAR_NBA_API_KEY` | Sportradar (NBA) | **Optional** | Falls back to primary key |
| 4 | `SPORTRADAR_MLB_API_KEY` | Sportradar (MLB) | **Optional** | Falls back to primary key |
| 5 | `THE_ODDS_API_KEY` | The Odds API | **Active** | the-odds-api.com |
| 6 | `ANTHROPIC_API_KEY` | Anthropic Claude | **Active** | console.anthropic.com |
| 7 | `EXPO_ACCESS_TOKEN` | Expo Push API | **Active** | expo.dev account settings |
| 8 | `STRIPE_SECRET_KEY` | Stripe | **Active** | Stripe Dashboard → API Keys |
| 9 | `STRIPE_WEBHOOK_SECRET` | Stripe | **Active** | Stripe Dashboard → Webhooks |
| 10 | `GMAIL_SERVICE_ACCOUNT_JSON` | Google Gmail API | **Active** | GCP Console → Service Accounts |
| 11 | `GMAIL_PUBSUB_TOKEN` | Gmail Pub/Sub verification | **Active** | Self-defined, must match GCP subscription |
| 12 | `GMAIL_PUBSUB_TOPIC` | Gmail Pub/Sub topic | **Active** | GCP Console → Pub/Sub |
| 13 | `GMAIL_WATCHED_ADDRESS` | Watched email address | **Optional** | Defaults to `bets@getnorma.app` |
| 14 | `X_CONSUMER_KEY` | X/Twitter API key | **Active** | X Developer Portal |
| 15 | `X_CONSUMER_SECRET` | X/Twitter API secret | **Active** | X Developer Portal |
| 16 | `X_ACCESS_TOKEN` | X/Twitter access token | **Active** | X Developer Portal |
| 17 | `X_ACCESS_TOKEN_SECRET` | X/Twitter access secret | **Active** | X Developer Portal |
| 18 | `SLACK_WEBHOOK_URL` | Slack notifications | **Active** | Slack → Incoming Webhooks |
| 19 | `META_INSTAGRAM_ACCESS_TOKEN` | Instagram Graph API | **Active** (set 2026-05-31) | Same long-lived page token as Facebook; see section 8 for renewal |
| 20 | `META_INSTAGRAM_USER_ID` | Instagram account ID | **Active** (set 2026-03-11) | `17841448021436725` |
| 21 | `META_FACEBOOK_PAGE_ACCESS_TOKEN` | Facebook Graph API | **Active** (set 2026-05-30) | See section 8 for renewal procedure |
| 22 | `META_FACEBOOK_PAGE_ID` | Facebook page ID | **Active** (set 2026-05-30) | `998544726679490` |
| 23 | `TIKTOK_CLIENT_KEY` | TikTok OAuth Client Key | **Set** 31 May 2026 | App in Draft, pending review |
| 24 | `TIKTOK_CLIENT_SECRET` | TikTok OAuth Client Secret | **Set** 31 May 2026 | App in Draft, pending review |
| 25 | `TIKTOK_ACCESS_TOKEN` | TikTok Publishing API | **Not configured** | Requires OAuth flow post-approval |
| 24 | `REDDIT_CLIENT_ID` | Reddit API | **Not configured** | Scaffolded only |
| 25 | `REDDIT_CLIENT_SECRET` | Reddit API | **Not configured** | Scaffolded only |
| 26 | `REDDIT_USERNAME` | Reddit account | **Not configured** | Scaffolded only |
| 27 | `REDDIT_PASSWORD` | Reddit account | **Not configured** | Scaffolded only |
| 28 | `NORMA_APP_URL` | App URL for Reddit posts | **Optional** | Defaults to `https://norma-app.com` |
| 29 | `PUBSUB_VERIFICATION_TOKEN` | Gmail Pub/Sub push verification (used in `ingest-email-wagers`) | **Active** | Self-defined, must match GCP Pub/Sub push subscription config |
| 30 | `PORTAL_URL` | Advertiser portal URL (for Stripe Checkout success/cancel redirects) | **Active** | The URL where the Next.js advertiser portal is deployed |
| 31 | `SUPABASE_ANON_KEY` | Supabase anon key (used in `delete-account` for user-context client) | Auto-provided | Supabase runtime |

### Mobile App (Bundled at Build Time via .env)

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key |
| `EXPO_PUBLIC_SPORTSDATAIO_API_KEY` | SportsDataIO API key (client-side schedule calls) |

### Advertiser Portal (Vercel Environment Variables)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side) |

### GitHub Actions Secrets

| Variable | Purpose |
|----------|---------|
| `EXPO_TOKEN` | EAS OTA update publishing in CI |

---

## 7. Token Expiration & Renewal

| Token / Credential | Expiration | Renewal Method |
|--------------------|------------|----------------|
| Supabase user JWTs | 1 hour | Auto-refreshed by Supabase client |
| Expo Push tokens | Device-specific, may rotate | Re-registered on app launch |
| Kalshi API keys | Set by user in Kalshi dashboard | User must re-connect if revoked |
| Gmail Pub/Sub watch | 7 days | `renew-gmail-watch` cron (weekly) |
| Stripe webhook signing secret | Does not expire | Rotate in Stripe dashboard if compromised |
| X/Twitter OAuth 1.0a tokens | Long-lived, do not expire | Rotate if compromised via X Developer Portal |
| Meta (Facebook/Instagram) page tokens | Do not expire (if derived from long-lived user token) | Breaks if user changes FB password or deauthorizes the app. Regenerate via Graph API Explorer flow. |
| Sportradar API keys | Per contract | Sportradar developer portal |
| SportsDataIO API key | Per subscription | SportsDataIO dashboard |
| The Odds API key | Per subscription | the-odds-api.com |
| Anthropic API key | Does not expire | Rotate via console.anthropic.com |

---

## 8. Facebook Page Token Setup (Step-by-Step)

This is the procedure to generate or renew `META_FACEBOOK_PAGE_ACCESS_TOKEN` and `META_FACEBOOK_PAGE_ID`.

### Prerequisites
- You must be an admin of the "NORMA Social Publisher" Meta app
- You must be an admin of the Facebook Page you want to publish to
- The Facebook Page must be linked to your Meta app

### Steps

1. **Go to Graph API Explorer:** `https://developers.facebook.com/tools/explorer`
2. **Select your Meta App:** Choose "NORMA Social Publisher" from the Meta App dropdown
3. **Set User or Page:** Select "User Token"
4. **Add permissions:** Check: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`
5. **Click "Generate Access Token"** — this creates a short-lived user token (~1 hour)
6. **Copy the short-lived token** from the Access Token field
7. **Exchange for long-lived token:** Open this URL in your browser (replace `{APP_ID}`, `{APP_SECRET}`, `{SHORT_TOKEN}`):
   ```
   https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id={APP_ID}&client_secret={APP_SECRET}&fb_exchange_token={SHORT_TOKEN}
   ```
   - `APP_ID` and `APP_SECRET` are found at: Meta Developer Console → NORMA Social Publisher → Settings → Basic
8. **Copy the long-lived token** from the JSON response (`access_token` field)
9. **Get your Page token:** Open this URL (replace `{LONG_TOKEN}`):
   ```
   https://graph.facebook.com/me/accounts?access_token={LONG_TOKEN}
   ```
10. **Find your NORMA Page** in the response. Copy:
    - `access_token` → this is your non-expiring page token
    - `id` → this is your page ID
11. **Set the Supabase secrets:**
    ```bash
    supabase secrets set META_FACEBOOK_PAGE_ACCESS_TOKEN="<page-access-token>"
    supabase secrets set META_FACEBOOK_PAGE_ID="<page-id>"
    ```

### Instagram Setup (Same Flow)

Instagram publishing uses the Facebook Graph API. After step 9 above:
1. For the page linked to your Instagram Professional Account, call:
   ```
   https://graph.facebook.com/v18.0/{PAGE_ID}?fields=instagram_business_account&access_token={PAGE_TOKEN}
   ```
2. Copy the `instagram_business_account.id`
3. Set:
   ```bash
   supabase secrets set META_INSTAGRAM_ACCESS_TOKEN="<same-page-access-token>"
   supabase secrets set META_INSTAGRAM_USER_ID="<instagram-business-account-id>"
   ```

---

## 9. Key File Locations

| Category | Path |
|----------|------|
| Project root | `~/Watch-NORMA/` |
| Expo app config | `app.json` |
| EAS build config | `eas.json` |
| Env example | `.env.example` |
| Database migrations | `supabase/migrations/` |
| Edge Functions | `supabase/functions/` |
| Shared backend utils | `supabase/functions/_shared/` |
| Mobile screens | `app/(tabs)/` |
| React Native components | `components/` |
| Data hooks | `hooks/` |
| Types, utils, constants | `lib/` |
| Client tests | `lib/__tests__/`, `__tests__/`, `hooks/__tests__/` |
| Edge Function tests | `supabase/functions/**/*_test.ts` |
| Advertiser portal | `web/` |
| Project context docs | `docs/watch-norma-context/` |
| Ad engine spec | `ADVERTISING-ENGINE.md` |
| Growth/social agent | `hermes/norma-hermes.md` |
| Social content drafts | `hermes/content/drafts/` |
| Lead list | `hermes/leads/advertiser-leads.csv` |
| Email templates | `hermes/emails/` |
| CI/CD | `.github/workflows/ci.yml` |
| Privacy policy | `docs/privacy-policy.html` |
| Terms of service | `docs/terms-of-service.html` |

---

## 10. Sports Supported

| Sport | Schedule Source | Score Source | PBP Source | Summary Source | Odds |
|-------|---------------|-------------|------------|----------------|------|
| NCAA Basketball (NCAAM) | SportsDataIO + Sportradar | ESPN (primary) + SportsDataIO (fallback) | Sportradar (primary) + SportsDataIO (fallback) | Sportradar (primary) + SportsDataIO (fallback) | The Odds API |
| NBA | ESPN + SportsDataIO + Sportradar | ESPN (primary) + SportsDataIO (fallback) | Sportradar | Sportradar | The Odds API |
| MLB | ESPN + Sportradar | ESPN (primary) | Sportradar | Sportradar | The Odds API |

---

## 11. Critical Operational Rules

1. **ESPN status field:** Always use `status.type.description`, never `status.type.name`. The May 2026 outage was caused by this. See `OUTAGE-REPORT-2026-05-16.md`.
2. **Sportradar rate budget:** Tracked in `api_rate_log`. The orchestrator checks remaining budget before dispatching. If nearing the limit, lower-priority polls are skipped.
3. **Deep link fallback chain:** native scheme → universal link → App Store. All three steps must be configured per provider.
4. **Gmail watch renewal:** Expires every 7 days. `renew-gmail-watch` handles this automatically.
5. **App name:** "Watch NORMA" is the brand. Never rename.
6. **No AI-generated images** in social content. Use real app screenshots from Supabase Storage only.
7. **Ad model:** Second-price Vickrey auction. Advertisers pay one cent above the second-highest bid or the floor price, whichever is higher.
8. **Alert threshold:** Score ≥ 40 to fire. See `05_ALERTS_STREAMING_AND_LIVE_SPORTS_LOGIC.md` for signal weights.
9. **Bet forwarding email:** `bets@getnorma.app`
10. **Never log tokens or API keys** in Edge Function output.

---

## 12. Credential Status Summary

| Category | Status |
|----------|--------|
| Supabase (core backend) | ✅ Active |
| ESPN (scores) | ✅ Active (no key needed) |
| SportsDataIO (schedules) | ✅ Active |
| Sportradar (PBP/summary) | ✅ Active |
| The Odds API (odds) | ✅ Active |
| Anthropic Claude (AI) | ✅ Active |
| Expo Push (notifications) | ✅ Active |
| Stripe (billing) | ✅ Active |
| Gmail (email wagers) | ✅ Active |
| X/Twitter (social) | ✅ Active |
| Slack (notifications) | ✅ Active |
| Facebook (social) | ⚠️ Needs token setup |
| Instagram (social) | ⚠️ Needs token setup |
| TikTok (social) | 🟡 App form complete except demo video; domain verified; pending review submission |
| Reddit (social) | 🔴 Blocked — self-service app creation disabled by Reddit (late 2024); commercial API approval required; ticket submitted 2026-05-31; guardrails coded |
| Sportsbook partner APIs | 🔲 Planned, no external API exists |
