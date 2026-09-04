# NORMA Football Season Launch Plan — 2026

**Prepared:** 2026-08-23 · **Live version:** 1.4.0 (build 29) · **Target release:** 1.5.0
**T-minus:** ~6 days to NCAAF Week 1 (Sat Aug 29) · ~18 days to NFL Kickoff (Thu Sept 10)

This document is written to be **delivered to Claude CLI in phases**. Each phase contains a
paste-able prompt (in a fenced block labeled `PROMPT`). Appendix A contains a single master
orchestrator prompt that runs the whole campaign. Every claim below was verified against
`origin/main` on 2026-08-23 with `file:line` evidence where it matters.

---

## 1. Situation Report (verified facts)

**What already works — do not rebuild:**
- NCAAF + NFL are live end-to-end as of **2026-08-19**: `SportKey` includes `ncaaf`/`nfl`
  (`lib/sport-context.tsx`), ESPN ingestion is wired per sport (`poll-schedule/index.ts:26-30`),
  football alert evaluators exist (`evaluateFootballSpread/Total/Moneyline/CloseGame` in
  `evaluate-alerts/logic.ts`), must-notify rules exist (`football_overtime`,
  `football_two_minute`, `football_close_game`), and `ALERTABLE_SPORTS` includes both football
  keys (`evaluate-alerts/index.ts:105`). Floor prices for football ad moments are seeded
  (migration `20260706000004_football_floor_prices.sql`).
- Fantasy roster import exists (`components/ImportRosterSheet.tsx`, `lib/roster-import.ts`).
  Migration `088_follows_fantasy_source.sql` added `follows.source` (`'fantasy'` | NULL) only —
  it did **not** add a platform column. Migration `20260904183000_dfs_fantasy_integration_fixes.sql`
  added `follows.fantasy_source` (prizepicks, underdog, sleeper, …) and the unique constraint
  the upsert requires. Platforms: DraftKings DFS, Yahoo, Sleeper, ESPN Fantasy, PrizePicks,
  Underdog, Other.
- A full marketing/ads backend exists: `cmo-generate`, `cmo-publish`, `generate-social-content`,
  `publish-social-posts`, `growth-weekly-report`, `advertiser-weekly-report`, `morning-briefing`,
  referral codes, share events, partner referral codes, direct-deal campaigns.
- ESPN is the sole primary data source (SportsDataIO removed from client and from
  poll-boxscore/summary/pbp in commits `2d998ca`, `c075852`).

**Critical fact: football has never seen a real game weekend.** It was activated 4 days ago
with zero live-traffic validation. NCAAF Saturdays mean **50+ simultaneous games** — the
orchestrator's concurrency limits (`MAX_PBP_DISPATCHES = 5`, `MAX_SUMMARY_DISPATCHES = 3`,
`MAX_ALERT_DISPATCHES = 10` in `game-watcher-orchestrator/index.ts`) and the Sportradar rate
budget were tuned for basketball nights, not college football Saturdays.

