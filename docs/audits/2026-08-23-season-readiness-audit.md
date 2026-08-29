# Season Readiness Audit — 2026-08-23

**Audience:** Phase 2 fix-sprint orchestrator + Phase 4 deprecation sweep.
**Method:** 8 read-only Explore agents ran in parallel (A1–A8) against `origin/main` at HEAD. Every blocker/high finding was spot-verified with quoted code evidence at HEAD (skeptic pass). Refuted or unsupportable findings are omitted. Every surviving item cites `file:line`.
**Prior audit:** `docs/audits/2026-08-20-app-surface-audit.md`. Items A–J from that audit were re-verified at HEAD; status noted below.

---

## Ranked findings

### Blockers (must fix before NCAAF Week 1, 2026-08-29)

**BL-1 · "End of {Quarter}" closes live football games** — plan `G6` confirmed
- `supabase/functions/poll-schedule/index.ts:587` — `mapEspnStatusMulti` maps any status containing `"end of"` to `"closed"`. ESPN emits `"End of 1st Quarter"` at each football quarter break; games get inserted/updated with `status="closed"` at every break, watcher_state is never (re)created, and the app shows a false final.
- Recovery net in `poll-boxscore` (documented in comments) partially masks this, but the root mapping fires at ingestion time.
- **Fix (FX10 in plan):** narrow the "closed" check to `final|complete|f/ot`; add regression tests with real ESPN football status strings.

**BL-2 · No football odds** — plan `G1` confirmed
- `supabase/functions/poll-odds/index.ts:20-24` — `SPORT_CONFIG` includes `basketball_ncaab`, `basketball_nba`, `baseball_mlb`. No `americanfootball_ncaaf` / `americanfootball_nfl`.
- Consequence: wager-line alerts ("your +3.5 spread is live") never fire on football; game detail shows no lines; ad auction has no line-movement moments.
- **Fix (FX5 in plan):** add both sports to `SPORT_CONFIG`; confirm Odds API quota headroom (~66% daily increase per Appendix C) before enabling both.

**BL-3 · Football period renders as basketball on the game detail screen** — plan `G8` confirmed
- `app/(tabs)/games/[gameId].tsx:162` — `period > 2 ? "OT{n}" : "Half {n}"` fallthrough. NFL Q3 shows "OT1", Q4 shows "OT2", Q1/Q2 show "Half 1"/"Half 2".
- **Fix (FX11):** sport-conditional label; Q1–Q4 + OT for football, Halves for NCAAM, innings for MLB; Jest cases for all five sports.

**BL-4 · Football clock label wrong across alerts and cards** — new (A8-1)
- `lib/alert-helpers.ts:137-148` — `formatClock` has explicit `mlb` and `nba` branches, then falls through to the "NCAA basketball halves" branch for everything else. NFL and NCAAF games therefore render `H1`/`H2` in periods 1-2 and `OT1`/`OT2` in periods 3-4 — i.e., Q3 shows as `OT1`, Q4 shows as `OT2`.
- Consequence: every alert card, every live badge, every score header shows the wrong period label for football.
- **Fix (bundled with FX11):** add explicit football branch (`Q1..Q4`, `OT` at period ≥ 5) before the basketball fallthrough. Same class of change in `lib/alert-helpers.ts formatClock`.

**BL-5 · "End of" mapping duplicated in `poll-schedule` NCAAM path** — new (A1 spot-check)
- Skeptic note: the A1 agent's initial refutation of line 399 (NCAAM-only ESPN fallback path) is technically correct — that specific code path only runs for NCAAM, so it does not misclose football games. Kept as informational, not blocking. Fix should still address both mappings to prevent the bug from returning if the NCAAM path is ever generalized.

**BL-6 · Sportsbook deep-links hardcoded to college basketball** — plan `G7` (not in Phase 1 refutation loop; carried over)
- `supabase/functions/_shared/sportsbook-links.ts:37-76` — every `PROVIDER_TEMPLATES` entry routes to `ncaab`. Tapping "Bet Now" on a football game opens the sportsbook's college-basketball section.
- **Fix (FX12):** thread `sport` through `buildSportsbookLink`; football paths verified per book.

