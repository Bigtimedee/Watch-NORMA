# P2-02 — Real-time auction monitoring dashboard

> Copy everything below the line into the Claude CLI as a single prompt.
> Best run AFTER P2-01 (consumes `intent_moments`).

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`06_ADS_MONETIZATION_AND_AUCTION_LOGIC.md` and `10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`. Inspect
the Next.js advertiser portal under `web/` (especially `/admin/auction-engine`, `/admin/revenue`,
`/admin/fraud`), `_shared/auction-engine.ts`, and the `impressions` / `intent_moments` tables.

## Objective
Doc 09 flags "No real-time auction monitoring dashboard." Add an admin live view of auctions: moments
firing, fill rate, clearing prices, floor utilization, and no-fill reasons — updating in near-real-time.

## Why it matters
You cannot run a marketplace you cannot watch. Live auction telemetry is how you spot under-priced
floors, demand gaps (lots of supply, no bids), and fill collapse during peak slates — the operational
nerve center for yield.

## Scope
- New admin page `web/src/app/admin/auction-engine/live` (or a panel on the existing auction page):
  rolling windows (last 5/15/60 min) of: moments fired by type, fill rate, avg/median clearing price,
  floor vs. clearing ratio, no-fill reason breakdown, eligible-bid counts.
- Data via Supabase Realtime subscription on `impressions`/`intent_moments` and/or a lightweight
  `reporting-api` aggregate endpoint. Admin-role gated (`_shared/admin.ts`, web middleware).
- Strictly aggregate — NO user-level data in the advertiser/admin UI (doc 06/07).
- Charts via the existing Recharts dependency.

## Acceptance criteria
- Admin sees live fill rate + clearing price + no-fill reasons that update as auctions occur.
- Non-admins are blocked by middleware.
- No user-identifying fields exposed.
- Doc 06 (Advertiser Portal pages) updated to list the live dashboard.

## Commands to run before you finish
```
cd web && npm run build && cd ..
npm test -- --ci
```

## Non-negotiables to respect
Read doc 10, esp. rule #11. Admin/aggregate only; never expose user identity to advertisers. Don't
change auction clearing logic — visualize it.

## Closing
Answer the doc-10 closing checklist; confirm admin gating and aggregate-only data.
