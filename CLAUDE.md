# Watch-NORMA Claude Code Instructions

## Migration Numbering Rule — MANDATORY

Before creating any new migration file, run:

```bash
ls supabase/migrations/ | sort | tail -5
```

Use the highest numeric prefix found + 1. Two agents running in parallel will
both independently pick the same number if they do not check first — that
causes a `duplicate key value violates unique constraint "schema_migrations_pkey"`
CI failure that is painful to untangle. Timestamped migrations
(`YYYYMMDDHHMMSS_name.sql`) are always safe for ad-hoc agent work.

Before performing any work on Watch-NORMA, read:

`/docs/watch-norma-context/README.md`

Then read any relevant files in:

`/docs/watch-norma-context/`

Treat this folder as the canonical project context. If your work changes product behavior, architecture, schema, routes, environment variables, integrations, live sports data handling, alert logic, streaming-provider routing, ad logic, privacy assumptions, deployment assumptions, or core assumptions, update the documentation in the same session.

Do not rely on memory alone. Inspect the code before editing. Do not treat planned features as implemented. Preserve all non-negotiable product rules, especially streaming-provider routing and alert relevance.

See `/docs/watch-norma-context/10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md` for the complete list of hard rules and the required closing checklist.

---

# NORMA v2 — Architecture & Implementation Plan

## Project Overview

NORMA is a React Native/Expo mobile app for NCAA basketball fans and bettors. It ingests live game data from multiple sports APIs, tracks user wagers and prediction market positions, and sends push notifications telling users to "tune in at the perfect time" based on their specific interests and financial exposure.

## Tech Stack

- **Mobile**: React Native 0.81 + Expo 54 + Expo Router 6 + TypeScript 5.9
- **Backend**: Supabase (Postgres 15 + Edge Functions in Deno + Auth + Realtime)
- **Data Sources**: ESPN (schedule + scores, primary), Sportradar v8 (PBP/summary), The Odds API, Kalshi, Polymarket. SportsDataIO is NOT a NORMA data source (owner decision, 2026-08-20) — dormant fallback paths remain in the poll-* functions pending removal; do not extend them or provision keys for them.
- **Push**: Expo Push API
- **CI**: GitHub Actions (TypeScript checks, Jest, Deno type checks)
- **Native dependencies**: add ONLY via `npx expo install <pkg>` — never hand-pin a
  version. Hand-pinned `expo-store-review@^57` and `react-native-view-shot@^5` (SDK 54
  expects ~9.0.9 / 4.0.3) shipped in builds 23–24 and crashed the app at process start,
  before any JS ran — a crash no env-var or JS fix could touch (2026-08-20). Verify
  with `npx expo install --check` after adding any dependency; note it lists but does
  NOT fail (exit 0) on mismatches, so it cannot gate CI — it must be read.

## Key Directories

```
app/                    # Expo Router screens (auth, tabs)
components/             # Reusable React Native components
hooks/                  # React Query data fetching hooks
lib/                    # Types, constants, utilities, deep-link helpers
supabase/migrations/    # Postgres schema (additive SQL migrations)
supabase/functions/     # Deno Edge Functions (poll-*, evaluate-alerts, etc.)
supabase/functions/_shared/  # Shared backend utilities
```

## Git Workflow

**Always pull before pushing.** The remote may have commits from Vercel, CI, or other sessions.

```bash
git pull --rebase origin main   # Sync remote changes first
git push                        # Then push
```

If a push is rejected with `fetch first`, run the pull-rebase command above and retry.

## Development Commands

```bash
npx expo start           # Start Expo dev server
npx supabase start       # Start local Supabase
npx supabase db push     # Apply migrations
npx supabase functions serve  # Serve Edge Functions locally
npm test                 # Run Jest tests
```

## Architecture Conventions

- Edge Functions use Supabase service role for DB writes
- Client uses RLS-scoped queries via user JWT
- Polling state tracked in-memory per function invocation (see _shared/polling-state.ts)
- Hash-based dedup for all snapshot inserts (payload_hash)
- ESPN is the primary source (free, accurate). SportsDataIO fallback code still exists in poll-* but is unused and slated for removal, not hardening (owner decision, 2026-08-20)
- Sportradar is used only for PBP (full-coverage games) and summary stats

---

# NORMA v2 ARCHITECTURE (Supabase-Native)

## Design Decision: Stay on Supabase

All backend logic remains in Supabase Edge Functions + pg_cron + Postgres.
No Node/Express/BullMQ/Redis layer. The orchestration gaps are addressed via
Postgres-driven patterns (job tables, advisory locks, cron scheduling).

## System Architecture (ASCII)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          MOBILE CLIENT                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │  Games   │ │  Alerts  │ │Connections│ │ Profile  │ │  Wagers  │     │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘     │
│       │             │            │             │            │           │
│  ┌────┴─────────────┴────────────┴─────────────┴────────────┴─────┐    │
│  │              React Query + Supabase Client                     │    │
│  │              Supabase Realtime (games, alerts, game_odds)      │    │
│  └────────────────────────────┬───────────────────────────────────┘    │
└───────────────────────────────┼────────────────────────────────────────┘
                                │ HTTPS / WSS
