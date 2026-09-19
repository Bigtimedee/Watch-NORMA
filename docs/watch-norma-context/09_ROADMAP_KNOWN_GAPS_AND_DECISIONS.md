# 09 — Roadmap, Known Gaps, and Decisions

## Known Bugs

Based on repository inspection and the outage report:

0. ~~**Password reset email CTA was not a link.**~~ **Closed (2026-09-19).** Admin forgot-password (`getnorma.app/auth/forgot-password`) sent subject "Reset Your Password" with body heading "Reset Password" and non-clickable text "Reset Password" — no href, no URL (Gmail mobile). Cause: hosted Supabase Auth recovery template (project `shijrazlzawjpobrpmnt`) had no `<a href="{{ .ConfirmationURL }}">`. In-repo templates + Management API apply + Jest lint: `docs/operations/auth-email-templates.md`. Re-test: trigger reset from `/admin` login, confirm a blue link and a raw verify URL.

1. **ESPN status field regression risk.** The May 2026 P0 outage was caused by reading `status.type.name` (machine code) instead of `status.type.description` (human-readable) from ESPN. This was fixed, but the risk of regression remains high. A CHECK constraint on the `games` table (migration 057/060) now prevents invalid status values, but the constraint is a safety net — the root fix is in the status mapping code. See `OUTAGE-REPORT-2026-05-16.md`.

2. **YouTube TV deep link instability.** Multiple migrations (052, 053, 054) were needed to fix YouTube TV's scheme and universal link. The universal link must point to `https://tv.youtube.com` (watch/login URL), not a marketing page. This is monitored by `deep-link-health-check` but has been a recurring issue.

3. **Team matching edge cases.** The fuzzy team matching system (`team-matching.ts`) handles 50+ aliases and includes multi-word validation, but edge cases remain — especially for teams with similar names across conferences (e.g., "Purdue" vs "Purdue Fort Wayne"). False positive matching can cause incorrect odds mapping.

4. ~~**Consumer social auto-posts attached Tier C sportsbook settings screenshots.**~~ **Closed (September 2026).** `selectScreenshotUrl` `app_promo` mapped `connections` → `sportsbooks-manual.png`, and `themeToTag("sportsbooks"|"wager_tracking")` queried that tag. Shared denylist in `_shared/social-media-select.ts` now bans settings/connections/Tier-C chrome. Seed-catalog `game-detail-watch.png` was still leaking as Why Now media; generate now refuses that stock fallback (2026-09-16). Design should upload dedicated alert-card / Why Now Expo captures so football posts do not reuse the watch-button screen as a stand-in.

5. ~~**Demo screenshot seed visible in production Games/Alerts.**~~ **Closed (2026-09-05).** Ad-hoc `demo-%` games and `DEMO SCREENSHOT` alerts were inserted into production (`shijrazlzawjpobrpmnt`) and shown as live. Data was purged operationally (no cleanup migration). Client queries now exclude those rows; React Query keys are `games-v2` / `alerts-v2` (`DEMO_FILTER_VERSION`) so OTA + the 30s Games poll drop stale cached lists without a force-quit. `assertDemoSeedAllowed()` refuses the production project ref.

6. ~~**`cmo-publish` tweeted non-X `content_calendar` drafts.**~~ **Closed (2026-09-08).** `fetchDuePosts` selected every `draft`/`scheduled` row with `scheduled_for <= now()` and posted them to the X API regardless of `platform`. LinkedIn draft `8c66955e` was briefly posted to X (duplicate later deleted). Fix: due query is `platform = 'twitter'` only; non-X rows are skipped in-loop with no status mutation; `markPublished` / `markFailed` also require a twitter draft/scheduled row. Consumer social cron `publish-social-posts` reads `social_posts` (not `content_calendar`) and already switches on `post.platform`.

