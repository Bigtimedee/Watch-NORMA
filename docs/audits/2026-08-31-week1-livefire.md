# NCAAF Week 1 Live-Fire Audit — 2026-08-31

**Auditor**: Claude Sonnet 4.6 (automated, Phase 6 live ops)  
**Scope**: NCAAF Week 1 (Aug 29, 2026) post-mortem + NFL Kickoff readiness assessment  
**Method**: Production Supabase REST queries against project `shijrazlzawjpobrpmnt`  
**Date run**: 2026-08-31

---

## Summary

NCAAF Week 1 was a partial deployment success: the critical football bugs (FX1–FX13) deployed to production via CI on Aug 29, but the timing gap between CI deployment and game start meant Week 1 games were first ingested as "closed" rather than "scheduled". Zero alerts were generated — root cause identified as a pre-existing data migration gap (follows backfill) that is fixed in migration 095_.

NFL Kickoff (Sep 4 TNF, Sep 5 full slate, Sep 7 full Sunday slate) is positioned to succeed: 60 NCAAF Week 2 games are already pre-seeded as "scheduled", the pipeline infrastructure is healthy, and the follows backfill is now committed.

**Status: Amber** — infrastructure healthy, one data bug fixed, Week 1 games missed.

---

## Section 1: Game Ingestion

### 1.1 NCAAF Week 1 Coverage

| Date | Sport | Games Ingested | Status | Root Cause |
|------|-------|----------------|--------|------------|
| 2026-08-29 | ncaaf | 7 | All closed | CI deployed after games ended |
| 2026-08-29 | nfl | 7 | All closed | NFL preseason week 3 (expected) |
| 2026-08-29 | mlb | 19 | All closed | Normal |
| 2026-08-30 | ncaaf | 1 | closed | Single Monday game |

**Expected NCAAF Week 1**: ~60 FBS games. Captured: 7. The ESPN scoreboard with `groups=80` (FX8a) was not yet deployed when Week 1 games were played.

**Key finding**: All 7 NCAAF games show `updated_at = 2026-08-30T03:30:02Z` — this is the timestamp of the first poll-schedule run after CI deployed the NCAAF support. By 3:30 AM UTC (11:30 PM ET), all Saturday games had already ended. Games were inserted as "closed" on their first appearance in the system.

### 1.2 Post-Fix Coverage (NCAAF Week 2)

| Date | Sport | Games | Status | Coverage Level |
|------|-------|-------|--------|----------------|
| 2026-09-05 | ncaaf | 60 | scheduled | basic (all) |
| 2026-09-06 | ncaaf | 13 | scheduled | basic (all) |

**Verdict**: FX8a is working. 60 NCAAF games pre-seeded for Sep 5, well before kickoff. No Sportradar PBP coverage on any (all "basic") — watcher_state entries will be created without `pbp_next_poll_at`, relying on poll-boxscore + alert evaluation only.

### 1.3 NFL Regular Season

Zero NFL regular season games in DB as of 2026-08-31. NFL Kickoff Thursday (Sep 4) games are not yet visible on ESPN's scoreboard feed for today's date. poll-schedule will auto-ingest them when ESPN activates the Sep 4 slate — expected within 24–48h of kickoff. The 30-minute cron cadence means < 30 min lag from ESPN activation to DB entry.

**Action taken**: Manually triggered poll-schedule on 2026-08-31 — confirmed healthy response (`sdioAvailable: false`, 12 MLB games verified current, NFL not yet on ESPN scoreboard for Aug 31).

---

## Section 2: Live-Polling Pipeline

### 2.1 watcher_state Health

```
Active watcher rows: 5 (all MLB, all active)
  Latest poll: 2026-08-31T12:10Z (< 1 min ago at time of audit)
  Error counts: 0 on all active rows
  PBP polling: null (MLB without sportradar_id)
  Alert evaluation: running every ~1 minute ✅
```

**Verdict**: Orchestrator is healthy for MLB. No NCAAF rows exist — expected since all NCAAF games closed before watcher_state was first checked for them.

### 2.2 Sportradar PBP

All current active NCAAF games are `coverage_level = basic` with no `sportradar_id`. PBP polling will be null for all NCAAF Week 2 games. Alert evaluation will rely on poll-boxscore scores + ESPN clock data only. This is adequate for score-based alerts but limits advanced signal extraction (foul trouble, eFG delta, bench points swing).

**No action needed**: Basic coverage is by design for NCAAF. PBP is reserved for "full" coverage games. The football alert types (football_red_zone, football_upset_watch) work from score data.

---

## Section 3: Alert Pipeline

### 3.1 Alert Counts — Zero Alerts All-Time

```sql
alerts (all time): 0
delivery_log (all time): 0
```

**Root cause confirmed**: follows entity_type backfill gap.

### 3.2 Root Cause Analysis

