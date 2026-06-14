# P2-09 — Programmatic Intent API (server-to-server bidding contract — design + scaffold)

> Copy everything below the line into the Claude CLI as a single prompt.
> Run AFTER P2-01 (intent moments), P2-03 (attribution), P2-05 (category floors).

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`06_ADS_MONETIZATION_AND_AUCTION_LOGIC.md` (auction pipeline, reporting-api),
`03_TECHNICAL_ARCHITECTURE.md` (edge functions, auth), `07_SECURITY_PRIVACY_AND_RISK.md`, and
`10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`. Inspect `_shared/auction-engine.ts`,
`_shared/pricing-engine.ts`, `reporting-api`, the `intent_moments`/`campaigns` tables, and how
advertiser auth currently works.

## Objective
"Capture intent for live sports the way search captured it for the web" implies machine buyers, not a
web form. Design and scaffold a **programmatic Intent API**: a documented server-to-server contract for
querying available intent inventory and submitting bids/budgets — the on-ramp to demand at scale.

## Why it matters
Manual campaign UIs cap demand at human throughput. A programmatic interface is how a real exchange
scales spend, onboards DSP-style buyers, and earns the "billions, not impressions" framing. The API
contract is also a concrete diligence artifact: it shows the marketplace is an exchange, not a tool.

## Be honest about scope
This is **contract design + scaffold + auth**, not a live public exchange. It must reuse the existing
second-price auction (do NOT reimplement clearing) and must enforce aggregate-only responses (no
user-level data ever leaves the boundary — rule #16, doc 06/07). Ship it gated/disabled by default if
not production-ready, and say so plainly (rule #10).

## Scope
- Define the API surface (document it; implement a scaffolded Edge Function): e.g.
  `GET /intent-inventory` (aggregate available/forecasted moments by category — reuse P2-04),
  `POST /intent-bid` or budget/campaign submission that feeds the EXISTING auction as another demand
  source. No new clearing logic — bids enter the current Vickrey engine.
- Server-to-server auth: API keys / signed requests with per-buyer scoping and rate limits (per doc 07);
  service-role isolation; no token logging. Define key issuance + revocation.
- Strict aggregate-only responses; schema for any new tables additive (prefix **067**), RLS locked.
- Versioned, documented contract (OpenAPI-style description acceptable in docs) with explicit error and
  idempotency semantics.

## Acceptance criteria
- Documented, versioned API contract; scaffolded endpoints enforce auth, rate limits, and aggregate-only
  responses; programmatic bids flow into the existing auction unchanged.
- Tests cover auth rejection, rate limiting, aggregate-only enforcement, and "clearing logic unchanged."
- Disabled/gated by default if not production-grade, clearly labeled.
- Docs 06, 03, 07 updated with the API contract and its status.

## Commands to run before you finish
```
deno test --allow-env --allow-net=none supabase/functions/
cd web && npm run build && cd ..
```

## Non-negotiables to respect
Read doc 10, esp. rules #10, #11, #16. Reuse the existing auction — do not reimplement clearing.
Aggregate-only, never user-level (doc 06/07). Additive migration only (067). Secrets per doc 07; never
log keys.

## Closing
Answer the doc-10 closing checklist; confirm clearing logic is reused unchanged, responses are
aggregate-only, and state the API's production-readiness honestly.