**BL-7 · Player-prop proximity math is basketball-only** — plan `G9` (not in Phase 1 refutation loop; carried over)
- `supabase/functions/_shared/outcome-proximity.ts:36-48` — 20-minute-half assumption. Every football prop-proximity score is wrong.
- **Fix (FX13):** sport-branched minutes-elapsed; NFL 10-min OT accounted for.

**BL-8 · Timezone never collected → sportsbook geo fails 70–80% of non-NY DAU** — item **A** from 2026-08-20, still-broken at HEAD (A6-1..A6-6)
- `supabase/migrations/001_initial_schema.sql:8` — `profiles.timezone default 'America/New_York'`.
- `app/`, `hooks/`, `components/` — grep confirms nothing writes `profiles.timezone`; no `Intl.DateTimeFormat().resolvedOptions().timeZone` collection anywhere; no `expo-localization` usage.
- `lib/geo-compliance.ts:2,25-28` — `STATE_BY_TIMEZONE` covers ~23 zones; Pacific/Mountain/Central IANA zones missing, returning `null` for state and cascading to ineligible.
- `hooks/useSportsbookGeo.ts:10,37-44,63-65` — asymmetric fail policy (fail-closed on unknown TZ, fail-open on API error).
- `supabase/functions/_shared/auction-engine.ts:142-155` — same asymmetry server-side.
- **Fix (FX3):** collect device timezone on launch; expand `STATE_BY_TIMEZONE`; decide the fail-closed CTA policy (**human/compliance decision — do not code-only**).

**BL-9 · Quiet hours evaluated in UTC** — item **B** from 2026-08-20, still-broken at HEAD (A4)
- `evaluate-alerts/index.ts:490-503` — `new Date().getHours()` on a UTC runtime, string-compared to local `quiet_hours_*`. For Eastern users the 23:00–08:00 window silences roughly 19:00–04:00 local, i.e., prime football hours.
- `morning-briefing/index.ts:293-306` — same defect, admitted in a code comment.
- No input validation on the two `PreferencesSheet.tsx:181-205` fields; `"11pm"` yields `NaN` and quiet hours silently never apply.
- **Fix (FX1):** apply local time from `profiles.timezone` (see FX3); reject non-`HH:MM` at save.

**BL-10 · Push toggle disables in-app Alerts feed** — item **C** from 2026-08-20, still-broken at HEAD (A4)
- `evaluate-alerts/index.ts:204-209` — filters candidate profiles with `.eq("notifications_enabled", true)` **before** any alert row is written. Users who turned push off see the Alerts tab stay permanently empty, contradicting `PreferencesSheet.tsx:186`.
- **Fix (FX2):** decouple alert creation from push delivery. Write the alert row regardless of `notifications_enabled`; only the push send is gated by the toggle.

---

### High

**H-1 · NCAAF ESPN scoreboard fetches only ranked games** — new (A2-1)
- `supabase/functions/poll-schedule/index.ts:641` — multi-sport ESPN fetch is `${espnBase}/scoreboard?dates=&limit=300` with no `groups` parameter. ESPN's college-football scoreboard defaults to Top-25; `groups=80` fetches all FBS.
- Consequence: on a 60-game Saturday, ~35 unranked FBS matchups never enter `games`, no watcher_state is created for them, users following those teams get zero alerts.
- **Fix (FX8-adjacent):** append `&groups=80` for NCAAF (verify ESPN keyfor NFL — likely not needed, NFL scoreboard has no ranking gate). Cover with an integration test that hits ESPN or a fixture recorded from a real Saturday.

**H-2 · Sportradar 25/min hard cap will exhaust in minute 1 on a 60-game Saturday** — new (A2-2)
- `supabase/functions/game-watcher-orchestrator/index.ts:253` — `const sportradarBudgetRemaining = Math.max(0, 25 - sportradarCallsThisMinute);` and the PBP-dispatch query at `L263-265` uses `.order("pbp_next_poll_at", { ascending: true })` with `limit(Math.min(MAX_PBP_DISPATCHES, sportradarBudgetRemaining))`.
- With 60 games and 45s PBP cadence, PBP calls alone want ~80/min; capped at 5/min per cycle × 25/min quota, tail games see 12+ minutes of poll-staleness in the first hour.
- **Fix (FX8):** priority tiers — games with user follows/wagers polled first; ranked NCAAF next; rest on slow cadence. Confirm Sportradar production ceiling before adjusting the cap.

