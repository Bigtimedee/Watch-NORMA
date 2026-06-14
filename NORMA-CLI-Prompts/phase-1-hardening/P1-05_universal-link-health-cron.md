# P1-05 — Automated universal-link health verification cron

> Copy everything below the line into the Claude CLI as a single prompt.

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`04_DATA_AND_INTEGRATIONS.md` (Deep Linking), `05_ALERTS_STREAMING_AND_LIVE_SPORTS_LOGIC.md`
(Streaming Routing Rules), and `10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md` (rules #2, #3, #14).
Inspect `lib/deep-links.ts`, the `provider_registry` table, `supabase/functions/deep-link-health-check/`,
and migrations 052–054 (YouTube TV history) before editing.

## Objective
`deep-link-health-check` currently analyzes *client-reported* `deep_link_events` after the fact. Add a
**proactive** cron that periodically fetches each provider's `universal_link` and verifies it returns
HTTP 200 or a redirect to a watch/login route — NOT a marketing/sign-up page. (Doc 09 near-term roadmap.)

## Why it matters
Streaming routing is a non-negotiable, repeatedly-regressing path (YouTube TV took three migrations to
fix). Catching a bad universal link before users hit it protects the single most important user action
and the credibility of every "Watch on [Provider]" alert.

## Scope
- Extend `deep-link-health-check` (or add `verify-provider-links`) to iterate `provider_registry`
  rows where `category IN ('streaming','tv')`, issue a HEAD/GET to `universal_link`, and classify:
  ok (200 / redirect to a watch/login path), suspect (redirect to a marketing/welcome/signup path),
  broken (4xx/5xx/timeout). Use an `AbortController` timeout (~10s), consistent with existing fetch patterns.
- Maintain a small allowlist/denylist of path fragments that indicate a marketing page
  (e.g. `/welcome`, `/signup`, `/get-started`) — make it data-driven, documented.
- Record results to a `provider_link_checks` table (additive migration, prefix **067**) and post to
  `SLACK_WEBHOOK_URL` on any provider flipping to suspect/broken.
- Register a cron (e.g. every 6 hours).

## Acceptance criteria
- Given a mocked provider whose universal link 302s to `/welcome`, it is classified `suspect` and alerts.
- Given a provider returning 200 on a watch route, it is `ok` and silent.
- Does not modify routing behavior in `lib/deep-links.ts` — verification only.
- Docs 04, 05, 08 updated to describe proactive link verification.

## Commands to run before you finish
```
deno check supabase/functions/deep-link-health-check/index.ts
deno test --allow-env --allow-net=none supabase/functions/
npm test -- --ci
```

## Non-negotiables to respect
Read doc 10 rules #2, #3, #14. Do not change `universal_link` values in this ticket — only detect bad
ones. Never route subscribers to marketing pages; this tool exists to catch exactly that.

## Closing
Answer the doc-10 closing checklist; confirm the new table, cron, and doc updates.
