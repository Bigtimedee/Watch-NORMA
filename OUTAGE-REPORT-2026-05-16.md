# NORMA Game Connectivity Outage — Diagnostic Report

**Date:** May 16, 2026  
**Severity:** P0 — Complete loss of live game updates  
**Impact:** 140 games orphaned (92 MLB, 23 NBA, 37 NCAA)  
**Duration:** April 9 – May 16, 2026 (~37 days)  
**Status:** RESOLVED

---

## Executive Summary

All NBA, MLB, and NCAA games suddenly stopped receiving live updates because `poll-boxscore` was writing invalid status values to the database. Games became permanently invisible to all polling systems, freezing scores, preventing wager resolution, and breaking alerts.

The root cause was a single line of code in `poll-boxscore/index.ts` that read ESPN's machine-code status field (`status.type.name` → "STATUS_IN_PROGRESS") instead of the human-readable field (`status.type.description` → "In Progress"). The status mapping function couldn't parse machine codes, so it stored them raw. Once stored, no polling system could ever find those games again.

---

## Root Cause Analysis

### The Bug: Wrong ESPN Field (poll-boxscore/index.ts, line 118)

```typescript
// BEFORE (BROKEN):
status: comp.status?.type?.name ?? comp.status?.type?.description ?? "Unknown",

// AFTER (FIXED):
status: comp.status?.type?.description ?? comp.status?.type?.name ?? "Unknown",
```

ESPN's response contains two status fields:
- `status.type.description` = `"In Progress"` (human-readable, maps correctly)
- `status.type.name` = `"STATUS_IN_PROGRESS"` (machine code, cannot be mapped)

The code prioritized `.name` over `.description`, feeding machine codes into `mapStatus()`.

### The Amplifier: Brittle Status Mapping (_shared/utils.ts, lines 14-25)

```typescript
// BEFORE (BROKEN): Exact equality only
export function mapStatus(sdioStatus: string, isClosed: boolean): string {
  const s = sdioStatus?.toLowerCase() ?? "";
  if (s === "inprogress" || s === "in progress") return "inprogress";  // "status_in_progress" ≠ "inprogress"
  // ... more exact checks ...
  return s || "scheduled";  // ← Falls through, returns raw "status_in_progress"
}
```

When `"STATUS_IN_PROGRESS"` was lowercased to `"status_in_progress"`:
- `"status_in_progress" === "inprogress"` → **FALSE**
- `"status_in_progress" === "in progress"` → **FALSE**
- Falls through → returns raw `"status_in_progress"` to be stored in DB

### The Cascade: Permanent Game Orphaning

Once a game had `status = "status_in_progress"` in the database:

1. **poll-boxscore (line 213)** queries:
   ```sql
   WHERE status IN ('inprogress', 'halftime')
   ```
   → "status_in_progress" does NOT match → game is NEVER updated again

2. **game-watcher-orchestrator (line 79)** queries:
   ```sql
   WHERE status IN ('inprogress', 'halftime')
   ```
   → Same miss → no PBP, no summary, no alerts dispatched

3. **Game frozen permanently**: scores stale, never transitions to "closed", wagers never resolve

### Timeline of Corruption

| Date | Event |
|------|-------|
| ~Apr 9, 2026 | First NBA game gets `status_in_progress` (earliest orphaned NBA game) |
| ~Apr 10, 2026 | First MLB game gets `status_in_progress` (earliest orphaned MLB game) |
| Feb 26 – Mar 21 | NCAA games stored with `end of period` (similar mapping failure) |
| Apr 15–18 | 3 NBA games stored with `status_halftime` |
| Apr 23 | 1 NBA game stored with `status_scheduled` |
| May 16 | Outage diagnosed and fixed |

### Why poll-schedule Was Unaffected

`poll-schedule/index.ts` uses `comp.status?.type?.description` (line 176 for NCAA, line 621 for multi-sport) which returns the human-readable format. It also uses `mapEspnStatusMulti()` which does `.includes()` matching — more resilient.

So games were CREATED with correct status by poll-schedule, then CORRUPTED by poll-boxscore on the very next update cycle.

---

