# P1-04 — Data-retention cleanup jobs

> Copy everything below the line into the Claude CLI as a single prompt.

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`04_DATA_AND_INTEGRATIONS.md`, `07_SECURITY_PRIVACY_AND_RISK.md`, and
`10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`. Inspect the schema for `game_snapshots`, `delivery_log`,
`impressions`, `conversions`, and `deep_link_events` before editing.

## Objective
High-volume tables accumulate indefinitely (doc 09: "No data retention policy"). Add scheduled
cleanup jobs with conservative, configurable retention windows.

## Why it matters
Two reasons: cost/performance at March Madness scale, and privacy minimization (doc 10 rule #16 —
"Do not store more sensitive user data than necessary"). Retention is both an ops and a compliance need.

## Scope
- Add an additive migration (next prefix **067**) that creates a `purge-old-data` pg_cron job (daily,
  off-peak e.g. 4 AM ET) calling a new `purge-old-data` Edge Function, OR a SQL function invoked by cron.
- Retention defaults (make them constants / a small config table, not magic numbers):
  - `game_snapshots`: 30 days
  - `deep_link_events`: 90 days
  - `delivery_log`: 180 days
  - `impressions` / `conversions`: keep raw 13 months (advertiser reporting needs YoY); ensure any
    materialized rollups are preserved before raw purge.
- Deletes must be batched (e.g. `DELETE ... WHERE created_at < cutoff LIMIT n` loop) to avoid long locks.
- Confirm no foreign-key cascade orphans anything advertisers still report on.

## Acceptance criteria
- Migration applies cleanly; cron job registered.
- A dry-run / count mode logs how many rows WOULD be deleted before any destructive run.
- Advertiser reporting (`reporting-api`, `/reporting`, `/admin/revenue`) still returns correct
  aggregates after purge (rollups preserved).
- Docs updated: doc 04 (data lifecycle), doc 07 (retention/minimization), doc 08 (new cron job + QA item).

## Commands to run before you finish
```
deno check supabase/functions/purge-old-data/index.ts
deno test --allow-env --allow-net=none supabase/functions/
```

## Non-negotiables to respect
Read doc 10. Additive migration only (067). Never delete data advertiser billing/reporting depends on
without preserving rollups. Privacy-minimize, but don't break revenue reporting.

## Closing
Answer the doc-10 closing checklist; confirm which docs were updated and what retention windows you chose.
