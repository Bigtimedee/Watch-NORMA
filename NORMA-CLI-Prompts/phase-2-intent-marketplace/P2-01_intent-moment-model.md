# P2-01 — Formalize the "intent moment" as the unit of inventory

> Copy everything below the line into the Claude CLI as a single prompt.
> Run AFTER Phase 1 (especially P1-01 integration tests) so you can prove no alert regression.

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`05_ALERTS_STREAMING_AND_LIVE_SPORTS_LOGIC.md`, `06_ADS_MONETIZATION_AND_AUCTION_LOGIC.md`, and
`10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`. Inspect `_shared/alert-scoring.ts`,
`evaluate-alerts/`, `_shared/auction-engine.ts`, `_shared/pricing-engine.ts`, and the
`impressions`/`floor_prices` tables before editing.

## Objective
NORMA's thesis is "we sell the moment a fan suddenly cares." Today that moment is implicit — scattered
across alert types and the auction. Make it **explicit**: define a normalized `IntentMoment` record
(the unit of inventory) and persist every qualifying moment, whether or not an ad fills it.

## Why it matters
A marketplace needs a tradeable unit with a stable schema and a measurable "intent score." This record
is the foundation for supply forecasting (P2-04), pricing (P2-05), the programmatic API (P2-09), and
attribution (P2-03). Without it, "billions, not impressions" is a slogan, not a data model.

## Scope
- Define `IntentMoment` in shared types: { id, game_id, sport, moment_type, fired_at,
  intent_score (0–1), eligible_user_count, game_context (margin, clock, period, etc.),
  signals_snapshot, auction_outcome (filled/unfilled/ineligible), clearing_price NULL }.
- Additive migration (prefix **067**): an `intent_moments` table, RLS locked to service role +
  advertiser-aggregate read paths only (NEVER user-level exposure to advertisers — see doc 06/07).
- In `evaluate-alerts`, after scoring/throttle, write one `intent_moment` row per qualifying moment
  (deduped per existing dedup hash), recording whether the auction filled it. This is observational —
  it must NOT change which alerts fire or alter delivery latency.
- Define `intent_score` as a documented, deterministic transform of the existing relevance score +
  game-state premium signals (reuse, don't reinvent, the scoring + dynamic-premium logic).

## Acceptance criteria
- Every fired alert produces exactly one `intent_moment` row; suppressed moments optionally recorded
  with reason (configurable), but never double-counted.
- P1-01 integration tests still pass unchanged (no alert behavior change).
- `intent_score` is unit-tested and deterministic.
- Docs 05 and 06 updated to define the intent moment as the inventory unit; doc 04 lists the new table.

## Commands to run before you finish
```
deno test --allow-env --allow-net=none supabase/functions/
deno check supabase/functions/evaluate-alerts/index.ts
```

## Non-negotiables to respect
Read doc 10, esp. rule #11 (ads additive, never delay delivery) and #16 (data minimization — store
aggregate-safe fields; no advertiser-visible user identity). Additive migration only (067).

## Closing
Answer the doc-10 closing checklist; confirm zero alert-behavior change and which docs/tables were added.
