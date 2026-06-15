# 08 — Testing, Deployment, and Operations

## Local Development

### Prerequisites

- Node.js 20+
- npm (with `--legacy-peer-deps` flag — see `.npmrc`)
- Deno v2.x (for Edge Function development)
- Supabase CLI (for local Supabase, migrations, function serving)
- Expo CLI / EAS CLI (for mobile development and builds)

### Commands

```bash
# Install dependencies
npm ci --legacy-peer-deps

# Start Expo dev server (mobile app)
npx expo start

# Start local Supabase (Postgres, Auth, Edge Functions)
npx supabase start

# Apply database migrations
npx supabase db push

# Serve Edge Functions locally
npx supabase functions serve

# Run client-side tests (Jest)
npm test

# Run with coverage
npm test -- --ci --coverage

# TypeScript type-check (client)
npx tsc --noEmit

# Deno type-check (Edge Functions)
deno check supabase/functions/evaluate-alerts/logic.ts
deno check supabase/functions/resolve-wagers/logic.ts
deno check supabase/functions/_shared/utils.ts
# ... (see ci.yml for full list)

# Deno tests (Edge Functions)
deno test --allow-env --allow-net=none supabase/functions/
```

### Environment Setup

1. Copy `.env.example` to `.env` and fill in Supabase URL, anon key, and SportsDataIO key.
2. Start local Supabase: `npx supabase start` (provides local URL + anon key).
3. Set Edge Function secrets locally: `npx supabase secrets set KEY=value`.
4. For the advertiser portal: `cd web && npm install && npm run dev`.

### Supabase Local Config

`supabase/config.toml` configures local development:
- API on port 54321
- DB on port 54322
- Studio on port 54323
- Auth: Apple Sign-In enabled
- Deep link callback: `norma://auth-callback`

## Testing Strategy

### Existing Tests

**Client-side (Jest + jest-expo):**
- `lib/__tests__/deep-links.test.ts` — deep link URL resolution and fallback chain
- `lib/__tests__/watch-provider-selection.test.ts` — best watch provider selection logic
- `lib/__tests__/alert-helpers.test.ts` — alert type labels, colors, icons, urgency, time formatting
- `lib/__tests__/alert-scoring.test.ts` — signal extraction and scoring logic
- `lib/__tests__/watcher-orchestrator.test.ts` — orchestrator dispatch logic
- `lib/__tests__/sport-multi-sport.test.ts` — multi-sport support
- `lib/__tests__/mapStatus.test.ts` — ESPN/SportsDataIO status mapping
- `lib/__tests__/no-ai-image-generation.test.ts` — ensures no DALL-E/AI image generation in social content
- `hooks/__tests__/useConnections.test.ts` — connection hook behavior
- `__tests__/DatePicker.test.tsx` — date picker component
- `__tests__/GamesScreen.test.tsx` — games screen rendering

**Edge Function tests (Deno):**
- `_shared/alert-scoring_test.ts` — scoring, must-notify, signal extraction
- `_shared/outcome-proximity_test.ts` — wager proximity calculations
- `_shared/polling-state_test.ts` — game status state machine
- `_shared/utils_test.ts` — hash, status mapping
- `_shared/wager-target-parser_test.ts` — wager description parsing
- `_shared/team-matching_test.ts` — team name fuzzy matching
- `_shared/template-vars_test.ts` — template variable interpolation
- `_shared/test-helpers.ts` — shared test utilities
- `evaluate-alerts/logic_test.ts` — alert evaluation rules (unit)
- `evaluate-alerts/integration_test.ts` — **E2E pipeline integration tests (36 tests, added P1-01)**: wires extractSignals → computeScore/checkMustNotify → determineAlertType → buildWhyNow → computeDedupHash. Covers: (1) follower + close/blowout threshold, (2) wager line crossed + wager_impact status, (3) all four must-notify rules, (4) dedup margin-bucket hash correctness, (5) per-game/hour cap gate logic, (6) quiet-hours push suppression with in-app record preserved, (7) no-stake user never becomes candidate. DB-dependent stages (candidate generation, throttle table, push dispatch) are documented as staging smoke-test scope.
- `resolve-wagers/logic_test.ts` — wager resolution logic
- `cmo-generate/media-selection_test.ts` — media asset selection
- `cmo-publish/media-upload_test.ts` — media upload logic