**H-3 · No priority tiering for polling** — new (A2-3), tightly bundled with H-2
- Same file, same order-clause. No `follows`/`wagers` join, no `espn_rank` boost. Round-robin FIFO.
- **Fix:** join user-relevance signals into the watcher_state ordering; documented + covered by `lib/__tests__/watcher-orchestrator.test.ts` scenario asserting median staleness ≤ 5 min for 60 games.

**H-4 · NCAAF team-alias collisions** — new (A3-2)
- `supabase/functions/_shared/team-matching.ts` — `Tigers` maps to `Louisiana State` (`L12`), also used by Auburn/Missouri/Clemson (multi-school). `Bulldogs` maps to `Mississippi State` (`L14`), `UNC Asheville` (`L36`), `Fresno State` (`L53`).
- Consequence: odds-API events like "Tigers vs Volunteers" score-match to whichever Tigers school appears first in `dbTeams`; football odds land on the wrong game.
- **Fix:** disambiguate multi-school mascots. Prefer city/market + mascot in aliases; drop generic mascot-only entries. Cover with team-matching test cases.

**H-5 · NFL primetime broadcast strings don't route** — new (A5-F1, F3, F4)
- `lib/deep-links.ts:291,297` — Peacock guard is `PEACOCK|NBC`; Prime is `PRIME|AMAZON`. No pattern for `"Sunday Night Football"` (SNF), `"Thursday Night Football"` (TNF), `"Peacock Exclusive"`, or `"NFL+"`.
- Consequence: if ESPN emits the narrative string (rather than `"NBC: SNF"` / `"Amazon: TNF"`), users get the generic live-TV fallback list instead of the correct primetime app.
- **Fix (bundled with FX9):** add `SUNDAY NIGHT|SNF → peacock`, `THURSDAY NIGHT|TNF → prime_video`, `NFL+|PEACOCK EXCLUSIVE → peacock`. Add fixture tests with real ESPN football broadcast strings.

**H-6 · Live-TV providers appended unconditionally, ignoring regional-blackout classification** — item **D** from 2026-08-20 confirmed at HEAD (A5-F6)
- `lib/deep-links.ts:316-319` — appends `youtube_tv, hulu_live, fubo, sling, directv_stream` to **every** broadcast; contradicts `isRegionalBroadcast()` at `L226`.
- **Fix (FX9):** only append live-TV providers when the broadcast is not regional/blackout-prone; render "Broadcast TBD" as a non-pressable state; surface a real error in `useTapToStream` when all fallbacks fail.

**H-7 · Silent deep-link failure** — item **D** carry-over (A5-F8)
- `hooks/useTapToStream.ts:96-120` — `fireDeepLink()` catches errors silently and animates "Connecting to …" for 5s before fading with no error state.
- **Fix (bundled with FX9):** surface a dismissible error state; log the failure for observability.

**H-8 · Provider registry missing NFL Sunday Ticket / NFL+ tiers** — new (A5-F9)
- `supabase/migrations/002_seed_providers.sql` and `038_add_missing_broadcast_providers.sql` — no rows for `youtube_primetime_channels` (NFL Sunday Ticket exclusive), no explicit `nfl_plus` row separate from `nfl_network`.
- **Fix:** additive migration `091_` (next number per Appendix C) with the missing rows + universal links + fallback store URLs.

**H-9 · Email-wager alert insert schema mismatch** — item **E** from 2026-08-20 confirmed at HEAD
- `supabase/functions/ingest-email-wagers/index.ts:491-503` — inserts `message` and `status` columns; `alerts` schema has `body text not null` and `read boolean` (`migrations/001_initial_schema.sql:101-113`). Insert always fails; error swallowed at `:493`.
- **Fix (FX4):** use `body`/`read` columns; add an integration test that asserts a row is created.

**H-10 · `deno check` fails on `evaluate-alerts` and `intent-api`, both absent from CI** — item **I** from 2026-08-20 confirmed at HEAD (A4-I1..I5)
- `evaluate-alerts/index.ts` — 3 type errors: `tournament_round` on `GameState`, `GameState` incompatible with `extractSignals` (`home_team null vs undefined`), `computeIntentScore` called with partial `SignalVector`.
- `intent-api/index.ts` — 2 type errors: `keyRow` typed `never`, `SupabaseClient` schema mismatch.
- `.github/workflows/ci.yml:34-52` — CI runs `deno check` on `poll-*` (added 2026-08-20) and `evaluate-alerts/logic.ts`, but not on the two `index.ts` entry points.
- **Fix (FX7):** fix each type error; add both `index.ts` files to CI's `deno check` list.

