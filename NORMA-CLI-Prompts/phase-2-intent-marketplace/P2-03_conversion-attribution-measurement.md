# P2-03 — Closed-loop conversion & attribution measurement

> Copy everything below the line into the Claude CLI as a single prompt.

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`06_ADS_MONETIZATION_AND_AUCTION_LOGIC.md` (Revenue Models, conversion tracking),
`07_SECURITY_PRIVACY_AND_RISK.md`, and `10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`. Inspect the
`impressions` and `conversions` tables, where `cta_tap` / `app_return` / `sportsbook_open` /
`stream_open` / `wager_placed` are recorded, and `reporting-api`.

## Objective
The thesis is that brands buy "certainty a viewer is about to tune in and act." That claim must be
provable. Build **closed-loop attribution**: tie impression → CTA tap → downstream action within a
defined window, and expose advertiser-facing measurement.

## Why it matters
This is the difference between selling impressions and selling outcomes. Defensible attribution is what
justifies premium CPMs/CPAs versus Google/Meta. It is also the metric an acquirer will diligence hardest.

## Scope
- Define attribution windows (e.g. CTA tap → action within 30 min = attributed; document the choice).
- Add an attribution computation (Edge Function or SQL view, additive migration prefix **067**) that
  joins impressions → conversions per campaign and produces: CTR, action rate, attributed conversions,
  CPA, and view-through vs. click-through where determinable.
- Surface in `reporting-api` and the advertiser `/reporting` page as aggregate metrics only.
- Be explicit about what is and is not measurable: a `sportsbook_open` deep link CANNOT confirm a real
  wager (no sportsbook callback exists). Label modeled/inferred actions as inferred — never imply
  verified sportsbook conversions you cannot see (rule #7, #10).

## Acceptance criteria
- Per-campaign attributed metrics computed within the documented window; tests cover the join logic
  and window boundary cases.
- Advertiser `/reporting` shows attribution with clear labeling of inferred vs. verified actions.
- Privacy: aggregate only, no user-level export; RLS intact.
- Docs 06 and 07 updated (measurement methodology + its honest limits).

## Commands to run before you finish
```
deno test --allow-env --allow-net=none supabase/functions/
cd web && npm run build && cd ..
```

## Non-negotiables to respect
Read doc 10. Do NOT fabricate verified sportsbook conversions (rule #7). No user-level data to
advertisers (doc 06/07). Additive migration only (067).

## Closing
Answer the doc-10 closing checklist; state explicitly which conversions are verifiable vs. inferred and
how the UI labels them.