**Verified gaps (found 2026-08-23):**
| # | Gap | Evidence |
|---|-----|----------|
| G1 | **No football odds.** `poll-odds` covers only `basketball_ncaab`, `basketball_nba`, `baseball_mlb` — no `americanfootball_nfl` / `americanfootball_ncaaf`. Wager-line alerts ("your spread is live"), the odds display, and the ad auction's line-movement moments are dead for football. | `poll-odds/index.ts:20-23` |
| G2 | **PrizePicks missing** from `FANTASY_PLATFORMS` (Underdog is present). PrizePicks is the largest DFS pick'em operator — the exact demographic NORMA targets. | `ImportRosterSheet.tsx:17-24` |
| G3 | **Stale gating comments** claim football is "ingestion-only" (`poll-schedule/index.ts:17`, `game-watcher-orchestrator/index.ts:27`) — misleading for future agents; must be corrected so no one "re-activates" what is already live. | verified |
| G4 | **Ten unfixed defects (A–J)** from the 2026-08-20 audit, several catastrophic for football launch (see Appendix B). Worst: quiet hours evaluated in UTC silences roughly 7pm–4am local for Eastern users — exactly when football airs. | `docs/audits/2026-08-20-app-surface-audit.md` |
| G5 | **Orphan Edge Function**: `alert-engine` was deployed to the Supabase project in May but no longer exists in `main` (orchestrator invokes `evaluate-alerts`). It sits deployed, unmaintained, and invokable. | function list vs. `game-watcher-orchestrator/index.ts:208,379` |
| G6 | **"End of" status closes live football games.** `poll-schedule` maps any ESPN status containing `"end of"` to `closed`. ESPN emits "End of 1st Quarter" for football → live games get marked final at every quarter break. `poll-boxscore:233-238` has a recovery net for `"end of period"` rows (comment admits "earlier buggy ESPN status mapping") but the root mapping is still live in two places. | `poll-schedule/index.ts:397,585` |
| G7 | **Sportsbook deep links hardcode basketball.** Every `PROVIDER_TEMPLATES` entry routes to `ncaab`/college-basketball paths (`draftkings://sportsbook/ncaab/game/…` etc.). A "Bet Now" tap on a football game deep-links the user to the sportsbook's college-basketball section. `buildSportsbookLink()` has no sport parameter. | `_shared/sportsbook-links.ts:39-69,76` |
| G8 | **Football period labels render as basketball.** Game detail shows `period > 2 ? "OT{n}" : "Half {n}"` — a football game in Q3 displays "OT1", Q4 displays "OT2". The same class of fallthrough exists in `lib/alert-helpers.ts` `formatClock`. | `app/(tabs)/games/[gameId].tsx:162` |
| G9 | **Player-prop proximity math is basketball-only.** `outcome-proximity` computes minutes elapsed from 20-minute halves (`period === 1 → 20 - clockMins`). For football (15-min quarters ×4) every proximity score — the input to "X is N yards from your Over" alerts — is wrong. | `_shared/outcome-proximity.ts:38` |
| G10 | **Marketing engine doesn't know football exists.** Social content is hardcoded to NCAA basketball: subreddit map (`game_preview → r/CollegeBasketball`), system prompt "NCAA basketball, NBA, and MLB", voice guidance. No football templates, no `r/CFB`/`r/nfl` routing, and the 4–8 posts/day cadence assumes daily games (NFL concentrates ~13 games into Sunday). | `_shared/social-content-engine.ts:47-49,155,220,230` |

**Structural debt (feeds Phases 2 and 4):** `SportKey` is defined in three places that must stay
in sync (`lib/sport-context.tsx`, `lib/types.ts`, `_shared/sportradar.ts`); `SportProvider`/
`SportSelector`/`useSport`/`SPORT_DISPLAY_NAMES` are dead code — the games screen implements its
own sport pills with local state; `evaluate-alerts` carries near-duplicate legacy paths.

> A full working-tree survey (30 sport-touchpoint files, per-function branch mechanisms, the
> 8-point provider-integration checklist) was produced on 2026-08-23 and is folded into the
> phase prompts below. Caution for auditors: that survey predates 51 commits on main — football
> evaluators ARE wired (`evaluate-alerts/index.ts:351-358`), `poll-odds` DOES have a
> `SPORT_CONFIG` (just without football), and `alerts.sport` IS written (fixed in `4fd828b`).
> Always re-verify against `origin/main` before filing a finding.

---

## 2. Operating Rules (bind every agent)

1. **Work from `origin/main`.** The branch `claude/push-latest-update-o2h4J` is 51 commits
   behind and previously shipped a regression (1.2.0 without NBA/MLB) for exactly this reason.
   Phase 0 fixes this. Every session starts with `git fetch origin main` and branches from it.
2. **Additive migrations only** — never edit an applied migration; next number is `091_`.
3. **Do not break 1.4.0.** It is live. Backend deploys must remain compatible with the shipped
   client. No column drops, no renamed function endpoints, no changed request shapes.
4. **Never log tokens or API keys** in Edge Functions.
5. **Respect `docs/watch-norma-context/10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`** — read it
   before writing code.
6. **Every fix ships with a test** (Jest for client/lib, `deno check` + `_test.ts` for functions).
   CI runs TypeScript, Jest, and Deno checks — all must pass before push.
7. **Evidence or it didn't happen.** Audit findings must cite `file:line`. Fixes must state how
   they were verified (test output, query result, curl response).
8. **Deploy chain:** `git push` → CI `deploy-functions` job deploys Edge Functions (added
   2026-08-19). App Store releases go through EAS (`eas build`/`eas submit`), version 1.5.0,
   `autoIncrement` handles buildNumber. Remote build-number tracking is on (commit `9ede234`) —
   do not hand-edit `buildNumber`.

