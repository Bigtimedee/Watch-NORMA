# P2-05 — Per-category floor pricing & yield management

> Copy everything below the line into the Claude CLI as a single prompt.
> Run AFTER P2-01 (intent moments) and P2-02 (live auction telemetry).

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`06_ADS_MONETIZATION_AND_AUCTION_LOGIC.md` (Floor Pricing, Auction Logic) and
`10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`. Inspect `_shared/pricing-engine.ts`,
`_shared/auction-engine.ts`, the `floor_prices` table, and the admin `/admin/revenue` page under `web/`.

## Objective
Today floors are coarse. Build **per-category dynamic floor pricing**: floors that vary by
moment_type × sport × game-state premium, learned from clearing-price history, so high-intent moments
clear at premium and low-intent moments still fill. Add an admin yield view to tune it.

## Why it matters
Yield management is how a marketplace captures the value it creates. Flat floors leave money on the
table on premium moments and choke fill on marginal ones. Differentiated floors are the mechanism
behind "premium CPMs vs. Google/Meta" — the pricing power the whole thesis rests on.

## Why this is hard / be honest
Floors that are too high collapse fill; too low, you leak revenue. This needs guardrails and must NOT
silently change the clearing rule (still second-price Vickrey). Floor changes must be observable and
reversible. Do not introduce first-price behavior or hidden reserve manipulation.

## Scope
- Extend `pricing-engine.ts` (and `floor_prices`, additive migration prefix **067**) to compute floors
  per moment_type × sport, optionally modulated by the documented game-state premium signal used in
  `intent_score` (P2-01). Keep the transform deterministic and documented.
- Learn floors from recent clearing-price history (e.g. percentile of recent clears per category),
  bounded by configurable min/max guardrails. No change to the second-price clearing logic itself.
- Admin `/admin/revenue` (or a new yield panel): show floor vs. clearing vs. fill by category, and let
  an admin set guardrails. Admin-gated (`_shared/admin.ts`, web middleware).
- Aggregate only; no user-level data (doc 06/07).

## Acceptance criteria
- Floors differ by category and respond to clearing history within guardrails; clearing remains
  second-price (prove with a test).
- Admin can view floor/clearing/fill per category and adjust guardrails; non-admins blocked.
- Unit tests: floor computation, guardrail clamping, and "second-price unchanged" invariant.
- Docs 06 (Floor Pricing) and 09 updated.

## Commands to run before you finish
```
deno test --allow-env --allow-net=none supabase/functions/
cd web && npm run build && cd ..
npm test -- --ci
```

## Non-negotiables to respect
Read doc 10, esp. rule #11. Do NOT change the auction clearing rule (still second-price). Additive
migration only (067). Floors must be bounded and observable. Aggregate only.

## Closing
Answer the doc-10 closing checklist; confirm clearing logic is unchanged and floors are bounded,
deterministic, and admin-tunable.
