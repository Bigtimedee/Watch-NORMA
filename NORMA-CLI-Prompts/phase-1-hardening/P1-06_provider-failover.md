# P1-06 — Automatic data-provider failover (ESPN → SportsDataIO)

> **DEPRECATED 2026-08-20 — do not run this prompt.** Owner decision: NORMA uses
> ESPN, not SportsDataIO. The SportsDataIO failover is cancelled; the dormant
> SDIO code paths in the poll-* functions are slated for removal, not hardening.

> Copy everything below the line into the Claude CLI as a single prompt.

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`04_DATA_AND_INTEGRATIONS.md` (Live Sports Data), `05_ALERTS_STREAMING_AND_LIVE_SPORTS_LOGIC.md`,
and `10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md` (rule #19 — ESPN `status.type.description`).
Inspect `supabase/functions/poll-boxscore/` and `_shared/utils.ts` (status mapping) before editing.

## Objective
ESPN is the primary score source; SportsDataIO is the documented fallback, but failover is implicit.
Make it **explicit and automatic**: when ESPN is unavailable/stale, auto-promote SportsDataIO and emit
a structured log/health signal. (Doc 09 near-term roadmap.)

## Why it matters
The entire intent thesis depends on accurate live game state. A single-source outage (which already
happened) silently orphans games and kills alert supply. Deterministic failover removes that single
point of failure.

## Scope
- In `poll-boxscore`, add an explicit source-selection step: try ESPN; if the response is missing,
  errors, times out (use existing `AbortController` pattern), or returns a status that fails the
  canonical mapping, fall back to SportsDataIO for that game/slate.
- Record which source was used per poll (e.g. `games.score_source` column or a per-poll log field).
  Emit a structured `event: "failover"` log with reason.
- CRITICAL: keep the ESPN field rule — read `status.type.description`, never `status.type.name`.
- Surface failover state to `health-check` so P1-03 can page if failover persists beyond N cycles.

## Acceptance criteria
- Unit/integration test: ESPN mock erroring/timing-out → SportsDataIO path is taken and a failover
  event is logged; ESPN healthy → SportsDataIO is NOT called.
- No regression to status mapping (existing `mapStatus` tests pass).
- `health-check` reflects current/recent failover.
- Docs 04, 05, 08 updated.

## Commands to run before you finish
```
deno check supabase/functions/poll-boxscore/index.ts
deno test --allow-env --allow-net=none supabase/functions/
npm test -- --ci
```

## Non-negotiables to respect
Read doc 10, especially rule #19. Do not fabricate scores when BOTH sources fail — mark the game's
data as stale/uncertain rather than guessing (rule #7, #15). Additive migration only if you add a
column (prefix **067**).

## Closing
Answer the doc-10 closing checklist; confirm whether a migration was added and which docs changed.
