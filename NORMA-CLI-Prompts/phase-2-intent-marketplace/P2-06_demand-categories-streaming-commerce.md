# P2-06 — Generalize demand categories beyond sportsbook (streaming + commerce)

> Copy everything below the line into the Claude CLI as a single prompt.
> Run AFTER P2-01 (intent moments) and P2-03 (attribution).

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`06_ADS_MONETIZATION_AND_AUCTION_LOGIC.md` (Campaigns, Demand, CTA types) and
`10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`. Inspect the `campaigns`/`creatives` tables, the CTA/
conversion types (`cta_tap` / `sportsbook_open` / `stream_open` / `wager_placed`), `_shared/auction-engine.ts`,
and the advertiser campaign-creation flow under `web/`.

## Objective
Today demand is sportsbook-shaped. The thesis names three buyer types: sportsbooks, streamers
(YouTube TV, Prime Video, Peacock), and commerce (Fanatics). Generalize the campaign model so a
**streaming** or **commerce** advertiser can target intent moments with the appropriate CTA, not just a
sportsbook deep link.

## Why it matters
A one-buyer marketplace is a sales channel; a three-buyer marketplace is an exchange. Streaming
("tune in now") and commerce ("buy the jersey now") are the demand that makes intent moments
multi-sided — and makes the "billions, not impressions" claim more than sportsbook rebates.

## Be honest about what's real
This builds the **demand-side model and CTA plumbing** so these buyers CAN run. It does NOT create
live partnerships or real streamer/commerce inventory deals — that's BD. Label any non-live category as
configurable-but-unsold; do not imply active YouTube TV / Fanatics campaigns that don't exist (rule #10).

## Scope
- Add a `category` / `demand_type` to `campaigns` (additive migration prefix **067**): e.g.
  `sportsbook | streaming | commerce`, each with its allowed CTA action and creative requirements.
- Make the auction eligibility + CTA rendering category-aware (reuse existing CTA/deep-link patterns;
  e.g. a streaming campaign renders a "Watch now" CTA, commerce renders a "Shop now" CTA). Do NOT
  change clearing logic — only eligibility + rendering.
- Advertiser campaign-creation flow: let the buyer pick a category and configure the matching CTA.
- Conversion/attribution (P2-03) must record the correct downstream action per category and keep the
  inferred-vs-verified labeling honest per category.

## Acceptance criteria
- A streaming and a commerce campaign can be created, become auction-eligible, and render the correct
  CTA; sportsbook behavior is unchanged.
- Attribution records the right action type per category with honest inferred/verified labels.
- Tests cover category eligibility and CTA rendering per category.
- Docs 06 (Campaigns/Demand) and 09 updated; clearly mark which categories are live vs. scaffolded.

## Commands to run before you finish
```
deno test --allow-env --allow-net=none supabase/functions/
cd web && npm run build && cd ..
npm test -- --ci
```

## Non-negotiables to respect
Read doc 10, esp. rules #7, #10, #11. Do not fabricate live partnerships. Don't change clearing logic.
Additive migration only (067). Aggregate-only reporting (doc 06/07).

## Closing
Answer the doc-10 closing checklist; state which demand categories are live vs. scaffolded and confirm
clearing logic is unchanged.
