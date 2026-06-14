# P1-07 — CTA-level geo enforcement parity + tests

> Copy everything below the line into the Claude CLI as a single prompt.

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`06_ADS_MONETIZATION_AND_AUCTION_LOGIC.md` (Geo-Compliance), `07_SECURITY_PRIVACY_AND_RISK.md`, and
`10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md` (rule #8). Inspect `lib/geo-compliance.ts`
(`inferStateFromTimezone`), the `useSportsbookGeo` hook, `components/BetNowButton.tsx`, the
`sportsbook_restrictions` table (migration 058), and the auction engine geo-filter before editing.

## Objective
The auction engine and `BetNowButton` both claim to enforce sportsbook geo-restrictions via the same
`inferStateFromTimezone` logic. Verify true parity and lock it with tests. Doc 09 marks the CTA
gating "Done", but there is no test guaranteeing the auction and the CTA agree for every state/book.

## Why it matters
Mismatched enforcement is a regulatory landmine: a campaign blocked at auction but whose CTA still
renders (or vice versa) is exactly the kind of inconsistency a state gambling regulator penalizes.
Gambling ad compliance is non-negotiable.

## Scope
- Add a shared test fixture of (timezone → state) and (state → allowed books) pairs and a property-
  style test asserting: for every user state and every sportsbook, the auction geo-filter decision
  and the `useSportsbookGeo`/`BetNowButton` decision are identical, including the unknown-jurisdiction
  case (null/unresolvable timezone → all sportsbook CTAs disabled AND all sportsbook bids excluded).
- If you find a divergence, fix it by routing BOTH through the single `inferStateFromTimezone` +
  `sportsbook_restrictions` lookup. Do not duplicate logic.
- Confirm non-sportsbook categories (streaming/commerce/etc.) are NOT geo-filtered.

## Acceptance criteria
- New tests pass and would fail if the two enforcement points diverged.
- Unknown-jurisdiction users see no sportsbook CTA and win no sportsbook bid.
- No change to non-sportsbook ad behavior.
- Docs 06 and 07 updated to state that parity is now test-enforced.

## Commands to run before you finish
```
npm test -- --ci
deno test --allow-env --allow-net=none supabase/functions/
```

## Non-negotiables to respect
Read doc 10. No betting advice/guaranteed-outcome language (rule #8). Keep "Watch" primary, "Bet Now"
secondary (rule #11). Single source of truth for geo logic.

## Closing
Answer the doc-10 closing checklist; state whether a real divergence existed and how it was fixed.
