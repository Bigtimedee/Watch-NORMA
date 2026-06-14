# P1-09 — Alert user-feedback loop (thumbs up / down)

> Copy everything below the line into the Claude CLI as a single prompt.

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`02_USER_EXPERIENCE_AND_FLOWS.md`, `05_ALERTS_STREAMING_AND_LIVE_SPORTS_LOGIC.md`, and
`10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md` (rule #13). Inspect `components/AlertCard.tsx`,
`hooks/useAlerts.ts`, and the `alerts` table schema before editing.

## Objective
There is no way for users to rate alert quality (doc 09 known gap). Add a thumbs-up/down control to
the alert card and persist feedback, so scoring weights can later be tuned with real signal.

## Why it matters
"Fewer, better alerts" is the trust contract that makes the supply premium. Without a feedback signal,
scoring-weight tuning is guesswork. Feedback is also the raw material for a future relevance model —
and a better relevance model is literally higher-value ad inventory.

## Scope
- Additive migration (prefix **067**): `alert_feedback` table (id, alert_id FK, user_id, rating
  in ('up','down'), reason TEXT NULL, created_at) with RLS so users write/read only their own rows.
- `AlertCard` gets an unobtrusive up/down control; tapping writes feedback via a new `useAlertFeedback`
  hook. Optimistic UI; idempotent (one rating per user per alert, updatable).
- Do NOT change scoring behavior in this ticket — only collect feedback. (Tuning is a separate ticket
  and requires its own tests per rule #13.)
- Keep the control visually subordinate to the primary "Watch on [Provider]" action (rule #11).

## Acceptance criteria
- Migration applies; RLS verified (user A cannot read user B's feedback).
- Component test: rendering the control, submitting up/down, optimistic update, and update-existing.
- No change to alert generation/scoring output.
- Docs 02 and 05 updated to describe the feedback loop and its (future) use.

## Commands to run before you finish
```
npm test -- --ci
npx tsc --noEmit
deno test --allow-env --allow-net=none supabase/functions/
```

## Non-negotiables to respect
Read doc 10. Don't alter scoring without tests (rule #13) — this ticket deliberately doesn't.
Privacy: feedback is user data, RLS-scoped, minimize fields.

## Closing
Answer the doc-10 closing checklist; confirm the new table, component change, and doc updates.
