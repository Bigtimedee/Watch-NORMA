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
- `evaluate-alerts/logic_test.ts` — alert evaluation rules
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

### Known Testing Gaps

- **No integration tests.** Tests are unit-level (Jest for client, Deno test for Edge Functions). There are no end-to-end tests that verify the full pipeline (game state change → alert → push → deep link).
- **No load tests.** The system has not been tested under high-concurrency scenarios (e.g., 50+ simultaneous live games during March Madness).
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
- **Migrations:** Applied via `supabase db push` (68 migration files: 001–066 + 4 timestamped; 031/032 unused).
- **Edge Functions:** Deployed via `supabase functions deploy [function-name]` (38 functions).
- **Secrets:** Set via `supabase secrets set` for each environment variable.
- **pg_cron jobs:** Configured in migration SQL files (004, 007, 013, 018, 022, 027, 029, 034, 035, 040, 044, 045, 046, 047, 056, 057, 063, 064, and `20260307000001_cmo_agent.sql`).

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

The `deep-link-health-check` Edge Function analyzes `deep_link_events` from the past hour:
- Fallback rates per provider per method per platform
- "Degraded" flag: > 80% fallback rate
- "Critical" flag: any `no_fallback` event (user could not open any provider)
- Returns HTTP 503 if any provider is critical

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
