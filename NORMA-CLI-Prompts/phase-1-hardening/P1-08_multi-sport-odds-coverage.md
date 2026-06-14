# P1-08 — Multi-sport odds coverage (NBA / MLB) verification + extension

> Copy everything below the line into the Claude CLI as a single prompt.

---

You are working in the Watch-NORMA repository. Read `docs/watch-norma-context/README.md`, then
`04_DATA_AND_INTEGRATIONS.md` (The Odds API), `05_ALERTS_STREAMING_AND_LIVE_SPORTS_LOGIC.md`, and
`10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`. Inspect `supabase/functions/poll-odds/` and
`_shared/team-matching.ts` before editing.

## Objective
Doc 09 flags "Limited MLB odds support" — `poll-odds` is configured for `basketball_ncaab` and it is
unverified whether NBA/MLB odds are ingested. Verify, and extend `poll-odds` to cover the sports
NORMA already supports (NCAAM, NBA, MLB) where The Odds API offers them.

## Why it matters
Wager-driven moments are the highest-value inventory in the auction (spread/total/ML alerts carry the
top floor prices). If odds only exist for NCAAM, NBA and MLB wager alerts — and their premium ad
moments — silently never fire. This is directly revenue-limiting.

## Scope
- Audit `poll-odds` and document exactly which sport endpoints are currently called.
- Add the additional Odds API sport keys (e.g. `basketball_nba`, `baseball_mlb`) behind a clear
  config list, reusing the existing fuzzy team-matching and `game_odds` write path.
- Respect The Odds API quota: stagger or batch requests; keep the 5-minute cadence; add a guard so a
  new sport can be disabled via config without code changes.
- Verify team-matching across the added sports (watch for cross-sport name collisions) and add
  matching tests for any new aliases.

## Acceptance criteria
- A short written audit of current vs. new coverage is added to doc 04.
- NBA and MLB odds are ingested into `game_odds` when available, matched to the correct games.
- No increase in false-positive team matches (tests prove it).
- Odds API quota usage documented; new sports toggleable via config.

## Commands to run before you finish
```
deno check supabase/functions/poll-odds/index.ts
deno test --allow-env --allow-net=none supabase/functions/
```

## Non-negotiables to respect
Read doc 10. Don't fabricate odds when the API has none for a game (rule #7). Don't break NCAAM
coverage. Additive migration only if schema changes (prefix **067**).

## Closing
Answer the doc-10 closing checklist; report the actual current coverage you found and what you added.
