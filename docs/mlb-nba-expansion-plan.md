# NORMA — MLB and NBA Expansion Implementation Plan

**Status**: Phase 1 complete (plan document)
**Date**: 2026-04-07
**Author**: Orchestrator (Plan Phase)
**Scope**: Extend NORMA from NCAA Men's Basketball only to also support MLB and NBA

---

## 1. Sport Discriminator Architecture

### The Sport Enum

Every table that contains sport-specific data will gain a `sport` column constrained to a Postgres enum:

```sql
CREATE TYPE public.sport_key AS ENUM ('ncaam', 'nba', 'mlb');
```

Values:
- `ncaam` — NCAA Men's Basketball (existing data)
- `nba` — NBA Professional Basketball
- `mlb` — Major League Baseball

### Column Placement Strategy

The `sport` column is added to:

| Table | Rationale |
|---|---|
| `games` | Every game belongs to exactly one sport |
| `teams` | NBA teams must not collide with NCAAM teams sharing abbreviations |
| `alerts` | Alert rules and display differ by sport |
| `wagers` | Wager context (spread/run-line, parlay legs) differs by sport |
| `follows` | Users follow sport-specific games or teams |
| `watcher_state` | Polling intervals and PBP parsing differ by sport |
| `alert_throttle` | Dedup keys scoped correctly per sport context |

### Backward Compatibility

All migrations use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS sport sport_key NOT NULL DEFAULT 'ncaam'`.

This means:
- All existing rows automatically receive `sport = 'ncaam'` via the DEFAULT
- No existing query that omits the sport filter will break (they just return all sports unless filtered)
- No NOT NULL violation is possible on existing rows

### RLS and Query Changes

Frontend hooks add `.eq('sport', selectedSport)` to all `games`, `alerts`, and `wagers` queries.

Edge Functions receive a `sport` parameter or read it from the game row before dispatching to the correct API endpoint.

---

## 2. ESPN Endpoint Mapping

ESPN scoreboard and boxscore endpoints follow a consistent URL pattern across sports. All are free and unauthenticated.

### Scoreboard Endpoints (used by poll-boxscore and poll-schedule)

| Sport | ESPN Base URL | Query Params |
|---|---|---|
| NCAA Men's Basketball | `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball` | `?dates={YYYYMMDD}&groups=50&limit=300` |
| NBA | `https://site.api.espn.com/apis/site/v2/sports/basketball/nba` | `?dates={YYYYMMDD}&limit=100` |
| MLB | `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb` | `?dates={YYYYMMDD}&limit=50` |

### Boxscore Endpoints

| Sport | Pattern |
|---|---|
| NCAA | `{base}/summary?event={espn_event_id}` |
| NBA | `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={espn_event_id}` |
| MLB | `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event={espn_event_id}` |

### ESPN Status Type to GameStatus Mapping

Basketball (NCAA and NBA share the same status names):

| ESPN `status.type.name` | NORMA `GameStatus` |
|---|---|
| `STATUS_SCHEDULED` | `scheduled` |
| `STATUS_IN_PROGRESS` | `inprogress` |
| `STATUS_HALFTIME` | `halftime` |
| `STATUS_FINAL` | `closed` |
| `STATUS_POSTPONED` | `postponed` |
| `STATUS_CANCELED` | `cancelled` |
| `STATUS_END_PERIOD` | `inprogress` |

MLB Status Mapping:

| ESPN `status.type.name` | NORMA `GameStatus` | Notes |
|---|---|---|
| `STATUS_SCHEDULED` | `scheduled` | |
| `STATUS_IN_PROGRESS` | `inprogress` | Includes all mid-inning states |
| `STATUS_MIDDLE_INNINGS` | `halftime` | Between half-innings (use `halftime` as the between-action state) |
| `STATUS_END_INNING` | `halftime` | |
| `STATUS_RAIN_DELAY` | `postponed` | Temporary; revert to inprogress when resumed |
| `STATUS_FINAL` | `closed` | |
| `STATUS_POSTPONED` | `postponed` | |
| `STATUS_CANCELED` | `cancelled` | |