## Database State (Before Fix)

```sql
-- Non-standard statuses found in production:
ncaam | "end of period"      | 37 games (Feb 26 – Mar 21)
ncaam | "delayed"            |  7 games (Mar 14)
nba   | "status_in_progress" | 19 games (Apr 9 – May 16)
nba   | "status_halftime"    |  3 games (Apr 15 – Apr 18)
nba   | "status_scheduled"   |  1 game  (Apr 23)
mlb   | "status_in_progress" | 73 games (Apr 10 – May 16)
```

---

## Fix Applied (4 Layers of Defense)

### Layer 1: Source Fix (poll-boxscore/index.ts, line 118)
Swapped field priority: `type.description` first, `type.name` as fallback.

### Layer 2: Resilient mapStatus() (_shared/utils.ts)
Complete rewrite with:
- `status_` prefix stripping for ESPN machine codes
- `.includes()` fallback matching
- Guaranteed canonical output (never returns raw values)
- Warning log for unrecognized inputs

### Layer 3: Database Constraint (migration 057)
```sql
ALTER TABLE games ADD CONSTRAINT games_status_valid
  CHECK (status IN ('scheduled','inprogress','halftime','closed','cancelled','postponed'));
```
Even if application code regresses, the DB rejects invalid writes at the constraint level.

### Layer 4: Query Expansion (poll-boxscore/index.ts, line 213)
Temporarily includes orphaned status values in the active-game query so previously-stuck games get healed on next poll cycle.

### Database Healed
```sql
-- 140 orphaned games normalized:
UPDATE games SET status = 'closed' WHERE status IN ('status_in_progress','status_halftime','end of period') AND scheduled_at < now() - interval '6 hours';
UPDATE games SET status = 'inprogress' WHERE status = 'status_in_progress' AND scheduled_at >= now() - interval '6 hours';
UPDATE games SET status = 'scheduled' WHERE status IN ('status_scheduled', 'delayed');
```

---

## Verification

### Database State (After Fix)
```
ncaam: 1182 closed, 7 scheduled (offseason — correct)
nba:   143 closed, 1 scheduled (playoffs off-day — correct)
mlb:   498 closed, 8 inprogress, 2 scheduled, 6 postponed (active season — correct)
```

### Test Results
24/24 mapStatus() tests pass covering:
- All ESPN machine codes (STATUS_IN_PROGRESS, STATUS_HALFTIME, etc.)
- All ESPN descriptions (In Progress, Final, etc.)
- All SportsDataIO formats (InProgress, F, F/OT, etc.)
- Edge cases (empty, null, unknown values)
- Invariant: output is ALWAYS one of 6 canonical values

---

## Prevention Strategy

1. **DB constraint** prevents invalid writes at the database level (final safeguard)
2. **mapStatus() invariant** guarantees only canonical values are ever returned
3. **Test file** (`lib/__tests__/mapStatus.test.ts`) covers all known ESPN formats
4. **Rule documented**: Always use `type.description` from ESPN, never `type.name`
5. **Query expansion** in poll-boxscore heals any residual non-standard values

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/poll-boxscore/index.ts` | Line 118: field priority swap; Line 213: expanded query filter |
| `supabase/functions/_shared/utils.ts` | Complete `mapStatus()` rewrite with prefix stripping + fallback matching |
| `supabase/migrations/057_games_status_constraint.sql` | New: CHECK constraint + healing queries |
| `lib/__tests__/mapStatus.test.ts` | New: 24-case regression test suite |

---

## Lessons Learned

1. **ESPN's undocumented API has two status representations** — `type.name` (machine) vs `type.description` (human). They look similar but have completely different formats. Always use `description`.

2. **Status mapping functions must be total functions** — they should map ANY input to a valid output. The old `return s || "scheduled"` leaked raw values when `s` was truthy but unrecognized.

3. **Database constraints are the last line of defense** — application-level validation can always have bugs. A CHECK constraint makes data corruption physically impossible.

4. **Silent failures compound over time** — this bug ran for 37 days because games simply stopped updating without any visible error. Monitoring for "games stuck in non-terminal status for >4 hours" would have caught this immediately.
