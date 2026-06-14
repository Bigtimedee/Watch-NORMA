# P1-11 — Blackout / regional-restriction uncertainty surfacing

> Copy everything below the line into the Claude CLI as a single prompt.

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`02_USER_EXPERIENCE_AND_FLOWS.md` (Streaming Provider Flow), `05_ALERTS_STREAMING_AND_LIVE_SPORTS_LOGIC.md`
(Streaming Routing Rules, esp. rules #4, #6), and `10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`
(rules #7, #15). Inspect `lib/deep-links.ts`, `getBestWatchProvider()`, and the Watch button component.

## Objective
NORMA has no blackout/RSN detection (doc 09). You cannot fully solve blackouts (no API provides it),
but you CAN stop projecting false certainty. Surface uncertainty clearly when a routing decision may
be subject to a regional blackout.

## Why it matters
Rule #15 forbids assuming broadcast availability is universal. Routing a user to a provider that blacks
out their market and presenting it as guaranteed erodes the core trust NORMA sells. Honest uncertainty
beats confident wrongness.

## Scope
- Introduce a lightweight RSN/regional-broadcast classification for broadcast strings (e.g. flag known
  regional networks / "regional" markers in the broadcast field) — data-driven, documented, additive.
- When the selected watch provider is a likely-regional/blackout-prone broadcast, the Watch UI should
  add a clear, non-blocking caveat (e.g. "May be subject to local blackout") rather than implying
  certainty. The deep link still works — this is a labeling change, not a routing change.
- When NO broadcast data exists, ensure the button already shows "Broadcast TBD" (rule #4); fix if not.

## Acceptance criteria
- Tests: regional broadcast → caveat shown; national broadcast → no caveat; no broadcast → "Broadcast TBD".
- No change to the deep-link fallback chain or provider selection logic.
- Docs 02, 05 updated to describe the uncertainty surfacing; doc 09 known-gap entry updated.

## Commands to run before you finish
```
npm test -- --ci
npx tsc --noEmit
```

## Non-negotiables to respect
Read doc 10 rules #2, #3, #4, #6, #7, #15. Do NOT fabricate blackout certainty either — this is about
honest uncertainty. Keep "Watch on [Provider]" the primary action; the caveat is secondary text.

## Closing
Answer the doc-10 closing checklist; confirm this is labeling-only and which docs changed.