### Recommended Additional Tests

**Alert logic (critical path):**
- End-to-end alert pipeline test: game state change → candidate generation → scoring → delivery
- Must-notify rule coverage for all critical moments
- Throttle/dedup behavior under rapid game state changes
- Quiet hours enforcement
- Per-user cap enforcement
- Wager coverage accuracy (covering/not_covering/at_risk)
- MLB-specific alert rules (no-hitter, walk-off, scoring threat)

**Streaming-provider routing (critical path):**
- YouTube TV universal link regression test (must not point to sign-up page)
- Deep link fallback chain (scheme → universal → store) for all providers
- `getBestWatchProvider` with various broadcast + connection combinations
- Edge case: no broadcast data available
- Edge case: user has no connected providers

**Ad auction:**
- Vickrey second-price clearing correctness
- Floor price enforcement
- Fatigue model suppression at threshold
- Frequency cap enforcement
- Direct deal priority
- Thompson Sampling creative selection convergence
- Budget pacing behavior

**Data ingestion:**
- ESPN status mapping (critical: always use `type.description`)
- Team matching accuracy (especially similar names across conferences)
- Sportradar rate budget enforcement
- Duplicate snapshot prevention (payload_hash)

**Privacy/security:**
- RLS policy verification for all user-facing tables
- Account deletion completeness (all tables cleaned)
- No secret logging in Edge Function output

### Load Testing (P1-02)

`scripts/load-test/orchestrator-load.ts` — standalone Deno harness (no network, no DB) that simulates N simultaneous live games through the orchestrator dispatch loop.

**Running the harness:**

```bash
# CI-safe (small N — runs in < 1s):
deno test --allow-env --allow-net=none scripts/load-test/orchestrator-load_test.ts

# Manual large-N (March Madness simulation):
LOAD_GAMES=60 deno run --allow-env scripts/load-test/orchestrator-load.ts

# Full options:
LOAD_GAMES=60 LOAD_CYCLES=60 ERROR_RATE=0.1 deno run --allow-env scripts/load-test/orchestrator-load.ts
```

**Reading the output:**

- `PBP✓` / `PBP⛔` — dispatches that succeeded vs. were skipped due to the MAX_PBP=5 cap
- `Sum✓` / `Sum⛔` — same for summary polls (MAX_SUMMARY=3)
- `p50/p95 PBP interval` — effective interval between successful PBP polls per game (target: p95 ≤ 120s)
- `Games starved` — games that received 0 successful PBP dispatches across the full run
- A `⚠ STARVATION DETECTED` warning lists the affected game IDs and explains the root cause

**What the 60-game run revealed (P1-02, June 2026):**

| Metric | Result | Target |
|--------|--------|--------|
| PBP dispatched / cycle | 5 (cap) | ≤ 5 |
| PBP skipped / cycle | ~55 | — |
| p50 PBP interval | 720s (12 min) | ≤ 60s |
| p95 PBP interval | 720s (12 min) | ≤ 120s |
| Games starved | 6/60 (10%) | 0% |
| All invariants passed | ✓ | ✓ |

At 60 simultaneous games, MAX_PBP=5 can only service 5 games per cycle. With a 30s PBP interval and 60 games, a naive round-robin would require 360 slots per cycle — 72× more than the current cap. The starvation is structural, not a bug. See doc 09 (Known Gaps) for remediation options (priority tiering, increasing the cap, shedding low-relevance games).

**Invariants verified by the harness:**
- `pbp_dispatched ≤ 5` per cycle
- `summary_dispatched ≤ 3` per cycle
- `alert_dispatched ≤ 10` per cycle
- Backoff is exponential and capped at 300s
- Closed games receive 0 dispatches after deactivation

### Known Testing Gaps

- **Alert pipeline DB stages not covered.** `evaluate-alerts/integration_test.ts` covers all pure-function stages. Candidate generation (Stage 0), throttle table lookups (Stage 3), alert insertion + push dispatch (Stage 4) require a live Supabase instance. These are staging smoke-test scope.
- **No visual regression tests.** No screenshot or snapshot tests for UI components.

Previously noted risks that have been resolved:
- Fetch timeouts: `sportradar.ts` (12s), `poll-odds/index.ts` (10s), and `parse-bet-slip/index.ts` (30s) all use `AbortController` — no longer a gap.