┌───────────────────────────────┼────────────────────────────────────────┐
│                         SUPABASE                                       │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    EDGE FUNCTIONS (Deno)                        │   │
│  │                                                                 │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │   │
│  │  │ poll-schedule │  │ poll-boxscore│  │ game-watcher-        │  │   │
│  │  │  (30 min)     │  │  (1 min)     │  │ orchestrator (1 min) │  │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │   │
│  │         │                 │                      │              │   │
│  │         │    ┌────────────┼──────────────────────┤              │   │
│  │         │    │            │                      │              │   │
│  │  ┌──────▼───▼──┐  ┌──────▼──────┐  ┌───────────▼───────────┐  │   │
│  │  │ poll-summary │  │  poll-pbp   │  │   alert-engine (v2)   │  │   │
│  │  │  (2 min)     │  │  (30 sec)   │  │  candidate→signal→   │  │   │
│  │  └─────────────┘  └─────────────┘  │  score→throttle→     │  │   │
│  │                                     │  deliver              │  │   │
│  │  ┌─────────────┐  ┌─────────────┐  └───────────┬───────────┘  │   │
│  │  │  poll-odds   │  │ kalshi-proxy│              │              │   │
│  │  │  (5 min)     │  │  (on-demand)│              │              │   │
│  │  └─────────────┘  └─────────────┘              │              │   │
│  │                                                 │              │   │
│  │  ┌──────────────┐  ┌─────────────┐  ┌──────────▼───────────┐  │   │
│  │  │parse-bet-slip│  │resolve-wager│  │    send-push (v2)    │  │   │
│  │  │ (on-demand)  │  │ (on-close)  │  │ + delivery_log       │  │   │
│  │  └──────────────┘  └─────────────┘  └──────────────────────┘  │   │
│  │                                                                │   │
│  │  ┌──────────────┐  ┌──────────────┐                           │   │
│  │  │ingest-email- │  │ wager-manual │                           │   │
│  │  │ wagers (v2)  │  │ (on-demand)  │                           │   │
│  │  └──────────────┘  └──────────────┘                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    POSTGRES (via pg_cron)                       │   │
│  │                                                                 │   │
│  │  Tables:                                                        │   │
│  │  ┌──────────┐ ┌──────────────┐ ┌────────────────────┐          │   │
│  │  │ profiles │ │user_prefs    │ │ provider_registry  │          │   │
│  │  │          │ │(v2: teams,   │ │ (v2: app_scheme,   │          │   │
│  │  │          │ │ players,     │ │  universal_link,   │          │   │
│  │  │          │ │ notif caps)  │ │  fallback, auth)   │          │   │
│  │  └──────────┘ └──────────────┘ └────────────────────┘          │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐       │   │
│  │  │  games   │ │  teams   │ │  follows │ │ connections │       │   │
│  │  └──────────┘ └──────────┘ │(v2:player│ └─────────────┘       │   │
│  │  ┌──────────────┐          │ +league) │                        │   │
│  │  │game_snapshots│          └──────────┘                        │   │
│  │  └──────────────┘                                              │   │
│  │  ┌──────────┐ ┌──────────────┐ ┌──────────┐ ┌──────────────┐  │   │
│  │  │  alerts  │ │delivery_log  │ │  wagers  │ │  game_odds   │  │   │
│  │  │ (v2:     │ │  (v2: new)   │ │ (v2:     │ │              │  │   │
│  │  │  score,  │ │              │ │  source, │ │              │  │   │
│  │  │  explain)│ │              │ │  legs)   │ │              │  │   │
│  │  └──────────┘ └──────────────┘ └──────────┘ └──────────────┘  │   │
│  │  ┌───────────────────┐ ┌─────────────────┐                    │   │
│  │  │prediction_positions│ │ alert_throttle  │                    │   │
│  │  └───────────────────┘ │  (v2: new)      │                    │   │
│  │                        └─────────────────┘                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Supabase Realtime (Postgres WAL)                               │   │
│  │  Publishes: games, alerts, game_odds                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘

External APIs:
  ┌─────────┐ ┌──────────────┐ ┌───────────┐ ┌──────────┐ ┌───────┐
  │  ESPN   │ │ SportsDataIO │ │Sportradar │ │ Odds API │ │Kalshi │
  │ (free)  │ │  (schedule)  │ │  v8 (PBP/ │ │ (DK/FD/  │ │ (API) │
  │         │ │              │ │  summary) │ │ BetMGM)  │ │       │
  └─────────┘ └──────────────┘ └───────────┘ └──────────┘ └───────┘