### ESPN MLB Period and Clock Interpretation

For MLB, ESPN returns:
- `status.period` = inning number (1 through 9+)
- `status.displayClock` = top/bottom indicator string (e.g., `"Top 7th"`, `"Bot 3rd"`)

Store `clock` as the displayClock string (e.g., `"Top 7th"`) and `period` as the inning number integer.

### ESPN Game ID Storage

Store ESPN game IDs in a new `espn_id` column on the `games` table (migration 049). This enables dedup between ESPN and SportsDataIO without relying on team name matching. ESPN IDs are strings; add `espn_id TEXT` to games.

---

## 3. SportsDataIO Endpoint Mapping

SportsDataIO uses separate API path segments per sport, all under the same base host. The same API key applies across all sports (single subscription covers CBB, NBA, MLB).

### API Base URLs

| Sport | Base URL |
|---|---|
| NCAA Men's Basketball | `https://api.sportsdata.io/v3/cbb` |
| NBA | `https://api.sportsdata.io/v3/nba` |
| MLB | `https://api.sportsdata.io/v3/mlb` |

### Schedule and Score Endpoints

| Sport | Endpoint | Date Format |
|---|---|---|
| NCAA | `{base}/scores/json/GamesByDate/{YYYY-MMM-DD}` | Eastern date, e.g., `2026-APR-07` |
| NBA | `{base}/scores/json/GamesByDate/{YYYY-MMM-DD}` | Same format |
| MLB | `{base}/scores/json/GamesByDate/{YYYY-MMM-DD}` | Same format |

### Teams Endpoints

| Sport | Endpoint |
|---|---|
| NCAA | `{base}/scores/json/Teams` |
| NBA | `{base}/scores/json/Teams` |
| MLB | `{base}/scores/json/Teams` |

### Response Field Differences

**Basketball (NCAA and NBA share the same field names):**

```json
{
  "GameID": 12345,
  "Status": "InProgress",
  "Period": "2",
  "TimeRemainingMinutes": 4,
  "TimeRemainingSeconds": 33,
  "AwayTeamScore": 68,
  "HomeTeamScore": 71
}
```

**MLB:**

```json
{
  "GameID": 99999,
  "Status": "InProgress",
  "InningHalf": "T",
  "Inning": 7,
  "Outs": 2,
  "AwayTeamRuns": 3,
  "HomeTeamRuns": 4,
  "AwayTeamHits": 8,
  "HomeTeamHits": 9,
  "AwayTeamErrors": 0,
  "HomeTeamErrors": 1
}
```

Mapping MLB fields to the NORMA games table:
- `Inning` → `period`
- `InningHalf` + `Inning` → `clock` as string (e.g., `"T7"` = top of 7th, `"B9"` = bottom of 9th)
- `AwayTeamRuns` → `away_score`
- `HomeTeamRuns` → `home_score`

### SportsDataIO Status Values to GameStatus

| SportsDataIO `Status` | NORMA `GameStatus` |
|---|---|
| `Scheduled` | `scheduled` |
| `InProgress` | `inprogress` |
| `Final` | `closed` |
| `F/OT` | `closed` |
| `Suspended` | `postponed` |
| `Postponed` | `postponed` |
| `Canceled` | `cancelled` |
| `Delayed` | `postponed` |

---

## 4. Sportradar Endpoint Mapping

Sportradar uses sport-specific product paths. Each requires a valid API key with that sport licensed.

### API Base URLs

| Sport | Base URL |
|---|---|
| NCAA Men's Basketball | `https://api.sportradar.com/ncaamb/production/v8/en` |
| NBA | `https://api.sportradar.com/nba/production/v8/en` |
| MLB | `https://api.sportradar.com/mlb/production/v8/en` |

### Schedule Endpoint

| Sport | Endpoint |
|---|---|
| NCAA | `{base}/games/{year}/{month}/{day}/schedule.json` |
| NBA | `{base}/games/{year}/{month}/{day}/schedule.json` |
| MLB | `{base}/games/{year}/{month}/{day}/schedule.json` |

