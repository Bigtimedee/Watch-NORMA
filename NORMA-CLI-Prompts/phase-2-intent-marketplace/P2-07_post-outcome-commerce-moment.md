# P2-07 — Post-outcome commerce moment (the "they won — buy the gear" beat)

> Copy everything below the line into the Claude CLI as a single prompt.
> Run AFTER P2-01 (intent moments) and P2-06 (commerce demand category).

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`05_ALERTS_STREAMING_AND_LIVE_SPORTS_LOGIC.md` (alert/moment types, game-final handling),
`06_ADS_MONETIZATION_AND_AUCTION_LOGIC.md`, and `10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`.
Inspect `_shared/alert-scoring.ts`, `evaluate-alerts/`, the game-final/resolve path, the
`intent_moments` table (P2-01), and `_shared/auction-engine.ts`.

## Objective
Intent doesn't end at the buzzer. A win/clinch/upset is a commerce moment ("buy the championship tee").
Add a **post-outcome moment_type** that fires at qualifying game-end states and is eligible for
commerce demand (P2-06), persisted as an `intent_moment` like any other unit of inventory.

## Why it matters
This extends the inventory surface past the live window into the highest-emotion commerce beat in
sports — exactly the Fanatics-style demand the thesis names. It also diversifies inventory beyond
in-game sportsbook moments, which matters for yield and for not being a one-trick marketplace.

## Be honest about what's real
A `commerce_open` deep link CANNOT confirm a purchase (no merchant callback exists) — attribution stays
inferred, same honesty rule as sportsbook (P2-03, rule #7). Do not imply verified merchandise sales.
And follow rule #10: don't ship this as "working commerce" if there's no commerce demand configured —
gate it cleanly.

## Scope
- Define a post-outcome `moment_type` (e.g. `post_outcome` with qualifiers like win / clinch / upset),
  derived from existing final-state + game-context signals. Document the deterministic trigger.
- On qualifying game-end, write one `intent_moment` row (additive, reuse the P2-01 table; dedup so a
  game produces at most one post-outcome moment). This is observational and must NOT alter live alert
  behavior or delivery latency (rule #11).
- Make the moment eligible for commerce-category auctions (P2-06); if no commerce demand exists, it
  records as unfilled — never a fabricated fill.
- Attribution (P2-03): record `commerce_open` / `cta_tap` as inferred only; label clearly in `/reporting`.

## Acceptance criteria
- Qualifying game-ends produce exactly one `post_outcome` intent moment; non-qualifying ends produce none.
- Live in-game alert behavior and latency are unchanged (existing tests pass).
- Moment is auction-eligible for commerce demand; with no demand it is unfilled, not faked.
- Attribution labels post-outcome commerce actions as inferred.
- Tests cover the trigger, dedup, and "no live-alert regression."
- Docs 05, 06, and 09 updated.

## Commands to run before you finish
```
deno test --allow-env --allow-net=none supabase/functions/
deno check supabase/functions/evaluate-alerts/index.ts
npm test -- --ci
```

## Non-negotiables to respect
Read doc 10, esp. rules #7, #10, #11. No verified-purchase claims. No live-alert behavior change.
Additive migration only (067) if any schema is needed. Aggregate-only reporting.

## Closing
Answer the doc-10 closing checklist; confirm zero live-alert regression and that commerce attribution
is labeled inferred.