## Deployment

### Mobile App (iOS)

- **Build:** EAS Build via Expo (`eas.json` present in repo)
- **OTA Updates:** EAS Update triggered automatically on main branch push (see CI/CD below). Channel: `production`.
- **App Store:** Manual submission for native builds. OTA updates for JS-only changes bypass App Store review.
- **Deep link scheme:** `norma://`

### Backend (Supabase)

- **Hosted Supabase:** Production Supabase project (URL in environment variables).
- **Migrations:** Applied via `supabase db push` (71 migration files: 001–069 + 4 timestamped; 031/032 unused).
- **Edge Functions:** Deployed via `supabase functions deploy [function-name]` (41 functions).
- **Secrets:** Set via `supabase secrets set` for each environment variable.
- **pg_cron jobs:** Configured in migration SQL files (004, 007, 013, 018, 022, 027, 029, 034, 035, 040, 044, 045, 046, 047, 056, 057, 063, 064, 067, 068, 069, and `20260307000001_cmo_agent.sql`).

### Advertiser Portal (web/)

- **Framework:** Next.js 15 with App Router
- **Build:** `npm run build` in `web/` directory
- **Deployment:** Presumably Vercel (`.next` build output present, Next.js standard)
- **Environment:** Requires Supabase URL, anon key, and service role key for SSR

### CI/CD (GitHub Actions)

`.github/workflows/ci.yml` runs on push to main and pull requests:

1. **Client job:** `npm ci --legacy-peer-deps` → `tsc --noEmit` → `npm test -- --ci --coverage`
2. **Deno job:** Type-check key logic files → `deno test --allow-env --allow-net=none supabase/functions/`
3. **Migrations job:** `supabase start` → `supabase stop` (verifies migrations apply cleanly)
4. **OTA Update job:** (main branch push only) `eas update --auto --channel production --non-interactive`

## Observability

### Structured Logging

All Edge Functions log structured JSON with consistent fields:

```json
{
  "function": "poll-boxscore",
  "event": "completed",
  "active_games": 12,
  "updated": 5,
  "pbp_dispatched": 3,
  "summary_dispatched": 2,
  "duration_ms": 1450,
  "timestamp": "2026-05-26T15:30:00.000Z"
}
```

### Key Events to Monitor

| Event | Source | Significance |
|-------|--------|-------------|
| Alert generated | `evaluate-alerts` | Core pipeline working |
| Alert sent (push) | `send-push` | Delivery pipeline working |
| Alert throttled/suppressed | `evaluate-alerts` | Dedup working (good) or over-suppressing (bad) |
| Deep link attempted | Client (`deep_link_events`) | Watch flow working |
| Deep link fallback triggered | Client (`deep_link_events`) | Provider scheme may be broken |
| Deep link failed (no fallback) | Client (`deep_link_events`) | Critical — user cannot watch |
| Provider degraded/critical | `deep-link-health-check` | Provider deep links failing |
| Sportradar rate budget low | `game-watcher-orchestrator` | May need to reduce polling |
| Watcher stale (> 5 min overdue) | `health-check` | Orchestrator may be stuck |
| ESPN score source failover | `poll-boxscore` (event: failover) | ESPN unavailable; using SportsDataIO |
| ESPN degraded | `health-check` (espn_failover.espn_degraded) | SportsDataIO-only snapshots in last 5 min |
| Auction won / no fill | `evaluate-alerts` | Ad revenue health |
| Fraud detected | `ad-fraud-check` | Campaign may need review |
| Push delivery failed | `send-push` / `delivery_log` | Token may be stale |
| Email wager parsed | `ingest-email-wagers` | Email pipeline working |
| Prediction settled | `resolve-predictions` | Market integration working |

### Health Check Endpoint

The `health-check` Edge Function returns:
- Watcher state summary (active, stale, with errors)
- Active game count
- Alert pipeline stats (generated, delivered, throttled, failed in last hour)
- Sportradar rate budget remaining
- Response includes HTTP 200 (healthy) or 503 (degraded)

### Deep Link Health

The `deep-link-health-check` Edge Function analyzes *client-reported* `deep_link_events` from the past hour:
- Fallback rates per provider per method per platform
- "Degraded" flag: > 80% fallback rate
- "Critical" flag: any `no_fallback` event (user could not open any provider)
- Returns HTTP 503 if any provider is critical