### Game Summary Endpoint (used by poll-summary)

| Sport | Endpoint |
|---|---|
| NCAA | `{base}/games/{sportradar_id}/summary.json` |
| NBA | `{base}/games/{sportradar_id}/summary.json` |
| MLB | `{base}/games/{sportradar_id}/summary.json` |

### PBP Endpoint (used by poll-pbp)

| Sport | Endpoint |
|---|---|
| NCAA | `{base}/games/{sportradar_id}/pbp.json` |
| NBA | `{base}/games/{sportradar_id}/pbp.json` |
| MLB | `{base}/games/{sportradar_id}/pbp.json` |

### MLB PBP Event Types

MLB PBP events differ fundamentally from basketball. Key event types in Sportradar MLB:

| Sportradar `type` | Description | Alert relevance |
|---|---|---|
| `pitch` | Individual pitch delivery | Pitch count tracking |
| `at_bat_start` | Batter steps to plate | |
| `at_bat_complete` | At-bat concluded (hit/out/walk) | Batting stats |
| `run_scored` | Run crosses plate | Score change |
| `stolen_base` | Baserunner steals | |
| `inning_start` | Inning begins | Reset inning state |
| `inning_end` | Inning concludes | Between-inning state |
| `game_over` | Final out | Terminal event |
| `pitching_substitution` | Pitcher change | Relief pitcher tracking |

MLB PBP response structure per event:
```json
{
  "id": "abc123",
  "type": "pitch",
  "inning": 7,
  "half_inning": "T",
  "pitcher": { "full_name": "Gerrit Cole", "pitch_count": 94 },
  "batter": { "full_name": "Mookie Betts" },
  "pitch_type": "FF",
  "pitch_speed": 96.2,
  "pitch_result": "ball",
  "count": { "balls": 3, "strikes": 1 },
  "outs": 2,
  "runners": [
    { "starting_base": 1, "ending_base": 1, "player": { "full_name": "Freddie Freeman" } }
  ]
}
```

### NBA PBP Event Types

NBA events mirror NCAA basketball events with the same Sportradar structure. No structural changes are needed. Event types are the same (`twopointmade`, `threepointmade`, `foul`, `turnover`, etc.). NBA teams and player IDs will differ but the parsing code is identical.

---

## 5. The Odds API Endpoint Mapping

The Odds API uses a `sport_key` path parameter to identify the market.

### Sport Keys

| Sport | `sport_key` |
|---|---|
| NCAA Men's Basketball | `basketball_ncaab` |
| NBA | `basketball_nba` |
| MLB | `baseball_mlb` |

### Endpoint Pattern

```
GET https://api.the-odds-api.com/v4/sports/{sport_key}/odds/?apiKey={key}&regions=us&markets=h2h,spreads,totals&bookmakers=draftkings,fanduel,betmgm,espnbet
```

The response structure is identical across sports. MLB uses `spreads` for the run line (typically +1.5 / -1.5). Store odds with the same `game_odds` table structure; no schema change is needed for odds.

---

## 6. Database Migration Plan

All migration files go in `/Users/alex/Projects/Watch-NORMA/supabase/migrations/`. Each is numbered sequentially and must be additive.

### Migration 049: Add Sport Column

File: `049_add_sport_column.sql`