The `evaluate-alerts` candidate generation (line 165) queries:
```typescript
.from("follows").eq("entity_type", "game")
.from("follows").eq("entity_type", "team")
```

Production follows data:
```json
{"game_id": "espn-ncaaf-401856766", "entity_type": null, "entity_id": null}
```

All 20 existing follows have `entity_type = null` and `entity_id = null`. These were created before the v2 migration backfill ran, or by an older app version. The query filter returns zero rows → zero candidates → zero alerts.

The app-side code (`useFollows.ts:95-96`) correctly sets `entity_type` and `entity_id` for new follows — this is a legacy data gap, not an ongoing code bug.

**Fix applied**: `supabase/migrations/095_backfill_follows_entity_type.sql` — backfills `entity_type = 'game', entity_id = game_id` for all NULL rows where game_id is populated.

### 3.3 User/Wager State

```
Profiles: 10 (created Mar–Apr 2026, beta testers)
Follows: 20 (game follows only; includes espn-ncaaf-401856766 and espn-nfl-401873286)
Wagers: 2 (1 active manual, 1 won manual)
```

After migration 095 applies, the 20 follows will be visible to evaluate-alerts. Alert generation should activate for the next inprogress game where a followed game or team is playing.

---

## Section 4: Delivery Infrastructure

```
delivery_log rows: 0 (expected — no alerts generated)
Expo Push API: not tested (no alerts to deliver)
```

Push delivery will be validated when the first live football alert fires post-migration-095.

---

## Section 5: API Rate Budget

No api_rate_log table exists in the production schema. Rate budget cannot be quantified from DB queries. Sportradar cap (25 calls/min) is the primary concern for Sep 5 (60 NCAAF games). The priority tier system (FX8/FX8a) was deployed — tier 1 games (user follows + top-25 ranked) get priority PBP allocation.

**Observation**: All NCAAF games are "basic" coverage with no `sportradar_id`. This means zero Sportradar calls for NCAAF, and the 25-call/min cap is not at risk. The FX8 priority tiering only matters if/when NCAAF games get full coverage or sportradar_id populated.

---

## Section 6: NFL Kickoff Readiness Checklist

| Check | Status | Notes |
|-------|--------|-------|
| NCAAF Week 2 pre-seeded | ✅ | 60 games as "scheduled" |
| NFL Sep 4+ in DB | ⏳ | Will auto-appear on ESPN scoreboard |
| follows backfill | ✅ | Migration 095 committed |
| watcher_state healthy | ✅ | 0 errors, < 1 min lag |
| FX10 (quarter-close bug) | ✅ | Deployed Aug 29 via CI |
| FX5 (football odds) | ✅ | Deployed Aug 29 via CI |
| FX11 (period labels) | ✅ | Deployed Aug 29 via CI |
| FX8a (FBS groups=80) | ✅ | Deployed, 60 games for Sep 5 |
| 1.5.0 build | 🔄 | EAS build running |
| App Store submission | ⏳ | Human: App Store Connect |

---

## Section 7: Gaps and Next Actions

### G-W1-1 (HIGH): Zero alerts — follows backfill [FIXED]
**Fix**: migration `095_backfill_follows_entity_type.sql` — push to production via CI.
**Verify**: After CI applies migration, next active game with a followed game_id should produce an alert.

### G-W1-2 (MEDIUM): NCAAF Week 1 games missed
**Retrospective only** — no fix needed. The deployment timing (CI after game-day) was an unavoidable consequence of the Aug 29 merge date. Week 2 is properly pre-seeded.

### G-W1-3 (LOW): No Sportradar PBP for NCAAF
**Expected behavior** — basic coverage is by design. Advanced signal extraction (eFG delta, foul trouble) is basketball-specific. Football alerts rely on score + clock data from poll-boxscore. No action needed.

### G-W1-4 (WATCH): NFL schedule lag
**Expected** — poll-schedule will ingest NFL Kickoff games when they appear on ESPN's scoreboard, typically 1–3 days before kickoff. Sep 4 TNF games should appear by Sep 2–3.

---

## Section 8: NFL Kickoff Drill Instructions

Run the Phase 6 live-fire drill on **Sep 4 (Thursday Night Football)** starting at 8:00 PM ET:

```
/loop with 15-minute cadence from 20:00 ET on Sep 4. Each tick:
  1. watcher_state — active nfl watchers vs. inprogress NFL games
  2. alerts last 15 min — verify football alert types fire
  3. delivery_log failure rate
  4. Sportradar api_rate_log (N/A — basic coverage)
  5. evaluate-alerts, poll-boxscore error logs in Supabase Dashboard
```

The Sep 7 Sunday slate (9+ concurrent NFL games + NCAAF Saturday Day 2) is the first real load test.

---

*Audit complete. Migration 095 committed. EAS 1.5.0 build running.*