---

## Phase 0 — Reconcile & Baseline (Day 0, ~1 hour)

Goal: one clean starting point; no stale branches able to regress production again.

```PROMPT
Work in the Watch-NORMA repo. Phase 0 of docs/football-season-launch-plan.md.

1. git fetch origin main. Create branch `football-2026/phase-0` from origin/main.
2. Reconcile the stale branch `claude/push-latest-update-o2h4J`:
   - Diff it against main. For each commit unique to it, classify: already on main in
     equivalent form / obsolete / still-wanted. Report the list. Do NOT merge it into main.
   - Expected still-wanted candidates: WhyNowCard.tsx extraction, sportsbooks tier UI,
     entity_type/entity_id fix in useGameDetail.ts (verify main has an equivalent fix —
     search follows inserts for entity_type).
3. Fix G3: correct the stale comments claiming football is "ingestion-only / alerts not
   implemented" at poll-schedule/index.ts:17 and game-watcher-orchestrator/index.ts:27 to
   state that football alerting is ACTIVE (since 2026-08-19, ALERTABLE_SPORTS includes
   ncaaf/nfl).
4. Resolve G5: the deployed-but-orphaned `alert-engine` Supabase Edge Function. Confirm via
   `npx supabase functions list --project-ref shijrazlzawjpobrpmnt` that it exists remotely
   and is absent from supabase/functions/ on main; confirm nothing invokes it (grep client +
   functions + cron migrations for "alert-engine"). If truly orphaned, delete it with
   `npx supabase functions delete alert-engine --project-ref shijrazlzawjpobrpmnt`.
5. Run the full test suite and `npx tsc --noEmit` on your branch to record a green baseline.
6. Commit, push, open a draft PR titled "Phase 0: baseline, stale-comment fixes, orphan
   function cleanup".
Report: branch reconciliation table, orphan-function disposition, baseline test results.
```

---

## Phase 1 — Season-Readiness Audit (Days 0–1)

Goal: find everything that will break on the first football Saturday, plus dead weight to cut.
**Fan out 8 read-only audit agents in parallel** (Agent tool, all in one message), then run a
**verification pass** where a skeptic agent tries to refute each finding before it enters the
fix backlog. Findings without `file:line` evidence are discarded.