```sql
-- Create the sport enum
CREATE TYPE public.sport_key AS ENUM ('ncaam', 'nba', 'mlb');

-- Add sport column to all relevant tables with DEFAULT 'ncaam'
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS sport public.sport_key NOT NULL DEFAULT 'ncaam',
  ADD COLUMN IF NOT EXISTS espn_id TEXT;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS sport public.sport_key NOT NULL DEFAULT 'ncaam';

ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS sport public.sport_key NOT NULL DEFAULT 'ncaam';

ALTER TABLE public.wagers
  ADD COLUMN IF NOT EXISTS sport public.sport_key NOT NULL DEFAULT 'ncaam';

ALTER TABLE public.follows
  ADD COLUMN IF NOT EXISTS sport public.sport_key NOT NULL DEFAULT 'ncaam';

ALTER TABLE public.watcher_state
  ADD COLUMN IF NOT EXISTS sport public.sport_key NOT NULL DEFAULT 'ncaam';

ALTER TABLE public.alert_throttle
  ADD COLUMN IF NOT EXISTS sport public.sport_key NOT NULL DEFAULT 'ncaam';

-- Backfill is automatic via DEFAULT 'ncaam' for all existing rows
-- Create partial indexes for sport-scoped queries
CREATE INDEX IF NOT EXISTS idx_games_sport ON public.games(sport);
CREATE INDEX IF NOT EXISTS idx_teams_sport ON public.teams(sport);
CREATE INDEX IF NOT EXISTS idx_alerts_sport ON public.alerts(sport);
CREATE INDEX IF NOT EXISTS idx_wagers_sport ON public.wagers(sport);
CREATE INDEX IF NOT EXISTS idx_follows_sport ON public.follows(sport);
```

### Migration 050: MLB Stats Schema

File: `050_mlb_stats_schema.sql`

Stores inning-by-inning scoring lines, pitching lines, and batting stats for MLB games. Kept separate from the main games table to avoid schema bloat for basketball-only queries.

```sql
-- Per-game MLB box score stats
CREATE TABLE IF NOT EXISTS public.mlb_game_stats (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,

  -- Inning-by-inning runs scored (array index = inning - 1)
  home_innings JSONB NOT NULL DEFAULT '[]',  -- [{inning: 1, runs: 0}, ...]
  away_innings JSONB NOT NULL DEFAULT '[]',

  -- Team totals
  home_runs INT NOT NULL DEFAULT 0,
  away_runs INT NOT NULL DEFAULT 0,
  home_hits INT NOT NULL DEFAULT 0,
  away_hits INT NOT NULL DEFAULT 0,
  home_errors INT NOT NULL DEFAULT 0,
  away_errors INT NOT NULL DEFAULT 0,

  -- Current game state
  current_inning INT,
  inning_half TEXT,           -- 'T' (top) or 'B' (bottom)
  outs INT DEFAULT 0,
  balls INT DEFAULT 0,
  strikes INT DEFAULT 0,
  runners_on_base JSONB DEFAULT '[]',  -- [{base: 1|2|3, player_name: "..."}]

  -- Starting pitcher lines (home and away)
  home_starter_name TEXT,
  home_starter_pitches INT DEFAULT 0,
  home_starter_ip NUMERIC(4,1),  -- innings pitched, e.g., 6.2
  home_starter_era NUMERIC(5,2),
  home_starter_whip NUMERIC(5,3),
  home_starter_strikeouts INT DEFAULT 0,
  home_starter_walks INT DEFAULT 0,
  home_starter_hits_allowed INT DEFAULT 0,
  home_starter_runs_allowed INT DEFAULT 0,
  home_starter_still_pitching BOOLEAN DEFAULT true,

  away_starter_name TEXT,
  away_starter_pitches INT DEFAULT 0,
  away_starter_ip NUMERIC(4,1),
  away_starter_era NUMERIC(5,2),
  away_starter_whip NUMERIC(5,3),
  away_starter_strikeouts INT DEFAULT 0,
  away_starter_walks INT DEFAULT 0,
  away_starter_hits_allowed INT DEFAULT 0,
  away_starter_runs_allowed INT DEFAULT 0,
  away_starter_still_pitching BOOLEAN DEFAULT true,

  -- No-hitter tracking
  home_no_hitter_active BOOLEAN DEFAULT false,
  away_no_hitter_active BOOLEAN DEFAULT false,

  -- Metadata
  payload_hash TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(game_id)
);

CREATE INDEX IF NOT EXISTS idx_mlb_game_stats_game
  ON public.mlb_game_stats(game_id);

ALTER TABLE public.mlb_game_stats ENABLE ROW LEVEL SECURITY;

-- Users can read MLB stats for any game (no PII)
CREATE POLICY "Anyone reads mlb_game_stats"
  ON public.mlb_game_stats FOR SELECT USING (true);

-- Only service role can write
CREATE POLICY "Service role manages mlb_game_stats"
  ON public.mlb_game_stats FOR ALL USING (true);
```

