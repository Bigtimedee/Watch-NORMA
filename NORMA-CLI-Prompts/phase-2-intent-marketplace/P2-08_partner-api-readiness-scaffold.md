# P2-08 — Partner-API readiness scaffold (DK/FD outcome ingestion — interface only)

> Copy everything below the line into the Claude CLI as a single prompt.
> Run AFTER P2-03 (attribution) so the verified path has somewhere to land.

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`04_DATA_AND_INTEGRATIONS.md` (sportsbook tiers — Tier A is partnership-gated),
`06_ADS_MONETIZATION_AND_AUCTION_LOGIC.md` (conversion verification),
`07_SECURITY_PRIVACY_AND_RISK.md`, and `10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`. Inspect
`_shared/bet-ingestor.ts` (the existing `BetIngestor` interface + stub adapters), the `conversions`
table, and `connections.auth_mode`.

## Objective
P2-03 proved we CANNOT verify sportsbook wagers today (no callback). The only thing that fixes that is a
partner data feed. Build the **server-to-server ingestion interface** that would turn an inferred
`sportsbook_open` into a verified `wager_placed` IF a partnership is secured — interface, schema, and a
disabled stub adapter only.

## Why it matters
Verified conversions are the single biggest multiplier on defensible CPA pricing and the hardest thing
an acquirer will diligence. Having the ingestion contract built (not the partnership) means the day BD
closes DraftKings, it's an adapter implementation, not a re-architecture. This is the bridge from
inferred to verified.

## Be brutally honest (this is the whole point)
There is NO public DK/FD consumer conversion API. This ticket builds NOTHING that produces real
verified data today. It MUST ship disabled, clearly labeled "requires partnership — not live," and must
never flip an inferred conversion to verified using fabricated data (rules #7, #10). If you cannot do
this without implying a live integration, stop and say so.

## Scope
- Define a `ConversionIngestor` contract (extend or mirror `_shared/bet-ingestor.ts`): a server-to-server
  endpoint/interface that would accept signed partner callbacks mapping an external action to a NORMA
  `conversion`, upgrading it from inferred → verified.
- Schema for verified provenance (additive migration prefix **067**): e.g. a `verification_source`
  field on `conversions` (`inferred` default; `partner_api` only when a real signed callback arrives).
  RLS/service-role locked.
- Provide a DISABLED stub adapter (returns "not available", logs clearly) wired behind
  `connections.auth_mode = 'partner_api'`, shown in admin as "Coming soon / requires partnership."
- Security: define (don't fake) the auth model — signature verification, secret storage per
  `07_SECURITY`, no token logging.

## Acceptance criteria
- Interface + schema + disabled stub exist and are unit-tested (including "stub refuses to verify").
- No conversion can be marked `verified` without a real signed partner callback; default stays inferred.
- Admin UI shows the integration as not-live; nothing implies active DK/FD data.
- Docs 04 (Tier A), 06, 07 updated to describe the contract and its disabled status.

## Commands to run before you finish
```
deno test --allow-env --allow-net=none supabase/functions/
cd web && npm run build && cd ..
```

## Non-negotiables to respect
Read doc 10, esp. rules #7 and #10. Scaffold only — no fabricated verified conversions, no implied live
partnership. Additive migration only (067). Secrets handled per doc 07; never log tokens.

## Closing
Answer the doc-10 closing checklist; state explicitly that this is interface-only, disabled, and that
verification cannot occur without a real partnership.