```PROMPT
Work in the Watch-NORMA repo on a branch from origin/main. Phase 1 of
docs/football-season-launch-plan.md. You are the ORCHESTRATOR. Read
docs/audits/2026-08-20-app-surface-audit.md first — items A–J are known; do not re-discover
them, but DO verify which are still unfixed at HEAD.

Fan out these 8 audit agents IN PARALLEL (read-only; each must return findings as a list of
{id, severity: blocker|high|medium|low, file:line, claim, failure_scenario, suggested_fix}):

A1 FOOTBALL DATA PATH: Trace ncaaf/nfl end-to-end: poll-schedule → games rows (sport, status
   values ESPN emits for football — verify "halftime"/"inprogress" mapping matches what the
   orchestrator's status filter expects) → poll-boxscore score updates → watcher_state creation
   → evaluate-alerts football evaluators. Flag any basketball assumption applied to football
   (period counts, clock format, "halftime" status, margin buckets, OT detection). Check
   alert-scoring.ts football thresholds against logic.ts evaluators for contradictions.

A2 SATURDAY LOAD: Model 60 concurrent NCAAF games against game-watcher-orchestrator limits
   (MAX_PBP=5, MAX_SUMMARY=3, MAX_ALERT=10 per 1-min cycle) and the Sportradar budget
   (25/min). Compute worst-case poll staleness per game. Check ESPN endpoints for scoreboard
   pagination/group parameters (NCAAF scoreboard defaults to Top-25 only — verify
   poll-schedule fetches ALL FBS games, groups=80). Check api_rate_log behavior under burst.

A3 ODDS & WAGERS: Confirm G1 (no football in poll-odds SPORT_CONFIG). Audit team-matching.ts
   for football team-name collisions (NYG/NYJ "New York", NCAAF duplicated mascots). Verify
   AddWagerSheet, parse-bet-slip, ingest-email-wagers handle football market types. Check
   resolve-wagers settles football finals correctly.

A4 ALERT PIPELINE HEALTH: Re-verify audit items B (quiet hours UTC), C (notifications toggle
   kills in-app feed), G (sport labeling), H (dead `why` field), I (deno check failures in
   evaluate-alerts + intent-api) at current HEAD. Then query production: supabase MCP
   execute_sql — alerts created per day per sport last 14 days, delivery_log failure rate,
   watcher_state rows with stale next_poll times. Diagnose anomalies.

A5 WATCH/STREAMING FOR FOOTBALL: Audit deep-links.ts broadcast mapping for football networks
   (CBS, FOX, NBC, ESPN/ABC, NFL Network, Peacock exclusives, Prime Thursday Night, NFL
   Sunday Ticket/YouTube TV). Verify audit item D status. Check provider_registry has rows
   for football-critical providers; flag missing ones (NFL app, NFL+, Prime Video,
   Paramount+ live CBS games).

A6 GEO-COMPLIANCE: Re-verify audit item A (timezone never collected, fail-open eligibility)
   at HEAD. Football season = peak sportsbook CTA volume; quantify exposure: which
   states/books would be wrongly shown. Propose the minimal compliant fix (collect device
   timezone via Intl.DateTimeFormat().resolvedOptions().timeZone on launch; decide fail-closed
   for CTA when unknown).

A7 DEAD WEIGHT: Build the kill list. Candidates: user_preferences.favorite_teams (audit F),
   alerts.why (audit H), _shared/polling-state.ts (deprecated by watcher_state), any
   SportsDataIO remnants (env vars, team-matching columns, sportsdataio_id usage), social
   publishers scaffolded but never enabled (check social_posts table + fetch-social-metrics
   for platforms with zero rows), unused components/hooks (grep imports). For each: evidence
   it is dead (zero readers / zero production rows), and blast radius of removal.

A8 MOBILE UX FOR FOOTBALL: Review GameCard, game detail, MLBScoreboard-equivalent for
   football (does a football boxscore/scoring-summary view exist, or do football games render
   the basketball layout?), sport pills ordering (football should lead during football
   season), DatePicker week navigation for NFL (games cluster Thu/Sun/Mon — day-by-day
   nav is wrong for NFL; week-based nav needed?). Alert cards: football alert types render
   with proper labels/icons (audit item 3 fixed the mapping — verify).

Then: VERIFY stage — for every blocker/high finding, spawn a skeptic agent with the finding
and instruction "attempt to refute this with code evidence; default to refuted if uncertain."
Discard refuted findings. Output: docs/audits/2026-08-23-season-readiness-audit.md with the
surviving findings ranked, in the same format as the 2026-08-20 audit. Commit and push it.
```

---

## Phase 2 — Fix Sprint (Days 1–3)

Goal: every **blocker** and **high** from Phase 1 plus the pre-known audit items fixed, tested,
deployed. Run as parallel fix agents in **isolated worktrees**, one agent per defect cluster,
orchestrator merges in dependency order.

Pre-seeded backlog (fix even if Phase 1 adds nothing):