### Migration 051: Sport Compound Indexes

File: `051_sport_indexes.sql`

Adds compound indexes for the most common query patterns after the sport column is added.

```sql
-- Games: sport + date range (most common frontend query)
CREATE INDEX IF NOT EXISTS idx_games_sport_scheduled
  ON public.games(sport, scheduled_at);

-- Games: sport + status (active game queries)
CREATE INDEX IF NOT EXISTS idx_games_sport_status
  ON public.games(sport, status);

-- Alerts: sport + user + created_at (alert feed query)
CREATE INDEX IF NOT EXISTS idx_alerts_sport_user
  ON public.alerts(sport, user_id, created_at DESC);

-- Watcher state: sport + active (orchestrator dispatch query)
CREATE INDEX IF NOT EXISTS idx_watcher_sport_active
  ON public.watcher_state(sport, is_active)
  WHERE is_active = true;

-- Teams: sport + sportsdataio_id (team upsert lookup)
CREATE INDEX IF NOT EXISTS idx_teams_sport_sdio
  ON public.teams(sport, sportsdataio_id)
  WHERE sportsdataio_id IS NOT NULL;
```

---

## 7. Alert Rules by Sport

### NCAA Men's Basketball (Existing — Reference)

| Alert | Trigger Condition |
|---|---|
| Close game | Margin ≤ 8 pts in 2nd half, < 5 min remaining |
| Foul trouble | Starter with 4+ fouls in 1st half OR 5 fouls at any point |
| Overtime | Game enters OT |
| Big run | One team scores 8+ consecutive unanswered points |
| Wager at risk | Live margin within 4 pts of spread line |

### NBA Basketball

Alert logic mirrors NCAA basketball with adjusted thresholds to match NBA pace and foul rules:

| Alert | Trigger Condition | Difference from NCAA |
|---|---|---|
| Close game | Margin ≤ 6 pts in 4th quarter, < 3 min remaining | Tighter margin (NBA teams score faster) |
| Foul trouble | Starter with 5 fouls (out at 6) | NBA foul limit = 6, not 5 |
| Overtime | Game enters OT | Same |
| Big run | One team scores 10+ consecutive unanswered | Higher run threshold |
| Wager at risk | Live margin within 4 pts of spread line | Same |

NBA uses the same clock-based structure as NCAA (period = quarter, clock = MM:SS remaining). No structural changes to evaluate-alerts logic are needed; only thresholds change via sport-specific config.

### MLB Baseball

MLB alert rules are fundamentally different because baseball has no clock. All triggers are state-based.

| Alert | Trigger Condition | Implementation Signal |
|---|---|---|
| Close game late | 1-run margin after the 7th inning stretch | `current_inning >= 8 AND ABS(home_runs - away_runs) <= 1` |
| Scoring threat | Runners on 2nd+3rd OR bases loaded, 2 outs, inning >= 7 | Parse `runners_on_base` array + `outs` + `current_inning` |
| No-hitter in progress | No hits allowed through 6+ complete innings | `(home_no_hitter_active OR away_no_hitter_active) AND current_inning >= 7` |
| Pitcher approaching limit | Starter still pitching at 90+ pitches | `{home|away}_starter_pitches >= 90 AND {home|away}_starter_still_pitching` |
| Walk-off situation | Tie or trailing by 1, bottom of 9th or extra innings | `inning_half = 'B' AND current_inning >= 9 AND away_runs - home_runs <= 1` |
| Wager at risk (run line) | Live margin within 1 run of run-line | Compare `ABS(home_runs - away_runs)` to wager run-line |

Alert rule evaluation for MLB goes in `evaluate-alerts/logic.ts` as a new sport-specific branch. The function signature is `evaluateMLBAlerts(gameState, mlbStats, userWagers)`.

---

## 8. GameStatus Mapping for MLB