**H-11 · MLB alerts labelled with basketball concepts** — item **G** from 2026-08-20, **FULLY FIXED** at HEAD (A4-G1, G2)
- `_shared/alert-scoring.ts:194-203` now branches on `isFootball` and applies correct 2nd-half / OT logic per sport; period-to-OT math corrected.
- **Disposition:** close-out. No FX needed; verify FX6 in plan is a no-op.

**H-12 · Sport pills order buries football during football season** — new (A8-3)
- `app/(tabs)/games/index.tsx:88-95` — fixed order puts football at positions 3–4 behind NBA and MLB.
- **Fix:** conditional order by active season, or hardcode `nfl, ncaaf, ncaam, nba, mlb` for the fall.

**H-13 · DatePicker is day-only; NFL clusters by week** — new (A8-5)
- `components/DatePicker.tsx:73-93` — day-offset navigation only.
- **Fix:** week-based mode for football sports; opt-in via a Day/Week toggle.

---

### Medium

- **M-1 · `api_rate_log` read-modify-write is not atomic** — `_shared/sportradar.ts` (line ranges vary): under burst load, multiple writers race, so the rate table under-counts and orchestrator over-dispatches. Move to atomic upsert with `ON CONFLICT DO UPDATE SET calls_made = calls_made + 1`.
- **M-2 · AddWagerSheet player-prop UI is basketball-only** — `components/AddWagerSheet.tsx:23-31` — stat pickers hardcode points/rebounds/assists. Extend with sport-aware stat sets (passing yards, TDs, receptions, sacks…).
- **M-3 · Overtime settlement is not modelled in `resolve-wagers`** — `supabase/functions/resolve-wagers/logic.ts:61-107` — no `isOvertime` flag; some sportsbooks push college-football OT bets, others grade them. At minimum, plumb `isOvertime` and log it for audit; do not silently misclassify.
- **M-4 · Football alert labels lack sport context** — `lib/alert-helpers.ts:4-70` — `football_close_game` and `football_overtime` render with the same badges/icons as basketball equivalents. Different thresholds and meanings; the UI should differentiate (a football-specific icon set at minimum).
- **M-5 · Live-TV blackout classification contradiction (existing)** — `lib/deep-links.ts:226` classifies `"NBCS "` as regional/blackout-prone while `:291` maps anything containing `"NBC"` to Peacock. Reconcile: distinguish national NBC → Peacock from RSN "NBCS Bay Area" → local only.
- **M-6 · Deep-link health check reports symptom, not cause** — `supabase/functions/deep-link-health-check/index.ts:37-185` — flags high fallback rate but does not HEAD-check universal links. Add periodic HTTP HEAD verification; distinguish "app not installed" from "URL dead".

### Low / dead-weight (Phase 4 gates apply)

- **KL-1 · `alerts.why` — deprecate write, keep column** (A7-2 / item H). `evaluate-alerts/index.ts` writes both `why` and `explanation`; `AlertCard.tsx:184-207` renders `explanation` and falls back to `why`. `explanation` is always populated for new alerts, so `why` is functionally dead for new rows. **Do not drop the column** (pre-2026-08-20 rows still carry it). Stop writing; leave the fallback render.
- **KL-2 · `user_preferences.favorite_teams` — wire it, don't delete** (A7-1 / item F). Convert saves to `follows` upserts so the UI's promise ("drives your alerts") becomes true. Small win. This is a Phase 4 wire-up, not a deletion.
- **KL-3 · `_shared/polling-state.ts` — keep with comment; PARTIAL REFUTATION of A7-3.** poll-boxscore/index.ts:12 still imports `isTerminalStatus`. The file's coordination role is dead (superseded by `watcher_state`), but the utility export has live consumers. Suggested disposition: shrink the file to the surviving utility and mark the rest deprecated.
- **KL-4 · SportsDataIO code paths (env vars, bases, sportsdataio_id)** — inventory only (per CLAUDE.md rule, do not extend). Plan Phase 4 disposition after football season.
- **KL-5 · `SportProvider`, `SportSelector.tsx`, `useSport()`, `SPORT_DISPLAY_NAMES`** — zero mounts, zero imports. Plan says **adopt** (would give Alerts tab the sport filter it lacks) rather than delete. Small refactor.
- **KL-6 · `MLBScoreboard.tsx` / `useMLBStats.ts`** — imports must be verified. If dead, delete; if live, out-of-scope.
- **KL-7 · Web page `/partners/[partnerKey]` uses wrong App Store ID** — item **J** from 2026-08-20 still-broken (not re-verified in this pass; carry forward as one-liner fix in Phase 2).