```

## Addressing pg_cron Limitations

pg_cron lacks retry, backoff, and concurrency control. We work around this
using Postgres itself as the coordination layer:

### Pattern: Postgres-Backed Orchestration

Instead of BullMQ, we use a `watcher_state` table that tracks per-game
polling lifecycle:

```sql
-- NEW TABLE: watcher_state
-- Tracks which games are actively being watched and when each feed was last polled
CREATE TABLE watcher_state (
  game_id TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  pbp_last_polled_at TIMESTAMPTZ,
  pbp_next_poll_at TIMESTAMPTZ,
  pbp_error_count INT DEFAULT 0,
  summary_last_polled_at TIMESTAMPTZ,
  summary_next_poll_at TIMESTAMPTZ,
  summary_error_count INT DEFAULT 0,
  alert_last_evaluated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

The `game-watcher-orchestrator` Edge Function (called by pg_cron every 1 min):
1. Queries `watcher_state` for games where `*_next_poll_at <= now()`
2. Invokes the appropriate Edge Function (poll-pbp, poll-summary, alert-engine)
3. On success: updates `*_last_polled_at`, sets next poll time based on interval
4. On failure: increments `*_error_count`, applies exponential backoff to next poll
5. Respects concurrency limits: max 5 concurrent PBP polls, max 3 summary polls

This replaces the in-memory polling-state.ts with durable, crash-safe state.

### Pattern: Idempotent Edge Functions

Every Edge Function must be safe to invoke multiple times:
- Writes use `ON CONFLICT DO UPDATE` or check `payload_hash` before insert
- State transitions are guarded by `WHERE status = expected_status`
- Functions return structured results: `{ success, skipped_reason?, error? }`

## V2 Data Model Additions (Additive Migrations)

### Migration 010: user_preferences

```sql
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  favorite_teams JSONB DEFAULT '[]',    -- [{team_id, added_at}]
  favorite_players JSONB DEFAULT '[]',  -- [{player_name, team_id, added_at}]
  notification_settings JSONB DEFAULT '{
    "quiet_hours_start": null,
    "quiet_hours_end": null,
    "max_alerts_per_game": 5,
    "max_alerts_per_hour": 10,
    "channels": {"push": true, "in_app": true}
  }'
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own prefs" ON user_preferences
  FOR ALL USING (auth.uid() = user_id);
```

### Migration 011: follows v2 (add player + league)

```sql
-- Add entity-based follows alongside existing game/team follows
ALTER TABLE follows ADD COLUMN entity_type TEXT;
ALTER TABLE follows ADD COLUMN entity_id TEXT;

-- Backfill existing rows
UPDATE follows SET entity_type = 'game', entity_id = game_id WHERE follow_type = 'game';
UPDATE follows SET entity_type = 'team', entity_id = team_id WHERE follow_type = 'team';

-- New indexes for entity-based queries
CREATE INDEX idx_follows_entity ON follows(entity_type, entity_id);
CREATE INDEX idx_follows_user_entity ON follows(user_id, entity_type);
```

### Migration 012: provider_registry

```sql
-- Upgrade streaming_providers → provider_registry with auth_mode and link metadata
ALTER TABLE streaming_providers ADD COLUMN universal_link TEXT;
ALTER TABLE streaming_providers ADD COLUMN fallback_store_url TEXT;
ALTER TABLE streaming_providers ADD COLUMN auth_mode TEXT DEFAULT 'deep_link_only';
  -- Values: deep_link_only | oauth | partner_api | manual
ALTER TABLE streaming_providers ADD COLUMN category TEXT;
  -- Values: streaming | tv | sportsbook | prediction_market

-- Rename for clarity (keep old name as view for backward compat)
ALTER TABLE streaming_providers RENAME TO provider_registry;
CREATE VIEW streaming_providers AS SELECT * FROM provider_registry;
```

### Migration 013: wagers v2

```sql
-- Add multi-tier wager support
ALTER TABLE wagers ADD COLUMN source TEXT DEFAULT 'manual';
  -- Values: manual | email_parse | partner_api | bet_slip_scan
ALTER TABLE wagers ADD COLUMN provider_key TEXT;
  -- e.g., draftkings, fanduel, betmgm
ALTER TABLE wagers ADD COLUMN external_bet_id TEXT;
ALTER TABLE wagers ADD COLUMN stake NUMERIC;
ALTER TABLE wagers ADD COLUMN potential_payout NUMERIC;
ALTER TABLE wagers ADD COLUMN legs JSONB;
  -- For parlays: [{game_id, team_id, market_type, line, odds}]
ALTER TABLE wagers ADD COLUMN mapped_entities JSONB;
  -- {game_ids: [], team_ids: [], player_names: []}
ALTER TABLE wagers ADD COLUMN placed_at TIMESTAMPTZ;
ALTER TABLE wagers ADD COLUMN market_type TEXT;
  -- spread | total | moneyline | player_prop | futures | parlay

-- Unique constraint for external dedup (Tier A/B)
CREATE UNIQUE INDEX idx_wagers_external
  ON wagers(provider_key, external_bet_id)
  WHERE external_bet_id IS NOT NULL;
```

### Migration 014: alerts v2 + delivery_log

```sql
-- Upgrade alerts for structured "WHY NOW"
ALTER TABLE alerts ADD COLUMN score NUMERIC;
ALTER TABLE alerts ADD COLUMN explanation JSONB;
  -- {headline, bullets: [], stats_used: {}, confidence: 0-1, wager_impact: {}}
ALTER TABLE alerts ADD COLUMN suppressed_reason TEXT;

-- Delivery tracking
CREATE TABLE delivery_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alert_id BIGINT REFERENCES alerts(id) ON DELETE CASCADE NOT NULL,
  channel TEXT NOT NULL,  -- push | in_app
  provider_message_id TEXT,
  status TEXT NOT NULL,   -- sent | failed | throttled
  error_detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE delivery_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own delivery logs" ON delivery_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM alerts WHERE alerts.id = delivery_log.alert_id AND alerts.user_id = auth.uid())
  );
CREATE INDEX idx_delivery_log_alert ON delivery_log(alert_id);
```

### Migration 015: alert_throttle + watcher_state

```sql
-- Persistent throttle state (replaces in-memory cooldown)
CREATE TABLE alert_throttle (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  dedup_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, game_id, alert_type, dedup_hash)
);

CREATE INDEX idx_alert_throttle_lookup
  ON alert_throttle(user_id, game_id, alert_type, created_at DESC);

-- Watcher orchestration state
CREATE TABLE watcher_state (
  game_id TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  pbp_last_polled_at TIMESTAMPTZ,
  pbp_next_poll_at TIMESTAMPTZ,
  pbp_error_count INT DEFAULT 0,
  summary_last_polled_at TIMESTAMPTZ,
  summary_next_poll_at TIMESTAMPTZ,
  summary_error_count INT DEFAULT 0,
  alert_last_evaluated_at TIMESTAMPTZ,
  concurrency_slot INT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

## Alert Engine v2 — Pipeline Design

The v1 `evaluate-alerts` function is a single function with if/else logic.
v2 replaces it with a staged pipeline, still as a single Edge Function but
with clearly separated stages internally:

### Stage 0: Candidate Generation

```
Input: game_id (from orchestrator or boxscore trigger)
Query:
  - All users who FOLLOW this game's teams, players, or the game itself
  - All users with OPEN WAGERS mapped to this game
  - All users with OPEN PREDICTION POSITIONS mapped to this game
Output: [{user_id, game_id, context: {follows: [], wagers: [], positions: []}}]
```

**Key change from v1**: v1 only alerts users with active wagers. v2 alerts
anyone who follows the game/team/player, even without wagers. Wagers add
extra signal weight but are no longer required.

### Stage 1: Signal Extraction

For each (user, game) candidate, build a signal vector:

```typescript
interface SignalVector {
  // Game state
  margin: number;              // absolute score difference
  clock_minutes: number;       // minutes remaining
  period: number;
  is_close_game: boolean;      // margin <= 6 in 2nd half
  is_final_minutes: boolean;   // under 2:00 in 2nd half
  lead_changes_recent: number; // from PBP events (last 5 min)

  // From Sportradar summary
  home_biggest_lead: number;
  away_biggest_lead: number;
  bench_points_delta: number;
  efg_delta: number;           // effective FG% difference
  turnovers_delta: number;
  foul_trouble: Array<{player: string, fouls: number, starter: boolean}>;

  // User relevance
  follows_team: boolean;
  follows_player_on_court: boolean;
  has_wager: boolean;
  wager_is_covering: boolean | null;
  wager_type: string | null;
  has_position: boolean;
}
```

### Stage 2: Scoring + Rule Evaluation

Hybrid approach:

**Must-notify rules** (fire immediately if conditions met):
- Star player picks up 4th foul (starter with ≥ 12 ppg)
- 1-possession game (margin ≤ 3) with under 2:00 remaining
- Overtime starts
- Game final (bet resolved)

**Weighted scoring** (for non-must-notify moments):

| Signal                        | Weight |
|-------------------------------|--------|
| User has wager on this game   | +30    |
| Wager line is being crossed   | +25    |
| Close game (margin ≤ 6, 2H)  | +20    |
| User follows a team playing   | +15    |
| Final 5 minutes               | +10    |
| Lead change in last 3 min     | +10    |
| Foul trouble (4+ fouls)       | +8     |
| Bench points swing (≥10)      | +5     |
| eFG% divergence (≥10%)        | +5     |
| User follows player on court  | +5     |

**Threshold**: score ≥ 40 to generate alert. This means:
- Following a team + close game = 35 (no alert yet)
- Following a team + close game + final 5 min = 45 (alert)
- Wager + line being crossed = 55 (alert)
- Just following a team, blowout = 15 (no alert)

### Stage 2b: "WHY NOW" Explanation

Every alert that passes the threshold gets a structured explanation:

```typescript
interface WhyNow {
  headline: string;        // "Your Spread Is Live"
  bullets: string[];       // ["Duke trails by 3 with 4:12 left", "They were down 14 in the 1st half"]
  stats_used: Record<string, number>;  // {margin: 3, clock_minutes: 4.2, biggest_lead: 14}
  confidence: number;      // 0.0–1.0 (how "important" this moment is)
  wager_impact?: {         // Only if user has a wager
    wager_id: number;
    wager_description: string;
    status: 'covering' | 'not_covering' | 'at_risk' | 'decided';
  };
}
```

### Stage 3: Throttling + Dedup

Replaces the simple 10-minute cooldown with:

```
1. Dedup hash = hash(user_id, game_id, alert_type, margin_bucket, period)
   - margin_bucket = Math.floor(margin / 3) — prevents alerts for every point
   - Check alert_throttle table for existing hash

2. Per-user caps (from user_preferences.notification_settings):
   - max_alerts_per_game (default 5)
   - max_alerts_per_hour (default 10)
   - quiet_hours: skip push, queue in-app only

3. Cooldown: minimum 5 minutes between same alert_type for same game
```

### Stage 4: Delivery Routing

```
For each approved alert:
  1. INSERT into alerts table (with score, explanation jsonb)
  2. Determine channel:
     - If quiet hours → in_app only
     - If app is foregrounded (check last_active_at < 30s ago) → in_app only
     - Otherwise → push + in_app
  3. Invoke send-push with alert data
  4. INSERT into delivery_log with result
```

## Connections v2 — Deep Link Policy

### Provider Registry

The `provider_registry` table (upgraded from `streaming_providers`) becomes the
single source of truth for all provider metadata:

```
provider_registry:
  key: "espn_plus"
  name: "ESPN+"
  category: "streaming"
  auth_mode: "deep_link_only"
  ios_scheme: "sportscenter://"
  universal_link: "https://plus.espn.com"
  fallback_store_url: "https://apps.apple.com/app/espn/id317469184"
  ios_app_store_url: "https://apps.apple.com/app/espn/id317469184"
  web_url: "https://plus.espn.com/watch"
```

### Deep Link Fallback Chain (updated)

```
1. Try ios_scheme (e.g., sportscenter://) via Linking.canOpenURL
2. If fails → try universal_link (e.g., https://plus.espn.com)
3. If fails → open fallback_store_url (App Store)
4. If none configured → show "not available" message
```

### What "Connected" Means

- **Streaming/TV**: User indicates they have access. NORMA recommends where
  to watch + provides one-tap deep link. No API access to watch history.
- **Sportsbook**: Depends on tier (see below).
- **Prediction Market (Kalshi)**: API credentials stored, positions synced.

### Single Source of Truth

The `connections` table is the only place connection state lives.
Every screen that needs to know "does user have ESPN+?" reads from this table.
There is no local-only state, no screen-specific tracking.

## Wager Connectivity Tiers

### Tier C: Manual Entry (existing, enhanced)

Already built. Enhancements for v2:
- Add parlay support (legs jsonb)
- Add market_type field
- Better entity mapping (auto-link game_id from team selection)
- All manual entries get `source = 'manual'`

### Tier B: Bet Slip Scan (existing) + Email Parse (new)

**Bet Slip Scan** (already built):
- User photographs bet slip → Claude Vision extracts wager details
- Gets `source = 'bet_slip_scan'`

**Email Parse** (new in v2):
- User forwards bet confirmation email to `bets@norma-app.com`
- Supabase Edge Function receives via webhook (SendGrid/Mailgun inbound parse)
- Parses email body for: sportsbook, game, market type, line, odds, stake
- Creates wager with `source = 'email_parse'`, `status = 'pending_review'`
- User sees "Confirm imported bet" card in app
- Gets `source = 'email_parse'` after confirmation

### Tier A: Partner API (scaffolding only)

No DraftKings/FanDuel consumer API exists. Architecture supports it:
- `connections.auth_mode = 'partner_api'` or `'oauth'`
- Encrypted token storage in connections.metadata
- `BetIngestor` interface in shared code:

```typescript
interface BetIngestor {
  provider_key: string;
  fetchOpenWagers(userId: string, accessToken: string): Promise<NormalizedWager[]>;
  mapToEntities(wager: RawWager): MappedEntities;
}
```

Adapters are written when partnerships are secured. The wager table schema
already supports external_bet_id dedup and provider_key tracking.

## Security

- **Token encryption**: Kalshi credentials in connections.metadata are protected
  by RLS (only user's own row accessible). For v2, add pgcrypto column-level
  encryption for access_token/refresh_token fields when partner APIs are added.
- **No token logging**: Edge Functions must never console.log tokens or API keys.
- **Rate limiting**: Supabase Edge Functions have built-in rate limiting via the
  Supabase platform. For additional per-user limits, use the alert_throttle table.
- **Audit logging**: Connection changes (connect/disconnect) logged via a
  Postgres trigger that writes to an audit_log table.

## Observability

Supabase provides:
- **Logs**: Edge Function logs viewable in Supabase Dashboard (structured JSON via console.log)
- **Metrics**: pg_cron job execution history in `cron.job_run_details`
- **Realtime monitoring**: Query `watcher_state` for active game polling health

Add to each Edge Function:
```typescript
console.log(JSON.stringify({
  function: "poll-boxscore",
  event: "completed",
  active_games: 12,
  updated: 5,
  pbp_dispatched: 3,
  summary_dispatched: 2,
  duration_ms: 1450,
  timestamp: new Date().toISOString(),
}));
```

Custom health check endpoint (new Edge Function: `health-check`):
- Returns current watcher_state summary
- Counts games with stale poll times (> 5 min overdue)
- Checks cron job last run times
- Returns alert pipeline stats (generated/delivered/throttled last hour)

## Supabase Realtime Strategy

Already enabled for `games`, `alerts`, `game_odds` tables.

v2 additions:
- Client subscribes to `games` changes filtered by followed game IDs
- Client subscribes to `alerts` for current user
- No custom WebSocket server needed — Supabase Realtime handles it

For the game detail screen, the client already uses React Query polling.
Adding Supabase Realtime subscription gives instant updates without
waiting for the next poll cycle:

```typescript
// In useGameDetail hook
supabase
  .channel(`game-${gameId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'games',
    filter: `id=eq.${gameId}`
  }, (payload) => {
    queryClient.setQueryData(['game', gameId], payload.new);
  })
  .subscribe();
```

---

# MIGRATION PLAN (v1 → v2)

## Principles
- **Additive only**: no dropping columns, no renaming existing tables in-place
  (use views for backward compat)
- **Backward compatible**: v1 app continues to work during rollout
- **Feature-flagged**: v2 features gated by user_preferences or app version

## Migration Order

> NOTE: The SQL blocks earlier in this section describe the *original v2 plan*. The
> migrations were renumbered during implementation (see git: "resolve all duplicate
> prefix collisions"), so the actual on-disk filenames differ from the planning names.
> The list below reflects the ACTUAL files in `supabase/migrations/`. The canonical,
> up-to-date schema description lives in `docs/watch-norma-context/03_TECHNICAL_ARCHITECTURE.md`
> and `04_DATA_AND_INTEGRATIONS.md`.

```
010_user_preferences.sql   — user_preferences table (favorite_teams, notification_settings)
011_provider_registry.sql  — renames streaming_providers → provider_registry, compat view
012_watcher_state.sql      — watcher_state + alert_throttle orchestration tables
013_cron_v2.sql            — adds game-watcher-orchestrator pg_cron job
014_alerts_v2.sql          — alerts v2 columns (score, explanation), delivery_log, follows entity_type/entity_id
015_wagers_v2.sql          — wagers v2 columns (source, provider_key, legs, stake, market_type)
016_data_layer_v2.sql      — additional v2 data-layer tables/columns
017_wager_targets.sql      — parsed wager targets for proximity scoring
```

As of June 2026 the repository contains 68 migration files (001–066 plus four
timestamped migrations; prefixes 031/032 were never used). Each migration is additive
and safe to run independently. Rollback = drop added columns/tables.

---

# IMPLEMENTATION PLAN (Milestones)

## M0: Connections + Deep Links + Single Source of Truth

**Goal**: Fix streaming/sportsbook connections UX. One truth, reliable deep links.

### Tickets

**M0-1: Provider Registry Migration**
- Run migration 012 (rename streaming_providers → provider_registry, add columns)
- Backfill universal_link and fallback_store_url for all providers
- Create backward-compat view
- AC: All existing provider queries still work. New columns populated.

**M0-2: Deep Link Fallback Chain**
- Update `lib/deep-links.ts` to use 3-step fallback: scheme → universal link → App Store
- Read from provider_registry (new columns)
- AC: Tapping "Watch" on a game tries native app first, falls back gracefully.
  No broken web redirects.

**M0-3: Connections Screen Consolidation**
- Ensure all connection entry points (game detail "Watch", connections tab, sportsbook section)
  read from the same `connections` table
- Remove any local-only connection state
- AC: Connecting ESPN+ on the connections tab immediately shows "Watch on ESPN+"
  on all game detail screens. Disconnecting removes it everywhere.

**M0-4: Sportsbook Connection UX (Tier C)**
- Update sportsbook connections screen: connecting a sportsbook = "I use this book"
- No auth flow, no credentials — just marks the provider as connected
- Shows appropriate messaging: "NORMA will help you track your bets from [DraftKings]"
- AC: User can mark DraftKings as connected. Manual wager entry pre-selects that book.

**M0-5: User Preferences Table**
- Run migration 010
- Add preferences screen in profile tab (favorite teams picker, notification caps)
- Wire up quiet hours and per-game alert caps
- AC: User can set favorite teams and quiet hours. Data persists across sessions.

## M1: Watcher Orchestrator + Summary Caching + Durable State

**Goal**: Replace in-memory polling state with crash-safe Postgres-backed orchestration.

### Tickets

**M1-1: Watcher State Migration**
- Run migration 015 (watcher_state + alert_throttle tables)
- AC: Tables exist, no impact on existing polling.

**M1-2: Game Watcher Orchestrator Edge Function**
- New function: `game-watcher-orchestrator`
- On invocation (1 min cron):
  1. Find games with status IN ('inprogress', 'halftime') that don't have a watcher_state row → create one
  2. Find watcher_state rows where `*_next_poll_at <= now()` → invoke appropriate function
  3. On success: update last_polled, set next_poll based on interval
  4. On failure: increment error_count, backoff (next_poll = now + 30s * 2^error_count, max 5 min)
  5. Deactivate watcher_state rows for games that have moved to 'closed'/'cancelled'
- Concurrency: max 5 PBP, max 3 summary invocations per cycle
- AC: During live games, PBP polls every ~30s, summary every ~2min, with automatic
  backoff on errors. No duplicate polls for the same game.

**M1-3: Migrate poll-boxscore to Use Orchestrator**
- poll-boxscore continues to handle score updates (ESPN + SportsDataIO)
- Remove inline poll-pbp / poll-summary invocations from poll-boxscore
- Instead, poll-boxscore creates/updates watcher_state rows; orchestrator handles dispatch
- AC: poll-boxscore is faster (no inline function calls). PBP/summary dispatch is handled
  by the orchestrator with retry/backoff.

**M1-4: Sportradar Rate Budget**
- Add rate tracking to `_shared/sportradar.ts`:
  - Track calls made per minute in watcher_state or a simple counter table
  - If approaching limit, orchestrator skips lower-priority polls
- AC: Sportradar API calls stay within quota even with 20+ simultaneous live games.

**M1-5: Update pg_cron for v2**
- Run migration 016: add `game-watcher-orchestrator` to pg_cron (every 1 min)
- Keep existing poll-boxscore cron (1 min)
- Keep existing poll-schedule cron (30 min)
- Remove standalone evaluate-alerts cron (now triggered by orchestrator)
- AC: Two cron jobs running: poll-boxscore (scores), game-watcher-orchestrator (dispatch).

## M2: Alert Engine v2 (Rules + "Why Now" + Follow-Based Alerts)

**Goal**: Replace simple if/else alert logic with scored pipeline. Alert on follows, not just wagers.

### Tickets

**M2-1: Follows v2 Migration + UI**
- Run migration 011 (entity_type, entity_id columns on follows)
- Update follows hooks and components to support player and league follows
- AC: User can follow a player (from game detail player stats) or a league.
  Follow data is stored with entity_type/entity_id.

**M2-2: Alerts v2 Migration**
- Run migration 014 (score, explanation, suppressed_reason on alerts; delivery_log table)
- AC: Columns added, existing alerts unaffected (new columns nullable).

**M2-3: Alert Engine v2 — Candidate Generation**
- Refactor evaluate-alerts to first generate candidates:
  - Query follows for users following teams/players in this game
  - Query wagers for users with active bets on this game
  - Query prediction_positions for users with positions
- AC: Alert candidates include follow-only users (not just wager holders).

**M2-4: Alert Engine v2 — Signal Extraction + Scoring**
- Build signal vector from game state + latest summary snapshot
- Implement weighted scoring with configurable weights
- Must-notify rules for critical moments
- AC: Each candidate gets a numeric score. Alerts only fire above threshold (40).
  Unit tests cover: close game + follow = alert; blowout + follow = no alert;
  wager covering = alert.

**M2-5: Alert Engine v2 — "Why Now" Explanations**
- Generate structured WhyNow object for every alert
- Include headline, bullets, stats, confidence score
- If wager-relevant: include which wager and whether it's covering
- AC: Alert cards in the app show rich explanation. Example: "Duke +3.5 — covering
  by 1 with 4:12 left. They trailed by 14 in the first half."

**M2-6: Alert Engine v2 — Throttling + Dedup**
- Replace in-memory cooldown with alert_throttle table
- Implement dedup hash, per-user caps, quiet hours
- AC: User with max_alerts_per_game=5 gets at most 5 alerts. Quiet hours suppress
  push but still create in-app alerts.

**M2-7: Delivery Log + Push v2**
- Update send-push to write to delivery_log
- Track provider_message_id from Expo Push API response
- Handle push failures gracefully (log, don't retry immediately)
- AC: Every push attempt is recorded in delivery_log with status.

**M2-8: Alert History UI**
- Update alerts tab to show rich "Why Now" cards
- Show explanation headline + bullets + stats
- Wager-linked alerts show the bet details inline
- AC: Alert feed shows structured explanations instead of plain text.

## M3: Wager Tiers B + C Enhancements + Tier A Scaffolding

**Goal**: Email-based bet import, parlay support, partner API interface.

### Tickets

**M3-1: Wagers v2 Migration**
- Run migration 013 (source, provider_key, external_bet_id, stake, legs, etc.)
- Backfill existing wagers with source='manual'
- AC: Existing wagers unchanged. New columns available.

**M3-2: Manual Wager Entry v2 (Tier C Enhancement)**
- Update AddWagerSheet to support:
  - Parlay entry (add multiple legs)
  - market_type selection
  - Stake and odds entry
  - Auto-map game_id from team selection
- AC: User can enter a 3-leg parlay. Each leg maps to a game. Wager stored with
  legs jsonb and market_type='parlay'.

**M3-3: Email Wager Ingest (Tier B) — Backend**
- Set up inbound email parsing via SendGrid/Mailgun webhook
- New Edge Function: `ingest-email-wagers`
  - Receives parsed email (from, subject, body, attachments)
  - Identifies sportsbook from sender domain
  - Extracts wager details using structured parsing (regex for known formats)
  - Falls back to Claude for ambiguous emails
  - Creates wager with source='email_parse', status='active'
  - Sends in-app notification: "New bet imported — please review"
- AC: User forwards DraftKings confirmation email → wager appears in app within 2 min.

**M3-4: Email Wager Ingest (Tier B) — Client**
- Show "Import bets via email" option in connections/sportsbook screen
- Display forwarding address
- Show "Pending review" badge on imported wagers
- AC: User can see and confirm/reject email-imported wagers.

**M3-5: Tier A Scaffolding (Partner API Interface)**
- Define `BetIngestor` interface in `_shared/bet-ingestor.ts`
- Create stub adapter for DraftKings (returns empty, logs "not yet available")
- Wire connections UI: if provider has auth_mode='partner_api', show OAuth button (disabled with "Coming soon")
- AC: Interface is defined and tested. When a partnership is secured, only the
  adapter implementation needs to change.

**M3-6: Health Check Endpoint**
- New Edge Function: `health-check`
- Returns: watcher_state summary, stale polls, cron health, alert pipeline stats
- AC: Calling /functions/v1/health-check returns JSON with system health.

**M3-7: Observability Improvements**
- Add structured JSON logging to all Edge Functions (function name, event, duration, counts)
- Add error tracking: failed function invocations logged with full context
- AC: Logs are queryable by function name and event type in Supabase Dashboard.

---

# REPOSITORY LAYOUT (v2)

```
norma/
├── app/                              # Expo Router screens
│   ├── (auth)/                       # Auth flows (unchanged)
│   ├── (tabs)/
│   │   ├── games/
│   │   │   ├── index.tsx             # Game list (All/Live/Following)
│   │   │   └── [gameId].tsx          # Game detail (scores, odds, watch, wager)
│   │   ├── alerts/
│   │   │   └── index.tsx             # Alert feed (v2: rich "Why Now" cards)
│   │   ├── connections/
│   │   │   ├── index.tsx             # Connection categories
│   │   │   ├── streaming.tsx
│   │   │   ├── tv-provider.tsx
│   │   │   ├── sportsbooks.tsx       # v2: shows tier info, email import option
│   │   │   ├── prediction-markets.tsx
│   │   │   ├── kalshi-connect.tsx
│   │   │   └── polymarket-connect.tsx
│   │   └── profile/
│   │       └── index.tsx             # v2: links to preferences
├── components/
│   ├── GameCard.tsx
│   ├── AlertCard.tsx                 # v2: renders WhyNow explanation
│   ├── WagerCard.tsx
│   ├── AddWagerSheet.tsx             # v2: parlay support
│   ├── ReviewScannedWagersSheet.tsx
│   ├── ConnectionToggle.tsx
│   ├── OddsDisplay.tsx
│   ├── PositionCard.tsx
│   ├── WhyNowCard.tsx               # v2: new — renders structured explanation
│   └── PreferencesSheet.tsx          # v2: new — favorite teams, quiet hours
├── hooks/
│   ├── useAuth.ts
│   ├── useGames.ts
│   ├── useAlerts.ts
│   ├── useConnections.ts
│   ├── useFollows.ts                # v2: supports player/league follows
│   ├── useWagers.ts
│   ├── useOdds.ts
│   ├── usePreferences.ts            # v2: new
│   └── useBetSlipScanner.ts
├── lib/
│   ├── types.ts                     # v2: updated types
│   ├── constants.ts
│   ├── deep-links.ts                # v2: 3-step fallback chain
│   ├── supabase.ts
│   ├── alert-helpers.ts
│   └── __tests__/
│       └── alert-helpers.test.ts
├── supabase/
│   ├── migrations/            # 68 files on disk (001–066 + 4 timestamped; 031/032 unused)
│   │   ├── 001–009 (existing)
│   │   ├── 010_user_preferences.sql
│   │   ├── 011_provider_registry.sql
│   │   ├── 012_watcher_state.sql
│   │   ├── 013_cron_v2.sql
│   │   ├── 014_alerts_v2.sql
│   │   ├── 015_wagers_v2.sql
│   │   ├── 016_data_layer_v2.sql
│   │   ├── 017_wager_targets.sql
│   │   ├── ... (018–062: odds, advertising, social, email, deep-link, MLB, geo, waitlist)
│   │   ├── 063_social_cron_schedule.sql
│   │   ├── 064_morning_briefing_cron.sql
│   │   ├── 065_campaign_approval.sql
│   │   └── 066_referrals.sql
│   └── functions/
│       ├── _shared/
│       │   ├── cors.ts
│       │   ├── utils.ts
│       │   ├── sportradar.ts         # v2: add rate budget tracking
│       │   ├── polling-state.ts      # v2: deprecated (replaced by watcher_state table)
│       │   ├── team-matching.ts
│       │   ├── kalshi-crypto.ts
│       │   ├── bet-ingestor.ts       # v2: new — BetIngestor interface + adapters
│       │   ├── alert-pipeline.ts     # v2: new — staged pipeline logic
│       │   ├── signal-vector.ts      # v2: new — signal extraction
│       │   ├── scoring.ts            # v2: new — weighted scoring + rules
│       │   ├── throttle.ts           # v2: new — dedup + rate limiting
│       │   └── why-now.ts            # v2: new — explanation generator
│       ├── poll-schedule/index.ts
│       ├── poll-boxscore/index.ts    # v2: remove inline dispatch
│       ├── poll-pbp/index.ts
│       ├── poll-summary/index.ts
│       ├── poll-odds/index.ts
│       ├── poll-markets/index.ts
│       ├── game-watcher-orchestrator/index.ts  # v2: new
│       ├── alert-engine/index.ts     # v2: new (replaces evaluate-alerts)
│       ├── evaluate-alerts/          # v2: deprecated, kept for backward compat
│       ├── send-push/index.ts        # v2: add delivery_log writes
│       ├── resolve-wagers/index.ts
│       ├── kalshi-proxy/index.ts
│       ├── parse-bet-slip/index.ts
│       ├── ingest-email-wagers/index.ts  # v2: new
│       └── health-check/index.ts     # v2: new
├── package.json
├── app.json
├── tsconfig.json
├── CLAUDE.md                         # This file
└── .github/workflows/ci.yml
```

---

# WHAT IS POSSIBLE vs PARTNERSHIP-DEPENDENT

| Feature | Status | Notes |
|---------|--------|-------|
| Follow-based alerts | Buildable now | No external dependency |
| Wager-based alerts | Buildable now | Manual entry + bet slip scan |
| "Why Now" explanations | Buildable now | Uses existing Sportradar data |
| Streaming deep links | Buildable now | Uses public app schemes |
| Sportsbook Tier C (manual) | Built | Enhance with parlays |
| Sportsbook Tier B (email) | Buildable now | Needs email provider (SendGrid) |
| Sportsbook Tier A (API) | **Partnership required** | DK/FD have no public consumer API |
| Kalshi position sync | Built | User provides API keys |
| Polymarket sync | Partial | Needs CLOB API integration |
| Watch history from streaming | **Not possible** | No streaming service offers this API |
| Automatic bet detection | **Not possible** | Would require scraping (violates ToS) |