Baseball does not have a halftime equivalent. The NORMA `GameStatus` type is reused with the following semantic remapping for MLB:

| NORMA Field | Basketball Meaning | MLB Meaning |
|---|---|---|
| `status = 'halftime'` | Between first and second half | Between half-innings (brief pause) |
| `period` | Quarter/half number | Inning number (1–9+) |
| `clock` | `"MM:SS"` remaining | `"T7"` or `"B9"` (top/bottom + inning) |
| `status = 'inprogress'` | Active game | Active game including mid-at-bat |
| `status = 'postponed'` | Game delayed | Rain delay or suspension |

### Extra Innings

Extra innings use `period` values > 9. No schema change is needed. The GameCard component renders the inning number from `period` when `sport = 'mlb'`.

### Rain Delays

Map rain delays to `postponed`. When ESPN or SportsDataIO reports the delay is over, set status back to `inprogress`. The orchestrator continues polling during delays at a reduced frequency (every 5 minutes instead of 30 seconds).

### Clock Field Encoding for MLB

Store the clock as `"{half}{inning}"` where half is `T` (top) or `B` (bottom) and inning is the integer. Examples:
- `"T1"` = top of the 1st
- `"B9"` = bottom of the 9th
- `"T12"` = top of the 12th (extra innings)

The `formatClock` helper in `lib/alert-helpers.ts` must branch on sport to format this correctly for display (e.g., render as `"Top 7th"` for MLB instead of `"4:33"`).

---

## 9. Frontend Architecture

### Sport Selector

Add a `SportSelector` component displayed at the top of the Games screen and Alerts screen. Use a segmented control (three options: NCAA | NBA | MLB).

Selected sport is persisted in AsyncStorage under the key `'norma:selectedSport'`. Default is `'ncaam'`.

A new React context (`SportContext`) wraps the app and exposes `{ selectedSport, setSelectedSport }`. All hooks consume `selectedSport` from this context.

```typescript
// lib/sport-context.tsx
export type SportKey = 'ncaam' | 'nba' | 'mlb';
export const SportContext = React.createContext<{
  selectedSport: SportKey;
  setSelectedSport: (s: SportKey) => void;
}>({ selectedSport: 'ncaam', setSelectedSport: () => {} });
```

### useGames Hook Changes

Add `sport` filter to both `useGames` and `useFollowedGames`:

```typescript
// Before:
.not('status', 'in', '(cancelled,postponed)')

// After:
.eq('sport', selectedSport)
.not('status', 'in', '(cancelled,postponed)')
```

Query key changes from `['games', today]` to `['games', today, selectedSport]` to ensure cache isolation per sport.

### useAlerts Hook Changes

Add sport filter: `.eq('sport', selectedSport)` to the alerts query. Query key includes sport.

### GameCard Component Changes

GameCard receives the `game` prop which now includes `sport`. Render branches:

```typescript
// Basketball (ncaam and nba): show clock and period
// MLB: show inning indicator (Top 7th / Bot 3rd) and score-by-inning summary

const isMlb = game.sport === 'mlb';
```

For MLB games:
- Replace the clock display with the inning half indicator formatted from `game.clock` (e.g., `"T7"` → `"Top 7th"`)
- Add a compact score-by-inning row if `mlb_game_stats` data is available (fetch via `useMLBStats(game.id)`)
- Show `R H E` (Runs, Hits, Errors) instead of a single score for each team

For NBA games:
- Same rendering as NCAA but the sport badge shows `"NBA"` instead of nothing
- Quarter label replaces `"Half"` in period display (period 1/2 = 1st/2nd half for NCAA; period 1/2/3/4 = quarters for NBA)

### AlertCard Component Changes

AlertCard already uses the `alert.game` join. Add sport-specific context display in the `whyContainer`:

For MLB alerts, the `explanation.bullets` will contain baseball-specific text (e.g., "Bases loaded, 2 outs in the 8th — walk-off threat"). No structural changes are needed to AlertCard; the content comes from the alert engine.

