# 09 — Roadmap, Known Gaps, and Decisions

## Known Bugs

Based on repository inspection and the outage report:

1. **ESPN status field regression risk.** The May 2026 P0 outage was caused by reading `status.type.name` (machine code) instead of `status.type.description` (human-readable) from ESPN. This was fixed, but the risk of regression remains high. A CHECK constraint on the `games` table (migration 057) now prevents invalid status values, but the constraint is a safety net — the root fix is in the status mapping code. See `OUTAGE-REPORT-2026-05-16.md`.

2. **YouTube TV deep link instability.** Multiple migrations (052, 053, 054) were needed to fix YouTube TV's scheme and universal link. The universal link must point to `https://tv.youtube.com` (watch/login URL), not a marketing page. This is monitored by `deep-link-health-check` but has been a recurring issue.

3. **Team matching edge cases.** The fuzzy team matching system (`team-matching.ts`) handles 50+ aliases and includes multi-word validation, but edge cases remain — especially for teams with similar names across conferences (e.g., "Purdue" vs "Purdue Fort Wayne"). False positive matching can cause incorrect odds mapping.

## Known Gaps

### Data and Integrations

- **No blackout detection.** Broadcast data from ESPN/SportsDataIO reflects national coverage only. Regional sports network games and local market blackouts are not detected. A user may be routed to a provider that blacks out their game.
- **Limited MLB odds support.** The Odds API polling is configured for `basketball_ncaab`. NBA and MLB odds may not be ingested (needs verification of whether additional sport endpoints are called).
- **No NFL/NHL/college football support.** The system currently supports NCAA basketball, NBA, and MLB. Other sports are not yet integrated.
- **Stale broadcast data.** Broadcast assignments can change close to game time. The system relies on the most recent poll data and has no mechanism to detect last-minute changes.

### Alert Engine

- **Player prop alerting limited.** The `outcome-proximity` module computes proximity for player props, but the alert pipeline's prop coverage depends on having Sportradar summary data with individual player stats. Coverage may be incomplete for less-tracked players or stat categories.
- **No user feedback loop.** The alert engine scores and delivers alerts, but there is no mechanism for users to rate alert quality ("this was useful" / "this wasn't"). Future improvements to the scoring weights would benefit from explicit feedback.
- **No alert preview or digest.** Users receive alerts one at a time. There is no "morning briefing" or "tonight's watchlist" feature.

### Streaming and Watch Flow

- **No automated streaming availability check.** The app relies on broadcast strings from ESPN/SportsDataIO and the user's self-reported connections. There is no API that definitively confirms "this user can watch this game on YouTube TV right now."
- **No watch-party or social features.** The app is single-user focused. There are no shared watch lists, group alerts, or social viewing features.

### Advertising

- **No geographic ad targeting.** Sportsbook ads should be restricted to states where the sportsbook operates legally. The architecture supports targeting rules, but geographic enforcement is not implemented.
- **No real-time auction monitoring dashboard.** The admin portal has campaign metrics and fraud detection, but no live view of auctions happening in real-time.
- **Advertiser self-service is basic.** Creative approval is manual. Targeting options are limited to moment types and basic campaign parameters.

### Privacy and Compliance

- **No geofencing for gambling content.** Sportsbook CTAs and betting-related alerts are shown to all users regardless of jurisdiction.
- **No explicit age verification.** Age gating is delegated to the App Store rating and the sportsbook/platform. The app itself does not verify age.
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
2. **Should sportsbook ads be geo-restricted?** If yes, what is the geofencing mechanism — IP-based, user-declared state, or App Store region?
3. **Should Kalshi/Polymarket support be expanded or maintained as-is?** The current integration is read-only (positions + settlement). Is trade execution planned?
4. **Which streaming providers need priority deep-link fixes?** YouTube TV has been unstable. Are there other providers with known issues?
5. **Should there be a premium/ad-free tier?** The monetization model currently depends entirely on the ad auction. A subscription tier would diversify revenue but reduce auction inventory.
6. **How should the app handle the off-season?** NCAA basketball has a defined season. What happens in summer — MLB-only? Feature dormancy?
7. **Is the advertiser portal ready for external advertisers?** Or is it currently internal-only?
8. **Should location be required for broadcast availability?** Using GPS would improve broadcast mapping accuracy but raises privacy concerns.
9. **What is the multi-platform social strategy?** X/Twitter publishing is live. Instagram, Facebook, TikTok, Reddit are partially scaffolded. Which platforms are priority?
10. **Should email wager ingestion be promoted more aggressively?** The Gmail-based flow works but requires user action (forwarding emails). Is this sufficient or should other email providers be added?

## Immediate Priorities

Based on repository inspection, the highest-impact immediate work:

1. **Expand sports coverage.** Adding NFL (for fall) and college football would dramatically increase the addressable user base and align with the betting calendar.
2. **Stabilize deep-link health.** Continue monitoring via `deep-link-health-check`. Consider a periodic cron that automatically checks each provider's universal link for HTTP 200 + correct redirect.
3. **Add geographic ad targeting.** This is a compliance requirement for sportsbook advertisers. Implement state-level targeting based on user-declared location or IP inference.
4. **Implement automated health monitoring.** Connect the `health-check` endpoint to an external uptime monitor (e.g., Better Uptime, PagerDuty) that alerts on degradation.
5. **Write integration tests for the alert pipeline.** The most critical path (game state → alert → push) has unit tests but no end-to-end coverage.

## Near-Term Roadmap

### Sports Data Reliability
- Add health-check alerting for stale watchers and failed polls
- Implement automatic provider failover (if ESPN is down, auto-promote SportsDataIO)
- Add NFL/college football data sources and sport-specific parsing

### Alert Engine
- Add user feedback mechanism (thumbs up/down on alerts)
- Use feedback data to refine scoring weights
- Add "morning briefing" digest alert for the day's games
- Add "tonight's watchlist" push notification at 6 PM local time

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
- Geographic targeting for sportsbook ads
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