7. ~~**`cmo-publish` raced a paused junk draft into a tweet.**~~ **Closed (2026-09-15).** Manual A2 run succeeded for `4af48adf-…` then failed for `310441ec-b198-4f32-a35d-d721c92d4cdd`: `Failed to mark post … as published: no matching twitter draft/scheduled row`. The junk row was still `draft`+due when `fetchDuePosts` ran; Design set `status='paused'` before `markPublished`. The loop had already called `postTweet`; catch then `markFailed`, which same-filters and no-ops on paused. Fix: revalidate the live row immediately before `postTweet` and skip (no tweet, no `markFailed`) unless status is still `draft`/`scheduled` and platform is twitter; `classifyPublishCandidate` treats `paused` as skip; a post-tweet `markPublished` miss logs `possible_orphan_tweet` and does not `markFailed`. Dave's draft auto-publish model is unchanged.

8. ~~**`cmo-generate` invented Wednesday draft+stock game-detail tweets.**~~ **Closed (2026-09-16).** Overnight ~4am CT Tue→Wed, generate created `content_calendar` `draft`+due rows attached to catalog `game-detail-watch.png` (Northern Iowa / St. John's Expo capture tagged `alerts`/`why_now`/`red_zone` after PR #29). `cmo-publish` shipped them ([2100147692882034709](https://x.com/watchNORMA/status/2100147692882034709), [2100147702713446507](https://x.com/watchNORMA/status/2100147702713446507)). PR #40 only skips **paused** rows at publish time. Generate now assesses slate (live / near-term NFL-NCAAF / recent alerts) and **refuses** stock catalog media: thin-slate runs skip Claude and do not insert; strong-slate runs insert `draft` only when a non-stock Design/Expo capture matches. TNF Why Now rows created by Design (e.g. `356c5ba6`) are untouched.

### CI pitfall: duplicate interface properties

~~**Client CI `TS2300` duplicate `ctaText` on `SponsorCTAButtonProps`.**~~ **Closed (2026-09-14).** Betr Phase D (`3217593`) pasted a second `ctaText?: string;` instead of editing the existing JSDoc in place. Client CI (`npx tsc --noEmit`) failed: [run 34893196566](https://github.com/Bigtimedee/Watch-NORMA/actions/runs/34893196566). Fix `c8c88d2` (PR #38) is on main — do not re-touch `SponsorCTAButton.tsx`. **Rule:** update React/TS prop fields in place; never duplicate the property name. **Check:** `npx tsc --noEmit` must be clean before push. Durable agent note: `CLAUDE.md` (same heading). Incident write-up: [`docs/betr-integration-plan.md`](../betr-integration-plan.md) Phase D lessons.

## Known Gaps

### Data and Integrations

- **Blackout uncertainty surfaced, not resolved.** As of P1-11, NORMA classifies broadcasts as national or regional (RSN) using `isRegionalBroadcast()` in `lib/deep-links.ts`. When the broadcast is a known RSN (Bally, NESN, MSG, YES, SNY, MASN, Root Sports, etc.), the Watch button shows a "May be subject to local blackout" caveat. When no broadcast data exists for a live game, the button shows "Broadcast TBD" instead of "Watch". The deep-link chain is unchanged — the caveat is informational only, not a routing change. True per-market blackout detection remains impossible without a blackout data API (no such API is publicly available).
- ~~**Limited MLB odds support.**~~ **Closed (July 2026).** `poll-odds/index.ts` polls all three sports: `basketball_ncaab` (ncaam), `basketball_nba` (nba), `baseball_mlb` (mlb). Odds are written to `game_odds` per sport-scoped team/game slices to prevent cross-sport name collisions. Migration `20260415000001_fix_nba_mlb_team_markets` corrected multi-word mascot markets (Red Sox, White Sox, Blue Jays, Trail Blazers). A Sacramento Athletics alias was added to `team-matching.ts` for the A's relocation. MLB wager alerts now use inning-aware evaluators (`evaluateMLBSpread`, `evaluateMLBTotal`, `evaluateMLBMoneyline`) that read the `"T7"`/`"B9"` clock format; basketball evaluators are bypassed for MLB games. Quota logging (`x-requests-remaining` header) was added to `poll-odds` to monitor API usage.
- ~~**NFL/NCAAF ingestion scaffold in place; alert rules pending.**~~ **Closed (July 2026).** Alert rules are fully implemented: `evaluateFootballSpread`, `evaluateFootballTotal`, `evaluateFootballMoneyline`, `evaluateFootballCloseGame` in `evaluate-alerts/logic.ts`; sport-aware `checkMustNotify` and `extractSignals` in `_shared/alert-scoring.ts`; football-specific signal thresholds (close game ≤ 8, OT at period ≥ 5, final minutes Q4-only); must-notify rules for `football_overtime`, `football_two_minute`, and `football_close_game` (lead-change). Floor prices seeded for all three football moment types × NFL/NCAAF (migration 20260706000004). ~~Football is gated behind `ALERTABLE_SPORTS` (currently `{"ncaam","nba","mlb"}`) — activation target is Sept 1, 2026 (NFL kickoff).~~ **Football activated 2026-08-19** ahead of the 2026 season: `ALERTABLE_SPORTS` now `{"ncaam","nba","mlb","ncaaf","nfl"}`; client sport pills expose NCAAF + NFL; orchestrator polling intervals extended to cover football. NHL and soccer remain unintegrated.
- **Stale broadcast data.** Broadcast assignments can change close to game time. The system relies on the most recent poll data and has no mechanism to detect last-minute changes.
- **DFS / fantasy has no live API.** PrizePicks, Underdog, Sleeper, Yahoo Fantasy, ESPN Fantasy, DraftKings DFS, and **Betr (Betr Picks)** are Tier B/C only (paste import, slip scan; email parse where a fixture exists). Betr `provider_key = betr` is live for Connections, roster paste (`fantasy_source = betr`), slip OCR enum, brands, geo, and OneLink (`20260914210000_betr_dfs_pickem.sql`). Betr **email ingest is blocked on fixture** — `betr.app` is not mapped; do not add a bare `betr` token (BetRivers collision). No public consumer roster API exists for any of these — do not invent one. `buildPickEmLink` is wired through `contextualizeSponsorCtaUrl` in both auction-engine return paths so a PrizePicks/Underdog creative CTA is rewritten to a sport-scoped board with campaign attribution; Betr rewrites to the verified OneLink (no fake sport board). CTA copy is **Open Betr**, never **Bet Now on Betr** (`flagPickEmBetNowCopy` flags that at campaign review). `sportsbook_restrictions` has pick'em rows (migration `20260904183000` for PrizePicks/Underdog; `20260914210000` for Betr, help-center Picks=Yes including TN). `useSportsbookGeo` remains fail-closed. Player-follow alerts require a Sportradar summary or ESPN boxscore player list for the game; if neither snapshot has names, imported rosters do not become candidates. Season-long apps (Sleeper / Yahoo / ESPN Fantasy) are roster-import + deep-link metadata only. Native Betr URL scheme remains TBD.

### Alert Engine

- **Player prop alerting limited.** The `outcome-proximity` module computes proximity for player props, but the alert pipeline's prop coverage depends on having Sportradar summary data with individual player stats. Coverage may be incomplete for less-tracked players or stat categories.
- **No user feedback loop.** The alert engine scores and delivers alerts, but there is no mechanism for users to rate alert quality ("this was useful" / "this wasn't"). Future improvements to the scoring weights would benefit from explicit feedback.
- **Morning briefing delivered but no personal digest.** The `morning-briefing` Edge Function sends a "Tonight's Games" push at 6 PM CT. A personalized per-user digest (curated by wagers and follows) is not yet implemented.

### Streaming and Watch Flow

- **No automated streaming availability check.** The app relies on broadcast strings from ESPN/SportsDataIO and the user's self-reported connections. There is no API that definitively confirms "this user can watch this game on YouTube TV right now."
- **No watch-party or social features.** The app is single-user focused. There are no shared watch lists, group alerts, or social viewing features.

### Advertising

- **No real-time auction monitoring dashboard.** The admin portal has campaign metrics and fraud detection, but no live view of auctions happening in real-time.
- **Advertiser self-service is basic.** Creative approval is manual. Targeting options are limited to moment types and basic campaign parameters.
- ~~**MCP server only ran via stdio — no remote HTTP/SSE endpoint.**~~ **Closed (June 2026).** `src/http-server.ts` implements Express + `SSEServerTransport`. `Dockerfile` and `railway.toml` are in `packages/norma-ads-mcp/`. 6/6 Jest integration tests pass including full SSE + tools/list round-trip. `adagents.json` declares `mcp.getnorma.app` as the endpoint.
- ~~**`mcp.getnorma.app` DNS not yet configured.**~~ **Closed (June 2026).** OAuth client created ("NORMA MCP Server") at `getnorma.app/settings`. MCP server deployed to Railway service "valiant-illumination" (`xat108q2.up.railway.app`) with root directory `packages/norma-ads-mcp` and env vars `NORMA_API_KEY`, `NORMA_OAUTH_CLIENT_ID`, `NORMA_OAUTH_CLIENT_SECRET`. CNAME `mcp.getnorma.app → xat108q2.up.railway.app` and TXT verification record added at name.com and confirmed propagated. `GET https://mcp.getnorma.app/health` returns `{"status":"ok","service":"norma-ads-mcp","version":"1.0.0","transport":"http-sse"}`. `api-client.ts` handles OAuth token exchange automatically.

### Privacy and Compliance

- **No explicit age verification.** Age gating is delegated to the App Store rating and the sportsbook/platform. The app itself does not verify age.
- **Geofencing for gambling content.** The geo-compliance foundation is in place: `profiles.timezone` is captured, the `sportsbook_restrictions` table encodes legal states for all major sportsbooks, the auction engine blocks sportsbook ads for users with unknown or restricted-jurisdiction timezones, and `BetNowButton` uses `useSportsbookGeo` to disable the CTA for users in restricted/unknown jurisdictions. Both enforcement points (auction and CTA) use the same `inferStateFromTimezone` logic. True per-market geofencing (GPS-based) remains a known gap — see Product Decision #8.
- **Kalshi credentials storage.** RSA private keys are stored in `connections.metadata` behind RLS but without column-level encryption (pgcrypto). The CLAUDE.md architecture plan calls for encryption when partner APIs are added.

### Testing

- **No integration tests.** Tests are unit-level (Jest for client, Deno test for Edge Functions). There are no end-to-end tests that verify the full pipeline (game state change → alert → push → deep link).
- **No load tests.** The system has not been tested under high-concurrency scenarios (e.g., 50+ simultaneous live games during March Madness).
- **No visual regression tests.** No screenshot or snapshot tests for UI components.

### Social

- **No dedicated red-zone / Why Now alert screenshot in `media_assets`.** Seed-catalog `game-detail-watch.png` is no longer acceptable auto-publish media. `cmo-generate` skips the row when only stock assets exist. Design should upload a real alert-card / Why Now Expo capture (distinct filename, tagged `alerts` / `why_now` / `red_zone`) so football posts — including TNF — can auto-ship with fresh media. Existing Design-created calendar rows are not rewritten.
- ~~**LinkedIn `content_calendar` drafts had no publisher.**~~ **Closed (2026-09-08).** `cmo-publish-linkedin` posts `platform = 'linkedin'` draft/scheduled rows to the NORMA company page (organization Posts API). `cmo-publish` remains twitter-only (PR #32). Org id defaults to public NORMA page `146336141` (`https://www.linkedin.com/company/watch-norma/`) when `LINKEDIN_ORGANIZATION_ID` is unset. Production still needs `LINKEDIN_ACCESS_TOKEN` (Community Management API, `w_organization_social`) before auto-ships go live; set it with **Actions → Set LinkedIn Supabase secrets** (`.github/workflows/set-linkedin-secrets.yml`, dispatch-only; the workflow also pins `LINKEDIN_ORGANIZATION_ID=146336141` even though the in-code default already covers that). Marketing can keep posting A1 via the browser until the access token is set. This path does not use `publish-social-posts`; it may read `social_accounts.account_id` for org id only (never the row's access token).

### Operations

- **No automated alerting on system degradation.** The `health-check` endpoint exists but there is no automated monitor that calls it and pages on failure.
- **No data retention policy.** Old game_snapshots, delivery_log entries, and impression records accumulate indefinitely. A cleanup job should be implemented.
- **No staging environment documented.** The repo shows production-oriented config. A staging/preview environment strategy is not documented.
- ~~**Production database missing migrations 079–084.**~~ **Closed (June 2026).** `api_keys` (079) and `oauth_clients` (081) tables applied via `supabase/apply-pending-migrations.sql`. `SUPABASE_SERVICE_ROLE_KEY` was also missing from Vercel env vars (root cause of 500 on Settings → API Access); added alongside `OAUTH_JWT_PRIVATE_KEY` and `OAUTH_JWT_PUBLIC_KEY` (RSA-2048 key pair generated June 2026). The "Create Client" button is now fully operational.
- **`support@norma-app.com` placeholder email (fixed June 2026).** The settings page previously showed a fake email on the `norma-app.com` domain, which does not exist. Fixed to `support@getnorma.app`. Root cause: an AI agent invented the placeholder without verifying the domain.

## Product Decisions Needed

These decisions require owner confirmation:

1. **Which additional sports/leagues are next?** NFL, NHL, college football, soccer? Each requires sport-specific alert rules, data source configuration, and UI adjustments.
2. ~~**Should sportsbook CTA deep links be geo-restricted?**~~ **Done.** `BetNowButton` now uses `useSportsbookGeo` to disable the CTA for users in restricted/unknown jurisdictions. Both the auction and the CTA use the same `inferStateFromTimezone` logic.
3. **Should Kalshi/Polymarket support be expanded or maintained as-is?** The current integration is read-only (positions + settlement). Is trade execution planned?
4. **Which streaming providers need priority deep-link fixes?** YouTube TV has been unstable. Are there other providers with known issues?
5. **Should there be a premium/ad-free tier?** The monetization model currently depends entirely on the ad auction. A subscription tier would diversify revenue but reduce auction inventory.
6. **How should the app handle the off-season?** NCAA basketball has a defined season. What happens in summer — MLB-only? Feature dormancy?
7. **Is the advertiser portal ready for external advertisers?** Campaign approval workflow is now live (migration 065): new campaigns land as `pending`, admin must approve before they enter the auction. The self-service flow is usable for external advertisers — remaining gap is manual creative review.
8. **Should location be required for broadcast availability?** Using GPS would improve broadcast mapping accuracy but raises privacy concerns.
9. **What is the multi-platform social strategy?** X/Twitter `content_calendar` publishing is live (`cmo-publish`, twitter-only). LinkedIn company-page publishing is implemented (`cmo-publish-linkedin`) and waits on `LINKEDIN_ACCESS_TOKEN` (org id defaults to NORMA `146336141`). Instagram, Facebook, TikTok, Reddit are partially scaffolded on `social_posts`. Which remaining platforms are priority?
10. **Should email wager ingestion be promoted more aggressively?** The Gmail-based flow works but requires user action (forwarding emails). Is this sufficient or should other email providers be added?

## Immediate Priorities

Based on repository inspection, the highest-impact immediate work:

1. ~~**Expand sports coverage (data layer).**~~ **Done (P1-12).** NFL and NCAAF ingestion scaffold is in place: schedule polling and boxscore polling read from ESPN (the canonical real-time source) via the multi-sport loop in `poll-schedule`. Sportradar bases exist for optional supplementary PBP/summary; no Sportradar contract is required to ingest football. ~~Alert evaluation for football is explicitly a no-op; sport-specific football alert rules are the next step.~~ **Done (July 2026).** Football alert rules fully implemented. ~~Gated behind `ALERTABLE_SPORTS` until Sept 1, 2026 NFL kickoff.~~ **Activated 2026-08-19** ahead of the 2026 season; `deploy-functions` CI job added in the same push so the flip actually reached production.
2. **Stabilize deep-link health.** Continue monitoring via `deep-link-health-check`. Consider a periodic cron that automatically checks each provider's universal link for HTTP 200 + correct redirect.
3. ~~**Enforce geo-compliance at the CTA level.**~~ **Done** — `BetNowButton` geo-gating is live.
4. **Implement automated health monitoring.** Connect the `health-check` endpoint to an external uptime monitor (e.g., Better Uptime, PagerDuty) that alerts on degradation.
5. **Write integration tests for the alert pipeline.** The most critical path (game state → alert → push) has unit tests but no end-to-end coverage.
6. ~~**Campaign approval workflow.**~~ **Done** — admin must approve campaigns before they enter the auction (migration 065).
7. ~~**Referral system.**~~ **Done** — `referral_codes` + `referrals` tables, `get-referral-code` edge function, profile invite UI, signup deep-link handling (migration 066).

## Near-Term Roadmap

### Sports Data Reliability
- Add health-check alerting for stale watchers and failed polls
- Implement automatic provider failover (if ESPN is down, auto-promote SportsDataIO)
- ~~Add NFL/college football data sources~~ — **Done (P1-12)**: data layer wired
- ~~Sport-specific football alert rules~~ — **Done (July 2026)**: evaluators + scoring + must-notify + floor prices. ~~Gated until Sept 1, 2026 NFL kickoff.~~ **Activated 2026-08-19** — `ALERTABLE_SPORTS` extended to include `ncaaf` + `nfl`, and CI now deploys Edge Functions so the flip reaches production.

### Alert Engine
- ~~Add user feedback mechanism (thumbs up/down on alerts)~~ — **Done (P1-09)**: thumbs up/down on `AlertCard` persists to `alerts.feedback_polarity`
- Use feedback data to refine scoring weights
- "Tonight's Games" briefing is live (6 PM CT daily via `morning-briefing` function)
- Add personalized "tonight's watchlist" push that filters by user follows and open wagers

### Streaming Provider Routing
- Automated universal link health verification (cron that fetches each URL and checks redirect)
- Add blackout detection (regional sports network awareness)
- Improve provider matching for multi-network broadcasts

### Push Notifications
- Rich notifications with game images/scores on iOS
- Notification grouping for multiple alerts from the same game
- Interactive notifications (tap to watch, swipe to dismiss, long-press for details)

### Connected Accounts
- Expand email wager ingestion to additional email providers (Outlook, Yahoo)
- Add sportsbook partner API when partnerships are secured
- Improve Polymarket position matching (beyond team name extraction)

### Ad Auction
- ~~Geo-compliance: auction + BetNowButton CTA~~ — **Done**: both enforcement points use `inferStateFromTimezone`
- Real-time auction dashboard for admins
- Expand moment types for auction eligibility
- Add video ad creative support

### Testing and Monitoring
- End-to-end integration tests
- Load testing for March Madness scale
- Automated health monitoring with paging
- Data retention cleanup jobs

## Long-Term Vision

Watch-NORMA is positioned to become:

**A personalized sports viewing agent.** The app already monitors live games and user interests to surface relevant moments. The long-term vision is an AI agent that understands the user's complete sports identity — their teams, players, bets, viewing habits, and schedule — and proactively manages their sports viewing experience.

**An attention-routing platform.** The core technical capability (scoring moments for user-specific relevance, then routing to the right service) extends beyond sports. Any live event with fragmented viewing options and user-specific stakes could benefit from this architecture.

**A live sports commerce layer.** The Vickrey auction positions NORMA as a marketplace for sports attention moments. Advertisers bid on the exact moment a user is maximally engaged. This is fundamentally higher-value inventory than generic sports app impressions.

**A bridge between streaming, betting, prediction markets, and fan engagement.** No other product combines all four. The user's sportsbook positions, prediction-market exposure, streaming subscriptions, and team/player preferences are unified into a single relevance engine. This compound awareness is Watch-NORMA's deepest moat.
