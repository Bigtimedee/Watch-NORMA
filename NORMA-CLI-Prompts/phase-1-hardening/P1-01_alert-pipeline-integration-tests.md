# P1-01 — End-to-end integration tests for the alert pipeline

> Copy everything below the line into the Claude CLI as a single prompt.

---

You are working in the Watch-NORMA repository. Before doing anything, read
`docs/watch-norma-context/README.md`, then `05_ALERTS_STREAMING_AND_LIVE_SPORTS_LOGIC.md`,
`08_TESTING_DEPLOYMENT_AND_OPERATIONS.md`, and `10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`.
Inspect the code before editing; do not rely on memory.

## Objective
The alert pipeline is the product's core intelligence and the supply side of the entire monetization
thesis, but it has only unit tests. Build an **end-to-end integration test** that exercises the full
path: game-state change → candidate generation → signal extraction → scoring/must-notify →
throttle/dedup → (mock) auction → delivery record. This is immediate priority #5 in doc 09.

## Why it matters
Every dollar NORMA earns is attached to a correctly-fired, correctly-throttled alert. If the pipeline
regresses silently, both user trust and ad revenue collapse at once. E2E coverage is the safety net.

## Scope
- Add a Deno integration test (e.g. `supabase/functions/evaluate-alerts/integration_test.ts`) that
  wires the real `_shared/alert-scoring.ts`, `outcome-proximity.ts`, and `evaluate-alerts/logic.ts`
  together against an in-memory / mocked Supabase client and mocked game state.
- Use the existing `_shared/test-helpers.ts` patterns. Mock the DB layer and the auction so no
  network calls occur (`deno test --allow-env --allow-net=none` must pass).
- Do NOT change production scoring/throttle behavior. If you find a real bug, document it and add a
  failing test marked clearly, but make the production fix a separate follow-up unless trivial.

## Test scenarios to cover (assert end-to-end, not per-unit)
1. Follower + close game + final 5 min → alert fires; below threshold (follower + blowout) → no alert.
2. Wager line being crossed → alert fires with correct `wager_impact` status (covering/at_risk).
3. Must-notify: overtime, game final, 1-possession under 2:00, star 4th foul — fire regardless of score.
4. Dedup: a 1-point change within the same margin bucket does NOT produce a second alert.
5. Per-game cap (default 5) and per-hour cap (default 10) enforced; 6th/11th suppressed with a
   `suppressed_reason`.
6. Quiet hours: push suppressed, in-app alert still created.
7. A user with no follows/wagers/positions for a game NEVER becomes a candidate.

## Acceptance criteria
- New integration test passes locally and in CI under `deno test --allow-env --allow-net=none`.
- No change to production alert output for existing unit tests (they still pass).
- The test file is referenced in `docs/watch-norma-context/08_TESTING_DEPLOYMENT_AND_OPERATIONS.md`
  under "Existing Tests".

## Commands to run before you finish
```
deno test --allow-env --allow-net=none supabase/functions/
npm test -- --ci
```

## Non-negotiables to respect
Read doc 10. Do not weaken dedup/caps/quiet-hours to make tests pass. Do not alter alert logic
without tests. Update the testing doc.

## Closing
Answer the doc-10 closing checklist. State explicitly whether any documentation was updated and what
remains unknown (e.g., scenarios you could not simulate without a live DB).
