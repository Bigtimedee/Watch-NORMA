# 09 — Roadmap, Known Gaps, and Decisions

## Known Bugs

Based on repository inspection and the outage report:

1. **ESPN status field regression risk.** The May 2026 P0 outage was caused by reading `status.type.name` (machine code) instead of `status.type.description` (human-readable) from ESPN. This was fixed, but the risk of regression remains high. A CHECK constraint on the `games` table (migration 057/060) now prevents invalid status values, but the constraint is a safety net — the root fix is in the status mapping code. See `OUTAGE-REPORT-2026-05-16.md`.

2. **YouTube TV deep link instability.** Multiple migrations (052, 053, 054) were needed to fix YouTube TV's scheme and universal link. The universal link must point to `https://tv.youtube.com` (watch/login URL), not a marketing page. This is monitored by `deep-link-health-check` but has been a recurring issue.

3. **Team matching edge cases.** The fuzzy team matching system (`team-matching.ts`) handles 50+ aliases and includes multi-word validation, but edge cases remain — especially for teams with similar names across conferences (e.g., "Purdue" vs "Purdue Fort Wayne"). False positive matching can cause incorrect odds mapping.

## Known Gaps

### Data and Integrations

- **Blackout uncertainty surfaced, not resolved.** As of P1-11, NORMA classifies broadcasts as national or regional (RSN) using `isRegionalBroadcast()` in `lib/deep-links.ts`. When the broadcast is a known RSN (Bally, NESN, MSG, YES, SNY, MASN, Root Sports, etc.), the Watch button shows a "May be subject to local blackout" caveat. When no broadcast data exists for a live game, the button shows "Broadcast TBD" instead of "Watch". The deep-link chain is unchanged — the caveat is informational only, not a routing change. True per-market blackout detection remains impossible without a blackout data API (no such API is publicly available).
- **Limited MLB odds support.** The Odds API polling is configured for `basketball_ncaab`. NBA and MLB odds may not be ingested (needs verification of whether additional sport endpoints are called).
- **NFL/NCAAF ingestion scaffold in place; alert rules pending.** As of P1-12, the data layer supports NFL and NCAAF: `sport_key` ENUM extended (migration 072), ESPN and SportsDataIO base URLs registered in `poll-schedule` and `poll-boxscore`, Sportradar bases added in `_shared/sportradar.ts`, and `ENABLED_SPORTS` gated on `SPORTRADAR_NFL_API_KEY` / `SPORTRADAR_NCAAF_API_KEY`. `evaluate-alerts` returns a no-op 200 for football games until sport-specific alert rules are implemented. NHL and soccer remain unintegrated.
- **Stale broadcast data.** Broadcast assignments can change close to game time. The system relies on the most recent poll data and has no mechanism to detect last-minute changes.

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
- **`mcp.getnorma.app` DNS not yet configured.** The HTTP/SSE server is production-ready and containerized. Three steps remain before the MCP endpoint is live: (1) create an OAuth client at `getnorma.app/settings` (log in as an advertiser) → API Access → Create client; save the `client_id` and `client_secret`, (2) deploy `packages/norma-ads-mcp/` to Railway using the committed `railway.toml`, setting `NORMA_API_KEY` (any secure string — the incoming gate for AI agents), `NORMA_OAUTH_CLIENT_ID`, and `NORMA_OAUTH_CLIENT_SECRET` (from step 1), (3) add CNAME `mcp.getnorma.app → <railway-service>.up.railway.app` in the DNS provider. The MCP server's `api-client.ts` now handles OAuth token exchange and refresh automatically — no static API key needed for outbound REST calls.

### Privacy and Compliance

- **No explicit age verification.** Age gating is delegated to the App Store rating and the sportsbook/platform. The app itself does not verify age.
- **Geofencing for gambling content is partial.** The geo-compliance foundation is in place: `profiles.timezone` is captured, the `sportsbook_restrictions` table encodes legal states for all major sportsbooks, and the auction engine blocks sportsbook ads for users with unknown or restricted-jurisdiction timezones. However, sportsbook CTAs in alert cards are still shown to all users regardless of jurisdiction — the auction geo-filter is the only enforcement point so far.
- **Kalshi credentials storage.** RSA private keys are stored in `connections.metadata` behind RLS but without column-level encryption (pgcrypto). The CLAUDE.md architecture plan calls for encryption when partner APIs are added.

### Testing

- **No integration tests.** Tests are unit-level (Jest for client, Deno test for Edge Functions). There are no end-to-end tests that verify the full pipeline (game state change → alert → push → deep link).
- **No load tests.** The system has not been tested under high-concurrency scenarios (e.g., 50+ simultaneous live games during March Madness).
- **No visual regression tests.** No screenshot or snapshot tests for UI components.

### Operations

- **No automated alerting on system degradation.** The `health-check` endpoint exists but there is no automated monitor that calls it and pages on failure.
- **No data retention policy.** Old game_snapshots, delivery_log entries, and impression records accumulate indefinitely. A cleanup job should be implemented.
- **No staging environment documented.** The repo shows production-oriented config. A staging/preview environment strategy is not documented.

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
9. **What is the multi-platform social strategy?** X/Twitter publishing is live. Instagram, Facebook, TikTok, Reddit are partially scaffolded. Which platforms are priority?
10. **Should email wager ingestion be promoted more aggressively?** The Gmail-based flow works but requires user action (forwarding emails). Is this sufficient or should other email providers be added?

## Immediate Priorities

Based on repository inspection, the highest-impact immediate work:

1. ~~**Expand sports coverage (data layer).**~~ **Done (P1-12).** NFL and NCAAF ingestion scaffold is in place: schedule polling, boxscore polling, and Sportradar bases are all wired. Alert evaluation for football is explicitly a no-op; sport-specific football alert rules are the next step.
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
- ~~Add NFL/college football data sources~~ — **Done (P1-12)**: data layer wired; sport-specific alert rules still pending

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
- Geo-compliance foundation in place: `sportsbook_restrictions` table seeded for 5 major books, auction engine blocks unknown/illegal-state users, `profiles.timezone` drives filtering
- Enforce geo-check on `BetNowButton` CTA (in-app, not just auction)
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