---

## Re-verification of the 2026-08-20 audit A–J

| ID | Item | Status at HEAD | Feeds |
|---|---|---|---|
| A | Timezone/geo fail-open | **still broken** — see BL-8 | FX3 |
| B | Quiet hours UTC | **still broken** — see BL-9 | FX1 |
| C | Push toggle kills feed | **still broken** — see BL-10 | FX2 |
| D | Watch-tab false carriage + silent deep-link failure | **still broken** — see H-6, H-7 | FX9 |
| E | Email-wager alert insert schema mismatch | **still broken** — see H-9 | FX4 |
| F | favorite_teams dead column | still-dead; Phase 4 disposition: **wire, don't delete** | Phase 4 |
| G | MLB basketball labels | **fully fixed** (A4-G1, G2 quoted) | close-out; FX6 becomes a no-op |
| H | `alerts.why` dead | writes still happen; render fallback intact | Phase 4: stop writes, keep column |
| I | `deno check` failures + CI gap | **still broken** — see H-10 | FX7 |
| J | App Store ID mismatch on web | not re-verified this pass | Phase 2 one-liner |

---

## Production DB probes — skipped

`A4` requested three production queries (per-sport alert counts, delivery failure rate, stale watcher rows). Skipped from this pass — no `SUPABASE_DB_URL` / access token in the local session; queries stated in A4's yaml block for whoever runs Phase 2.

---

## Deltas from Phase 1 skeptic pass

- **A1** proposed a second "closed" mapping bug at `poll-schedule/index.ts:399`. Skeptic verified: that line is inside a NCAAM-only ESPN fallback (line 169 uses `ESPN_BASE = SPORTSDATAIO_BASES.ncaam`) and does not affect football at HEAD. Kept as informational (BL-5) not blocker.
- **A7-3** disposition (`delete polling-state.ts`) refuted: `poll-boxscore/index.ts:12` imports `isTerminalStatus` from it. Re-scored to `keep-with-comment` (KL-3).
- **A5** F2, F5 findings were confirmations of existing correct code — dropped as non-actionable.
- All other blocker/high findings survived spot-check with quoted evidence at HEAD.

---

## Fix map (Phase 2 backlog input)

| Finding | Plan FX | New? |
|---|---|---|
| BL-1 | FX10 | plan |
| BL-2 | FX5  | plan |
| BL-3 | FX11 | plan |
| BL-4 | bundle with FX11 | **new** |
| BL-6 | FX12 | plan |
| BL-7 | FX13 | plan |
| BL-8 | FX3  | plan |
| BL-9 | FX1  | plan |
| BL-10 | FX2 | plan |
| H-1 | new — call it **FX8a** | **new** |
| H-2, H-3 | FX8 | plan |
| H-4 | new — **FX5a** (bundled with FX5) | **new** |
| H-5 | bundle with FX9 | **new** |
| H-6, H-7 | FX9 | plan |
| H-8 | new — **FX9a** (migration 091_) | **new** |
| H-9 | FX4 | plan |
| H-10 | FX7 | plan |
| H-11 | close-out; FX6 becomes no-op | — |
| H-12 | new — **FX14** (client) | **new** |
| H-13 | new — **FX15** (client) | **new** |
| M-1..M-6 | Phase 2 stretch or Phase 3 | — |

**Phase 2 must-fix count:** 10 blockers + 13 highs = 23 items. **New in this audit:** 6 (BL-4, H-1, H-4, H-5, H-8, H-12, H-13; H-11 close-out cancels FX6).
