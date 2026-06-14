# P1-03 — Automated health monitoring + paging

> Copy everything below the line into the Claude CLI as a single prompt.

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`08_TESTING_DEPLOYMENT_AND_OPERATIONS.md` (Observability) and `10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`.
Inspect `supabase/functions/health-check/`, `supabase/functions/deep-link-health-check/`, and how the
existing `SLACK_WEBHOOK_URL` secret is used by the CMO functions, before editing.

## Objective
The `health-check` and `deep-link-health-check` endpoints exist but nothing calls them on a schedule
or pages on failure (doc 09: "No automated alerting on system degradation"). Add an automated monitor.

## Why it matters
The 37-day ESPN outage went unnoticed for weeks. A marketplace cannot sell "certainty that a viewer is
about to tune in" if the supply pipeline can silently die. Automated paging is the floor of operability.

## Scope
- Add a `monitor-health` Edge Function (or extend an existing ops function) that:
  1. Invokes `health-check` and `deep-link-health-check` internally (service-role).
  2. Parses the results (stale watchers, alert-pipeline starvation, Sportradar budget low, any
     provider marked degraded/critical, HTTP 503).
  3. Posts a structured alert to `SLACK_WEBHOOK_URL` ONLY when a threshold is breached (avoid noise:
     dedup repeated identical alerts within a cooldown window stored in a small `ops_alert_state` table).
- Add an additive migration (next prefix **067**) for the cron schedule (every 5 min) and the
  `ops_alert_state` dedup table with RLS locked to service role.
- Never log secrets or webhook URLs.

## Acceptance criteria
- New function deploys and, given a simulated degraded health-check response, posts exactly one Slack
  alert and suppresses duplicates within the cooldown.
- Healthy responses produce no Slack noise.
- Migration is additive and applies cleanly in the CI migrations job.
- Doc 08 (Observability + Daily QA Checklist) updated to describe the automated monitor.

## Commands to run before you finish
```
deno check supabase/functions/monitor-health/index.ts
deno test --allow-env --allow-net=none supabase/functions/
```

## Non-negotiables to respect
Read doc 10. Additive migration only (prefix 067). No secret logging. Don't change what health-check
measures — only consume it.

## Closing
Answer the doc-10 closing checklist. State whether you added a function, table, and cron job, and
confirm the docs were updated.