| ID | Fix | Key files | Acceptance criteria |
|----|-----|-----------|---------------------|
| FX1 | Quiet hours in user's local time (audit B) | `evaluate-alerts/index.ts:490-503`, `morning-briefing/index.ts:293-306`, `PreferencesSheet.tsx` | Unit test: Eastern user, 23:00–08:00 quiet, game at 21:00 ET → alert delivered; 02:00 ET → push suppressed, in-app created. Input validation rejects non-HH:MM. |
| FX2 | Push toggle must not empty the Alerts tab (audit C) | `evaluate-alerts/index.ts:206-209` | With `notifications_enabled=false`: alert rows still written, delivery_log shows no push, Alerts tab populates. |
| FX3 | Timezone collection + fail-closed CTA (audit A) | `app/_layout.tsx`, `useSportsbookGeo.ts`, `lib/geo-compliance.ts`, `_shared/auction-engine.ts` | Device timezone written to profiles on launch; unknown state → BetNow hidden, auction skips sportsbook creatives. Compliance choice documented in the PR. |
| FX4 | Email-wager alert insert schema mismatch (audit E) | `ingest-email-wagers/index.ts:491-503` | Insert uses `body`/`read` columns; error no longer swallowed; integration test green. |
| FX5 | Football odds (G1) | `poll-odds/index.ts:20-23`, `team-matching.ts` | Add `americanfootball_ncaaf`/`americanfootball_nfl` rows; team matching verified against real Odds API event names for both leagues; game_odds rows appear for football; quota headroom logged (adds 2 sports to quota — A2 must confirm budget). |
| FX6 | MLB-labeled-as-basketball concepts (audit G) | `_shared/alert-scoring.ts:194-202,361,397-399` | MLB branch distinct from basketball; "Game in OT5" impossible for inning 7. |
| FX7 | Deno check failures + CI gap (audit I) | `evaluate-alerts`, `intent-api`, `.github/workflows/ci.yml` | `deno check` green; both functions added to CI list. |
| FX8 | Saturday load tuning (from A2) | `game-watcher-orchestrator/index.ts` | Concurrency/interval strategy for 60-game slates: priority tiers (games with user follows/wagers polled first; ranked matchups next; rest on slow cadence). Documented + unit-tested via lib/__tests__/watcher-orchestrator.test.ts. |
| FX9 | Watch-tab false carriage claims (audit D, football-scoped from A5) | `lib/deep-links.ts:316-319` | Streaming fallbacks only appended when the provider actually carries the network; "Broadcast TBD" not pressable; failure overlay shows an error state. |
| FX10 | **"End of" status closes live football games (G6)** — highest-severity football bug | `poll-schedule/index.ts:397,585` | "End of 1st Quarter"-style statuses map to `inprogress`, only "final" maps to `closed`; regression test with real ESPN football status strings; the poll-boxscore recovery net retained as defense-in-depth. |
| FX11 | Football period labels (G8) | `app/(tabs)/games/[gameId].tsx:162`, `lib/alert-helpers.ts` (`formatClock`) | ncaaf/nfl render Q1–Q4 + OT; ncaam keeps halves; mlb keeps innings; Jest cases for all five sports. Client change → 1.5.0 train. |
| FX12 | Sport-aware sportsbook links (G7) | `_shared/sportsbook-links.ts:37-76` | `buildSportsbookLink(providerKey, slug, sport)`; football paths for DK/FD/BetMGM/Caesars/ESPN Bet verified against each book's current URL structure; ncaab default preserved for basketball; unit tests per provider × sport. |
| FX13 | Football proximity math (G9) | `_shared/outcome-proximity.ts:36-48` | Minutes-elapsed branches per sport (15-min quarters, NFL 10-min OT); prop-proximity test cases for a Q4 football scenario. |

```PROMPT
Phase 2 of docs/football-season-launch-plan.md. You are the ORCHESTRATOR. Input:
docs/audits/2026-08-23-season-readiness-audit.md plus the FX1–FX13 table in the plan.
Merge both into one backlog; dedupe; order by (blocker first, then dependency).
For each item spawn a fix agent in an isolated worktree with: the finding, its evidence,
the acceptance criteria, and Operating Rules 2–7 from the plan. Each agent: implement, add
the test named in the AC, run the full suite + tsc + deno check, commit.
You merge branches sequentially into football-2026/fix-sprint, re-running tests after each
merge. Anything failing after two attempts gets reported, not force-merged.
Finish: push, open PR "Fix sprint: football season readiness", include a table of
finding → commit → test evidence. Deploy Edge Functions via CI merge (not manual deploy).
```

---

## Phase 3 — Timely Features (Days 2–5, parallel with Phase 2 tail)

Goal: features that land **before kickoff** and give new users a reason to install now.

### F1 — PrizePicks integration (the named ask)
PrizePicks has **no public consumer API** (same as DraftKings/FanDuel — see CLAUDE.md Tier A).
The buildable-now integration is three-tier, reusing existing rails:
1. **Roster/entry import (Tier C):** add `{ value: "prizepicks", label: "PrizePicks" }` to
   `FANTASY_PLATFORMS` (`ImportRosterSheet.tsx:17-24`) — players from PrizePicks entries become
   follows with `source='fantasy'` and `fantasy_source='prizepicks'`
   (088 = `source`; `20260904183000` = `fantasy_source` + upsert constraint).
2. **Entry-slip scan (Tier B):** extend `parse-bet-slip` prompt/schema to recognize PrizePicks
   entry screenshots (player + stat projection + more/less + entry fee + payout multiplier) and
   map to a wager with `market_type='player_prop'`, `provider_key='prizepicks'`, legs jsonb.
   The existing `outcome-proximity` module then powers "Jefferson is 18 yards from your Over"
   alerts — this is the killer feature and it's mostly wired already.