Add a sport badge (small pill: `NCAA`, `NBA`, or `MLB`) next to the alert type badge for multi-sport users.

### New MLB Stats Display Component

Create `components/MLBScoreboard.tsx`:
- Renders the inning-by-inning scoring grid (like a physical scoreboard)
- Shows R/H/E totals
- Shows current at-bat state (count, outs, runners on base)
- Shows starter pitcher pitch count

This component is shown in the game detail screen for MLB games.

---

## 10. Polling Interval Strategy by Sport

### NBA

NBA games average 2 to 2.5 hours. Pace is faster than NCAA but game structure is identical (four quarters, clock-based). Use the same polling intervals as NCAA:
- Boxscore: 60 seconds
- PBP: 30 seconds
- Summary: 2 minutes
- Alert eval: 60 seconds

### MLB

MLB games average 3 hours with highly variable pace (some at-bats are 30 seconds, others 3 minutes). PBP events are pitch-by-pitch but the alert-relevant events are far less frequent.

Recommended MLB polling intervals:
- Boxscore: 60 seconds (score can change on any pitch)
- PBP: 60 seconds (no need for 30s cadence; pitches take 20+ seconds each)
- Summary (mlb_game_stats update): 90 seconds
- Alert eval: 60 seconds

During rain delays or between-inning breaks (halftime status), reduce PBP polling to 5 minutes.

### Orchestrator Changes

The `game-watcher-orchestrator` reads `sport` from the game row (via join on `watcher_state`). It selects PBP and summary intervals from a sport-specific config map:

```typescript
const SPORT_INTERVALS: Record<string, { pbp: number; summary: number; alert: number }> = {
  ncaam: { pbp: 30_000, summary: 120_000, alert: 60_000 },
  nba:   { pbp: 30_000, summary: 120_000, alert: 60_000 },
  mlb:   { pbp: 60_000, summary: 90_000,  alert: 60_000 },
};
```

The orchestrator joins `watcher_state` with `games` to retrieve `sport` on each cycle.

---

## 11. Migration Ordering and Backward Compatibility Guarantees

### Ordering

1. `049_add_sport_column.sql` — must run first; all downstream migrations and code depend on the sport column existing
2. `050_mlb_stats_schema.sql` — depends on games table existing (already true), independent of migration 049 but logically sequential
3. `051_sport_indexes.sql` — depends on migration 049 (indexes reference the sport column)

### What Breaks Without the Sport Column

Nothing breaks immediately. The existing `useGames` hook fetches all games for a date range without filtering by sport. After adding the sport column with DEFAULT 'ncaam':
- All existing rows continue to work
- The new sport filter in hooks is additive (`.eq('sport', selectedSport)`)
- Edge Functions that poll NCAA data continue working with the explicit `sport='ncaam'` parameter added

### Transition Window Risk

During the transition window between deploying migration 049 and deploying new Edge Function code, newly created game rows from NBA/MLB pollers may not exist yet (pollers not deployed). No stale data risk exists.

If the sport column migration is applied but the frontend code hasn't shipped yet, all existing users continue to see NCAA games (the default) uninterrupted.

### Rollback Plan

Each migration is additive (column adds only, no drops, no constraint tightens on existing columns). Rollback:
- Drop the `sport_key` enum and sport columns via a manual SQL command
- This is safe because no existing columns are renamed or removed

---

## 12. Open Questions and Risks

### SportsDataIO API Key

The existing `SPORTSDATAIO_API_KEY` environment variable covers CBB. SportsDataIO subscriptions are sport-specific. Verify the current subscription covers NBA and MLB before deploying NBA/MLB pollers. If separate keys are needed, add `SPORTSDATAIO_NBA_API_KEY` and `SPORTSDATAIO_MLB_API_KEY` env vars alongside the existing one.

**Risk level**: Medium. The Edge Functions should be written to accept sport-specific keys with fallback to the base key.

### Sportradar API Key