The `verify-provider-links` Edge Function *proactively* fetches each streaming/TV provider's `universal_link` every 6 hours (pg_cron, migration 069) and classifies the destination as `ok`, `suspect` (marketing/sign-up page), or `broken`. Results are in `provider_link_checks`; Slack is paged when a provider's status changes. This catches broken links before any user hits them — motivated by the YouTube TV `/welcome` regression (migrations 052–054).

### Automated Health Monitor (P1-03)

`monitor-health` is an Edge Function that calls both `health-check` and `deep-link-health-check` every 5 minutes (pg_cron, migration 067). It pages to `SLACK_WEBHOOK_URL` when any threshold is breached:

| Condition | Severity | Fingerprint |
|-----------|----------|-------------|
| ≥ 2 stale watchers | warning | `stale_watchers_low` |
| ≥ 5 stale watchers | critical | `stale_watchers_high` |
| Sportradar budget ≤ 5 remaining | warning | `sportradar_budget_low` |
| Alert delivery fail rate ≥ 25% (min 10 deliveries) | warning | `alert_pipeline_fail_rate_high` |
| Any `no_fallback` deep-link event | critical | `deep_link_no_fallback` |
| Provider deep links degraded/critical | warning/critical | `degraded_providers_<key>` |

**Dedup:** Repeated identical alerts are suppressed within a 30-minute cooldown window tracked in the `ops_alert_state` table (service-role-only RLS). Healthy responses produce no Slack noise.

**Slack secret:** Set `SLACK_WEBHOOK_URL` via `supabase secrets set SLACK_WEBHOOK_URL=https://hooks.slack.com/...`. If the secret is absent, thresholds are still evaluated and logged but no Slack message is sent.

## Operations

### Daily QA Checklist

1. Check `health-check` endpoint — all systems green?
2. Review watcher state — any stale watchers or high error counts?
3. Verify alert pipeline — alerts generated and delivered in the last hour?
4. Check deep-link health — any providers degraded or critical?
5. Review Sportradar rate budget — sufficient budget for today's game load?
6. Check cron job execution — `cron.job_run_details` in Supabase for failures?
7. Review ad fraud events — any new high-confidence fraud?
8. Check social publishing — posts published on schedule?
9. Verify `morning-briefing` fired at 11 PM UTC (6 PM CT) — "Tonight's Games" push delivered?
10. Check `monitor-health` cron logs — any Slack alerts fired or suppressed? (`ops_alert_state` table for history)
11. Verify `purge-old-data` ran (9 AM UTC) — check `cron.job_run_details` for failures or abnormally large deletion counts

### Incident Response for Bad Alerts

If users receive incorrect, stale, or irrelevant alerts:

1. Check `evaluate-alerts` logs for the alert in question.
2. Verify game state at the time of alert generation (check `game_snapshots`).
3. Verify the user's follows/wagers/positions that qualified them as a candidate.
4. Check if the scoring threshold was met legitimately.
5. If a systematic issue: consider pausing the `game-watcher-orchestrator` cron job while diagnosing.
6. For ESPN data issues: verify `status.type.description` is being used (see outage report).

### Rollback Strategy

- **Edge Functions:** Deploy the previous version: `supabase functions deploy [function-name]` with the prior code.
- **Migrations:** Migrations are additive. Rolling back requires manual SQL to drop added columns/tables. Never drop existing columns that v1 depends on.
- **Mobile app:** EAS OTA updates can be reverted by publishing a prior channel update. Native builds require App Store submission.
- **Cron jobs:** Disable specific cron jobs via SQL: `SELECT cron.unschedule('job_name');`

### Integration Token Expiration

| Token | Expiration | Renewal |
|-------|------------|---------|
| Supabase JWTs | 1 hour (auto-refresh) | Handled by client |
| Expo Push tokens | Device-specific, may rotate | Re-registered on app launch |
| Kalshi API keys | Set by user in Kalshi dashboard | User must re-connect if revoked |
| Gmail Pub/Sub watch | 7 days | `renew-gmail-watch` cron (weekly) |
| Stripe webhook signing | Managed by Stripe | Rotate in Stripe dashboard if compromised |
| X/Twitter tokens | Long-lived OAuth 1.0a | Rotate if compromised |