3. **Provider registry + deep link:** add `prizepicks` row (category `sportsbook` or new
   `dfs_pickem`), scheme `prizepicks://`, universal link `https://app.prizepicks.com`, App
   Store fallback; add scheme to `LSApplicationQueriesSchemes` in app.json (client release).
   Do the same for `underdog` (scheme `underdog://`) since the platform is already listed.

**Complete integration checklist (verified touchpoints — miss one and the feature half-works):**
1. Seed migration (next number) into `streaming_providers`: key/name/category/schemes/links;
   note DFS pick'em is legally distinct from sportsbooks in many states — prefer a
   `dfs_pickem` category so geo-gating (FX3) can treat it separately.
2. `app.json` `LSApplicationQueriesSchemes` += `"prizepicks"` (and `"underdog"`) — without
   this, iOS `Linking.canOpenURL` silently returns false and every deep link falls to web.
   **Most commonly missed step.**
3. `_shared/sportsbook-links.ts` `PROVIDER_TEMPLATES` — PrizePicks links target a
   player/board, not a `{away}-at-{home}` game slug; the template interface needs a variant.
   (Do this after FX12 lands the `sport` parameter.)
4. `_shared/email-parser.ts` sender-domain map += `"prizepicks.com": "prizepicks"`; entries
   are multi-leg projections, not spread/ML/total — extend the normalized shape or rely on
   the Claude fallback parser, with a fixture test from a real PrizePicks email format.
5. `parse-bet-slip/index.ts` vision prompt enumerates books literally — add `"prizepicks"`
   or screenshots get misattributed.
6. `lib/constants.ts` `SPORTSBOOK_NAMES` += `prizepicks: "PrizePicks"`.
7. Connections UI is registry-driven — verify the new category appears (or add it to the
   category list in `app/(tabs)/connections/`).
8. `deep-link-health-check` is registry-driven — no change, but confirm the new key shows up
   in its output after seeding.

### F2 — Football game-detail experience
If A8 confirms football renders the basketball layout: a `FootballScoreboard` component
(quarter line score, down & distance + possession from ESPN summary, scoring plays list),
mirroring how `MLBScoreboard.tsx` was added for MLB.

### F3 — Football alert types that market themselves
Red-zone alerts (`football_red_zone`: followed/wagered team inside the 20), upset watch
(`football_upset_watch`: ranked NCAAF team trailing in Q4 — ESPN scoreboard exposes `rank`),
and NFL week navigation in DatePicker if A8 flags it. Each new alert type: scoring weight,
must-notify decision, floor-price row (extend migration pattern `20260706000004`), label/icon
in `lib/alert-helpers.ts`, and a Jest test.

### F4 — Season-opener engagement pushes
Extend `morning-briefing` with a Saturday-morning NCAAF slate briefing and NFL
Thursday/Sunday editions, personalized: lead with games the user follows/wagered, else
top-ranked matchups. Respect FX1's fixed quiet hours.

```PROMPT
Phase 3 of docs/football-season-launch-plan.md. ORCHESTRATOR: spawn four parallel feature
agents in isolated worktrees: F1 PrizePicks (all three tiers as specified — client list,
parse-bet-slip extension with schema + tests, migration 091 provider rows, app.json schemes),
F2 FootballScoreboard (only if the Phase 1 A8 report confirmed the gap; follow
MLBScoreboard.tsx as the pattern), F3 football alert types (red zone, upset watch; full
wiring: evaluator, scoring, floor price migration 092, helpers, tests), F4 briefing editions.
Each agent follows Operating Rules 2–7. Client-visible changes (F1 scheme additions, F2, F3
labels) go in the 1.5.0 release train; backend pieces deploy via CI immediately and must be
no-ops for the 1.4.0 client. Merge order: F1 → F3 → F4 → F2. PR per feature, draft, with
screenshots (npx expo start + screenshot for UI work if feasible, else rendered description).
```

---

## Phase 4 — Deprecation Sweep (Day 4)

Goal: delete what A7 proved dead. **Gate: nothing is deleted without the A7 evidence standard
(zero readers or zero production rows) plus one skeptic-agent confirmation.**

