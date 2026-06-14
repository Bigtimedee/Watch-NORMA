# P1-02 — Load-test harness for March Madness scale

> Copy everything below the line into the Claude CLI as a single prompt.

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`03_TECHNICAL_ARCHITECTURE.md` (orchestrator + rate budget), `08_TESTING_DEPLOYMENT_AND_OPERATIONS.md`,
and `10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`. Inspect `supabase/functions/game-watcher-orchestrator/`,
`_shared/sportradar.ts` (rate budgeting), and `_shared/polling-state.ts` before editing.

## Objective
Create a **load-test harness** that simulates a high-density slate (target: 50+ simultaneous live
games) and measures whether the orchestrator, Sportradar rate budget, and alert pipeline degrade
gracefully. This is a known gap (doc 09: "No load tests").

## Why it matters
March Madness is both the peak revenue window and the peak failure window. The orchestrator's
concurrency limits (max 5 PBP, max 3 summary), backoff, and `api_rate_log` budget have never been
validated under realistic concurrency. If the system starves PBP polling at scale, alerts go stale
exactly when inventory and engagement are highest.

## Scope
- Add a standalone harness (e.g. `scripts/load-test/orchestrator-load.ts` or a Deno test tagged as
  load) that seeds N synthetic active games into a mocked `watcher_state` and drives the orchestrator
  dispatch logic in a loop, recording: dispatches/cycle, skipped-due-to-concurrency, skipped-due-to-
  rate-budget, simulated backoff growth, and per-game effective poll interval.
- Make N configurable (e.g. env `LOAD_GAMES=60`). Default small enough for CI; large runs are manual.
- Output a summary table (games, cycles, p50/p95 effective PBP interval, % games starved).
- Do NOT hit real external APIs. Mock Sportradar/DB entirely.

## Acceptance criteria
- Running the harness with `LOAD_GAMES=60` completes and prints a clear degradation report.
- The harness asserts the documented invariants: never exceeds max-5-PBP / max-3-summary per cycle;
  backoff is exponential and capped at 5 min; closed games are deactivated.
- A short "Load testing" subsection is added to doc 08 explaining how to run it and how to read the output.

## Commands to run before you finish
```
deno test --allow-env --allow-net=none supabase/functions/
LOAD_GAMES=60 deno run --allow-env scripts/load-test/orchestrator-load.ts
```

## Non-negotiables to respect
Read doc 10. The harness is a test artifact — it must not alter orchestrator production behavior. If
it reveals starvation, document the finding; do not silently change concurrency/rate constants
without a follow-up ticket and updated docs.

## Closing
Answer the doc-10 closing checklist, including what the load run revealed and what remains unknown
(e.g., real Sportradar latency variance the mock can't reproduce).
