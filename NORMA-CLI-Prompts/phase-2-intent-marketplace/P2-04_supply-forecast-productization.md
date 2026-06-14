# P2-04 — Productize supply forecasting (sell inventory before it exists)

> Copy everything below the line into the Claude CLI as a single prompt.
> Run AFTER P2-01 (needs `intent_moments`) and ideally P2-03 (attribution).

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`06_ADS_MONETIZATION_AND_AUCTION_LOGIC.md` (Inventory & Forecasting), `04_DATA_AND_INTEGRATIONS.md`
(schedule ingestion), and `10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`. Inspect `poll-schedule`,
the `games`/`watcher_state`/`intent_moments` tables, `_shared/auction-engine.ts`, and the existing
advertiser `/inventory` page under `web/`.

## Objective
A marketplace lets buyers reserve future inventory. Build a **supply forecast**: given the upcoming
schedule and historical `intent_moments`, project how many intent moments (by type/sport) will fire in
a future window, with a confidence band. Surface it on the advertiser `/inventory` page.

## Why it matters
Brands budget ahead of the slate. "We expect ~N high-intent moments across Saturday's CFB slate"
is what turns NORMA from a spot-buy into a planned media line. It is also the supply side of yield
management (P2-05) and the demand-planning input every acquirer's diligence will probe.

## Why this is hard / be honest
Forecasting moments from a schedule is inherently uncertain — close games, blowouts, and injuries
swing volume. The forecast MUST publish a confidence interval, not a point number presented as fact.
Do not imply guaranteed delivery; this is a projection (rule #7, #10).

## Scope
- Add a forecast computation (Edge Function or SQL view, additive migration prefix **067**) that uses
  upcoming `games` (schedule) + historical `intent_moments` rates per sport/moment_type to project a
  count + low/high band for a chosen window.
- Be explicit about method (e.g. historical moments-per-game by sport × scheduled games, adjusted for
  primetime/marquee flags if present). Document the assumptions.
- Surface on `/inventory`: projected moments by sport/type, confidence band, and the basis ("based on
  N comparable games"). Aggregate only — no user-level data (doc 06/07).
- Football is ingestion-only today (see P1-12); if football has no historical moment data, show
  "insufficient history" rather than a fabricated number.

## Acceptance criteria
- Forecast endpoint/view returns projected moment counts with a confidence band for a given window.
- `/inventory` shows the forecast with explicit basis and an uncertainty band, labeled as a projection.
- Sports/types with no history degrade gracefully to "insufficient history."
- Tests cover the projection math and the empty-history case.
- Docs 06 (Inventory & Forecasting) and 09 (gap closed) updated.

## Commands to run before you finish
```
deno test --allow-env --allow-net=none supabase/functions/
cd web && npm run build && cd ..
```

## Non-negotiables to respect
Read doc 10. This is a projection, never a guarantee (rule #7). Aggregate only (doc 06/07). Additive
migration only (067). Do not fabricate history for sports that have none.

## Closing
Answer the doc-10 closing checklist; state the forecasting method, its assumptions, and how the UI
communicates uncertainty.