Expected kill list (confirm first): `alerts.why` writes (audit H — keep column, stop writing,
or render it — decide, don't leave half-dead); `user_preferences.favorite_teams` (audit F —
either wire it into candidate generation as follows-sync, which is a small win, or remove the
picker; wiring is preferred: it converts an existing UI promise into real behavior);
`_shared/polling-state.ts`; SportsDataIO env vars + dead code paths; social publisher stubs
with zero production rows; the `alert-engine` orphan (done in Phase 0).

Verified-dead client code (2026-08-23, still true on main): `SportProvider` is never mounted,
`SportSelector.tsx` is imported by nothing, `useSport()` and `SPORT_DISPLAY_NAMES` have no
consumers — the games screen implements its own sport pills with local state
(`app/(tabs)/games/index.tsx`). Either adopt the context (it would give the Alerts tab the
sport filter it currently lacks — `useAlerts()` is called with no sport argument) or delete
all four. Adopting is preferred: one sport selector, persisted, shared by Games and Alerts.
Also verify `MLBScoreboard.tsx`/`useMLBStats.ts` import status before assuming they're live.
Consolidate the triple `SportKey` definition to a single source imported everywhere.

```PROMPT
Phase 4 of docs/football-season-launch-plan.md. Input: the A7 kill list from the Phase 1
audit. For each candidate: one agent verifies the evidence still holds, then either (a)
deletes it (code + additive migration comment marking column deprecated — never drop
columns), or (b) for favorite_teams, implements the sync: saving favorites upserts
team-follows so candidate generation picks them up, and the sheet copy becomes true.
Tests + tsc + deno check green. Single PR "Deprecation sweep" listing each removal with its
evidence.
```

---

## Phase 5 — Marketing Blitz (Days 3–6, parallel)

Goal: the existing marketing machine aimed at football. This is configuration and content, not
new infrastructure.