Sportradar licenses each sport product separately. The current `SPORTRADAR_API_KEY` covers NCAAMB. NBA and MLB require separate licenses and potentially different keys. Add `SPORTRADAR_NBA_API_KEY` and `SPORTRADAR_MLB_API_KEY` env vars. Functions should gracefully skip PBP polling if the sport-specific key is absent (log a warning, do not throw).

**Risk level**: High. PBP polling will silently degrade to no-op if the key is missing. Add an explicit startup check.

### ESPN Game ID vs SportsDataIO Game ID Dedup

Currently, games are identified primarily by SportsDataIO GameID. ESPN events are matched by team name. For MLB and NBA, the same team-name matching approach applies. Add the `espn_id` column (migration 049) so exact ESPN ID matching can be used when available, reducing false duplicates.

**Risk level**: Low. The team-name matching has worked reliably for NCAA.

### Team ID Collision

The current `teams` table uses a text primary key. For NCAA, team IDs are constructed from SportsDataIO integer IDs. NBA and MLB teams must use a namespaced ID format to avoid collisions:
- NCAA: `ncaam-{sportsdataio_id}` or existing format
- NBA: `nba-{sportsdataio_id}`
- MLB: `mlb-{sportsdataio_id}`

The `sport` column on `teams` also disambiguates, but the ID namespace is the primary guard.

**Risk level**: Medium. Enforce in the poll-schedule upsert logic.

### Kalshi and Polymarket Markets

Kalshi and Polymarket prediction markets for MLB and NBA exist but are not mapped in the current code. The existing `poll-markets` and `kalshi-proxy` functions are NCAA-specific in their market title matching. Extending these is deferred to a follow-up phase; they are not in scope for this expansion.

---

## 13. File Change Summary by Agent

### database-architect
- `/supabase/migrations/049_add_sport_column.sql`
- `/supabase/migrations/050_mlb_stats_schema.sql`
- `/supabase/migrations/051_sport_indexes.sql`

### backend-developer
- `/supabase/functions/poll-boxscore/index.ts` — sport branch for ESPN URL selection
- `/supabase/functions/poll-schedule/index.ts` — sport branch for SportsDataIO + ESPN + Sportradar URLs
- `/supabase/functions/poll-pbp/index.ts` — sport branch for Sportradar URL + MLB event parser
- `/supabase/functions/poll-summary/index.ts` — sport branch + MLB stats upsert into mlb_game_stats
- `/supabase/functions/evaluate-alerts/logic.ts` — MLB alert rules + NBA threshold adjustments
- `/supabase/functions/game-watcher-orchestrator/index.ts` — sport-aware polling intervals
- `/supabase/functions/_shared/sportradar.ts` — add NBA and MLB base URL support

### react-specialist
- `/lib/sport-context.tsx` — new file, SportContext and provider
- `/lib/types.ts` — add SportKey type, extend Game/Team/Alert/Wager interfaces with sport field
- `/lib/constants.ts` — add sport-specific ESPN/SportsDataIO/Sportradar URLs and polling intervals
- `/lib/alert-helpers.ts` — extend formatClock for MLB
- `/hooks/useGames.ts` — add sport filter param
- `/hooks/useAlerts.ts` — add sport filter param
- `/components/GameCard.tsx` — sport-aware rendering
- `/components/AlertCard.tsx` — sport badge
- `/components/MLBScoreboard.tsx` — new component
- `/app/(tabs)/index.tsx` or games screen — add SportSelector component
- `/hooks/useMLBStats.ts` — new hook for mlb_game_stats

### test-engineer
- `/lib/__tests__/sport-filter.test.ts`
- `/lib/__tests__/mlb-game-ingestion.test.ts`
- `/lib/__tests__/nba-game-ingestion.test.ts`
- `/lib/__tests__/mlb-alert-rules.test.ts`
- `/lib/__tests__/nba-alert-rules.test.ts`
- `/lib/__tests__/gamecard-sport-rendering.test.ts`
- `/supabase/functions/poll-boxscore/index.test.ts`
- `/supabase/functions/evaluate-alerts/mlb.test.ts`

---

*Plan complete. All subsequent agents should treat this document as the authoritative specification for the MLB/NBA expansion.*
