# P2-10 — Brand-safety & editorial separation for the demand engine

> Copy everything below the line into the Claude CLI as a single prompt.
> Run AFTER P2-06 (multi-category demand) and P2-07 (post-outcome commerce).

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`05_ALERTS_STREAMING_AND_LIVE_SPORTS_LOGIC.md` (alert relevance, the "WHY NOW" explanation),
`06_ADS_MONETIZATION_AND_AUCTION_LOGIC.md` (CTA rendering, campaign approval),
`07_SECURITY_PRIVACY_AND_RISK.md`, and `10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`. Inspect the
alert/CTA rendering path, `campaigns`/`creatives` + the campaign-approval flow (migration 065), and
`_shared/auction-engine.ts` eligibility.

## Objective
As demand broadens to sportsbook + streaming + commerce, the line between NORMA's editorial alert ("tune
in now, here's why") and the paid CTA must stay legible. Build **brand-safety + editorial-separation
controls**: campaign-eligibility guardrails and clear ad-vs-editorial labeling so paid demand never
masquerades as NORMA's own recommendation.

## Why it matters
The product's entire moat is trust in the alert. If a sportsbook CTA reads like NORMA's editorial "why
now," you spend the trust that makes the inventory premium in the first place. Brand safety and clear
disclosure are also table-stakes for serious advertisers and for any regulatory posture around betting
ads. This protects the asset the thesis is built on.

## Scope
- Eligibility guardrails in the auction (extend `_shared/auction-engine.ts` eligibility, don't touch
  clearing): block disallowed creative/category combinations (e.g. betting CTAs in restricted contexts,
  per existing geo-compliance), enforce per-category content rules. Document the ruleset.
- Clear ad-vs-editorial labeling in the alert/CTA UI: the paid CTA is visibly distinct from NORMA's
  editorial "why now" copy (e.g. a "Sponsored"/"Ad" marker), so a paid action is never presented as
  NORMA's own recommendation.
- Tie into the existing campaign-approval flow (migration 065): add brand-safety review state /
  checklist for new demand categories; record approval provenance.
- Responsible-gambling posture: ensure betting CTAs respect existing geo/eligibility and don't override
  any "Watch" primary action or honest-uncertainty caveats (P1-11 spirit).

## Acceptance criteria
- Disallowed creative/category/context combinations are rejected at eligibility; allowed ones pass.
  Clearing logic unchanged.
- UI clearly distinguishes paid CTA from editorial alert copy; tests assert the labeling renders.
- Campaign approval records brand-safety review for new categories.
- Tests cover eligibility guardrails and ad/editorial labeling.
- Docs 05, 06, 07 updated with the brand-safety ruleset and disclosure policy; doc 09 updated.

## Commands to run before you finish
```
deno test --allow-env --allow-net=none supabase/functions/
cd web && npm run build && cd ..
npm test -- --ci
```

## Non-negotiables to respect
Read doc 10, esp. rules #7, #11. Don't change clearing logic — gate eligibility and label clearly.
Editorial alert relevance is never for sale (paid demand must not alter which alerts fire or the "why
now" content). Additive migration only (067) if needed. Aggregate-only reporting.

## Closing
Answer the doc-10 closing checklist; confirm clearing logic is unchanged, that paid CTAs are clearly
separated from editorial alerts, and that alert relevance remains uninfluenced by demand.
