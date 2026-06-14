# P1-12 — NFL + college-football ingestion scaffold

> Copy everything below the line into the Claude CLI as a single prompt.

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`04_DATA_AND_INTEGRATIONS.md`, `03_TECHNICAL_ARCHITECTURE.md` (sport routing in orchestrator,
migration 062 added `watcher_state.sport`), `05_ALERTS_STREAMING_AND_LIVE_SPORTS_LOGIC.md`, and
`10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`. Inspect `poll-schedule`, `poll-boxscore`,
`_shared/sportradar.ts`, the `sport` columns/indexes (migrations 049–051, 062), and how NCAAM/NBA/MLB
are currently branched.

## Objective
NORMA supports NCAAM, NBA, MLB. The biggest addressable-market expansion (and the betting calendar's
center of gravity) is football. Scaffold **NFL + college football schedule and score ingestion** —
data layer only in this ticket. Sport-specific alert rules are a separate follow-up.

## Why it matters
Football is where US sports betting volume and viewership concentrate in the fall. For an intent
marketplace, more high-stakes simultaneous games = more premium inventory. But football has distinct
game structure (downs, possessions, drives, clock) so this must be staged, not rushed.

## Scope (DATA LAYER ONLY)
- Add NFL and NCAAF as recognized sports: ESPN scoreboard endpoints, SportsDataIO schedules, and
  Sportradar mappings, reusing existing sport-branching patterns and `watcher_state.sport`.
- Persist games/teams/scores with correct status mapping (`status.type.description`, rule #19).
- Do NOT add football alert rules, odds, or auction moment types yet — gate them clearly as "ingestion
  only; alerting TBD" so nothing fires half-built (rule #10 spirit: don't ship implied-but-unbuilt).
- Add tests for football status mapping and schedule parsing.

## Acceptance criteria
- NFL and NCAAF games appear in `games` with correct teams, status, and sport tag.
- Orchestrator can create watcher rows for football games but football alert evaluation is explicitly
  disabled/no-op (documented), so no malformed alerts fire.
- Tests cover football status mapping; existing sports unaffected.
- Docs 01 (supported sports), 03, 04, 05, 09 updated to reflect football as ingestion-only.

## Commands to run before you finish
```
deno check supabase/functions/poll-schedule/index.ts supabase/functions/poll-boxscore/index.ts
deno test --allow-env --allow-net=none supabase/functions/
npm test -- --ci
```

## Non-negotiables to respect
Read doc 10, esp. rules #10 and #19. Do not present football alerting as working before it is.
Additive migrations only (prefix **067**). Don't fabricate scores when a source lacks football data.

## Closing
Answer the doc-10 closing checklist; clearly state that this is ingestion-only and list the follow-up
needed for football alert rules + odds + moment types.