| M | Action | Where |
|---|--------|-------|
| M1 | Make the social engine football-aware (G10): thread `sport` through `GameData`/`generatePostContent`; replace the hardcoded "NCAA BASKETBALL" prompt header and "NCAA basketball, NBA, and MLB" system prompt (`social-content-engine.ts:220,230,331`); sport-conditional subreddit routing — `r/CFB` for NCAAF, keep `r/sportsbook` as NFL default (`r/nfl` bans self-promo); add football scenario vocabulary (backdoor cover, red-zone stand, primetime slate, RedZone window); fix `generate-social-content`'s unfiltered games query (currently leaks NBA/MLB into "NCAA" posts); rework the 4–8/day cadence to day-of-week weighting (NFL Sundays and NCAAF Saturdays concentrate the whole slate); add football screenshots to `media_assets` so promo posts don't show basketball UI; add kickoff-week/Thanksgiving/playoffs themes to `cmo-generate` weights. | Edge Functions + cron config |
| M2 | App Store product page for 1.5.0: new screenshots featuring football games + football alerts (current screenshots are basketball-only — verified in ASC), promotional text ("College football and NFL alerts are here"), keyword field additions (NFL alerts, college football, fantasy football alerts, pick'em). Prepare the copy + screenshot shot-list as `docs/marketing/asstore-1.5.0.md`; the human executes in ASC. | docs + ASC (human) |
| M3 | Advertiser one-pager: football CPM inventory (the floor-price rows from `20260706000004` + new F3 moments), Saturday/Sunday impression forecasts from `forecast-supply`. Output `docs/sales/football-2026-inventory.md`. | docs |
| M4 | Growth loops: verify referral flow end-to-end (audit fixed the domain + false-reward copy in `7867c16` — confirm), then add a post-alert share prompt after a user's first football alert ("Share this moment" → share_events). | client (1.5.0) |
| M5 | Partner outreach refresh: update `docs/partnerships/fantasy-partner-brief.md` to feature the shipped PrizePicks/Underdog import (F1) and football alerts; update `docs/sales/target-accounts.md` with pick'em operators. | docs |

```PROMPT
Phase 5 of docs/football-season-launch-plan.md. ORCHESTRATOR: spawn M1–M5 as parallel
agents (M1 backend-config, M2/M3/M5 docs, M4 client). M1 must verify sport-awareness of the
social engine with a dry-run invocation (cmo-generate with a football game id from
production games table via supabase MCP) before adding templates. M4 lands in the 1.5.0
train. All copy: no fabricated stats, no promises the code doesn't keep (the 2026-08-20
audit caught a false referral reward — that class of defect is banned). One PR for backend,
one for docs, M4 into the release train.
```

---

## Phase 6 — Release 1.5.0 + Opening-Weekend Live Ops (Day 5 → gameday)

1. **Release train:** merge Phases 2–5 client work → `main`, bump `app.json` version to
   `1.5.0`, `eas build --platform ios --profile production --non-interactive`, then
   `eas submit --platform ios --latest --non-interactive`. Human: create 1.5.0 in App Store
   Connect, attach the build, paste M2 release notes, submit. **Target: submitted by Aug 26**
   so review (24–48h) clears before Saturday.
2. **Live-fire drill (first NCAAF Saturday):** a monitoring session running through gameday:

```PROMPT
Live ops for NCAAF Week 1 (docs/football-season-launch-plan.md Phase 6). Use /loop with a
15-minute cadence from 11:00 ET. Each tick, via supabase MCP: (1) watcher_state — count
active football watchers vs. games with status inprogress; flag any next_poll >5 min
overdue; (2) alerts created last 15 min by sport + alert_type — zero football alerts while
20+ live football games with follows/wagers is a red flag; (3) delivery_log failure rate;
(4) api_rate_log Sportradar + Odds API headroom; (5) query_logs for evaluate-alerts,
poll-boxscore, game-watcher-orchestrator errors. On anomaly: diagnose read-only, report
with evidence, propose the minimal fix; do NOT hot-patch production during live games
without human confirmation. End of day: write docs/audits/2026-08-29-week1-livefire.md.
```

3. Repeat the drill for NFL Kickoff Thursday with NFL-specific checks (Thursday single-game
   load is trivial; the test is Sunday's 1pm slate — 9+ concurrent NFL games + full NCAAF
   Saturday the day before).

---

## Appendix A — Master Orchestrator Prompt (single paste)

```PROMPT
You are the campaign orchestrator for NORMA's 2026 football season launch. The complete
plan is docs/football-season-launch-plan.md — read it fully first, then execute phases 0
through 5 in order (Phase 6 requires human release actions; prepare everything and stop at
the eas submit step for confirmation). Phases 2/3/5 run their internal agents in parallel;
phases must complete their verification gates before the next begins, except Phase 3 which
may start once Phase 1's audit report exists. Fan out sub-agents exactly as each phase's
PROMPT block specifies; you own merge order, conflict resolution, and the quality gates
(tests + tsc + deno check green before any merge; skeptic verification for audit findings
and deletions). Track everything in a task list. Report at each phase boundary: what
shipped, what was cut, what needs a human decision. Operating Rules section 2 binds you and
every agent you spawn. Hard deadline: client work merged and 1.5.0 build submitted by
Aug 26; backend fixes deploy continuously via CI.
```

## Appendix B — Known defect backlog (from 2026-08-20 audit, unfixed at that date)

A timezone/geo fail-open (→FX3) · B quiet hours UTC (→FX1) · C push toggle kills in-app feed
(→FX2) · D watch-tab false carriage (→FX9) · E email-wager alert insert always fails (→FX4) ·
F favorite_teams dead column (→Phase 4, prefer wiring) · G MLB basketball labels (→FX6) ·
H dead `alerts.why` (→Phase 4) · I deno check failures outside CI (→FX7) · J inconsistent
App Store ID on web pages (`web/src/app/partners/[partnerKey]/page.tsx:5` — correct ID is
6759508383 per eas.json; fix in Phase 2 as a one-liner).

## Appendix C — Environment cheat sheet

- Supabase project ref: `shijrazlzawjpobrpmnt`; deploys via CI `deploy-functions` job on merge
  to main; manual deploy needs a fresh `sbp_` token (Account → Access Tokens; they have been
  rotated twice — always test with `supabase projects list` first).
- EAS: `EXPO_TOKEN` env var; ASC App ID `6759508383`; Apple team `RACZS57SUP`; production
  profile auto-increments build number (remote tracking — don't hand-edit).
- Odds API quota: adding 2 football sports increases daily usage ~66% — A2/FX5 must confirm
  plan headroom before enabling both; `ODDS_DISABLED_SPORTS` env var is the kill switch.
- Sport keys: `ncaam` `nba` `mlb` `ncaaf` `nfl` (`lib/sport-context.tsx`).
- Next migration number: `091_`.
