# 01 — Product Context

## Executive Summary

Watch-NORMA is a mobile app for sports fans who have too many games, too many subscriptions, and too many generic alerts. It monitors live game state, the user's wagers and prediction-market positions, their favorite teams and players, and their connected streaming services, then sends push notifications at the exact moment a game becomes personally relevant. Each alert explains why the user should care, and routes them directly to the right streaming app with a single tap.

The app is live in the Apple App Store as an iOS app built with React Native / Expo. The backend runs on Supabase (Postgres + Deno Edge Functions). Revenue comes from a proprietary second-price Vickrey auction ad engine that attaches contextual sponsor ads to high-value alert moments. An advertiser portal (Next.js) lets advertisers manage campaigns, creatives, bids, and budgets.

Watch-NORMA sends alerts for NCAA basketball (NCAAM), NBA, MLB, NCAAF, and NFL. Football (NCAAF + NFL) was activated 2026-08-19 ahead of the 2026 season by adding both sports to `ALERTABLE_SPORTS` in `evaluate-alerts`; the client sport pills expose both alongside basketball and baseball. **ESPN is the canonical real-time source for live game state and scores across every sport** — its scoreboard endpoint drives `poll-schedule` (schedules for NBA/MLB/NCAAF/NFL) and `poll-boxscore` (live status transitions for all sports). SportsDataIO is a schedule/roster fallback for NCAAM only. Sportradar is a supplementary source for play-by-play and summary statistics on sports that carry an active Sportradar contract; it is not used for real-time scoring. Additional data: The Odds API (sportsbook odds from DraftKings, FanDuel, BetMGM, ESPNBet), Kalshi (prediction markets), and Polymarket (on-chain positions).

## Product Thesis

Sports viewing is moving from passive channel selection to personalized, data-triggered attention routing. The average fan cannot watch every game. They subscribe to multiple streaming services, place bets across sportsbooks, hold prediction-market positions, and follow specific teams and players. Yet the tools they use — score apps, sportsbook apps, streaming apps, fantasy apps — are siloed. None of them answer the compound question: "Is there something happening right now that I specifically should be watching, and where can I watch it?"

Watch-NORMA is the intelligent layer that sits between live sports, viewing rights, and the user's personal incentives. It exists because the intersection of those three things — what's happening, why it matters to you, and where to find it — is not served by any single existing app.

## Core Promise

**"Watch-NORMA tells you when to tune in."**

The user should not need to watch every minute of every game. Watch-NORMA monitors the games and markets in the background and surfaces the exact moments that matter to each individual user.

## Target Users

Watch-NORMA serves several overlapping user segments:

- **Sports fans** who follow specific teams or players and want to know when key moments are happening, not just final scores.
- **Sports bettors** who have active wagers on spreads, moneylines, totals, or player props across DraftKings, FanDuel, BetMGM, or other sportsbooks. They need to know when their bet is live — when the spread is being crossed, the total is approaching the line, or a player is nearing a prop threshold.
- **Prediction-market users** who hold positions on Kalshi or Polymarket tied to game outcomes. They need real-time awareness when those positions are at risk or resolving.
- **Multi-screen viewers** who are often watching one game while tracking several others. They need a smart second screen that tells them when to switch.
- **Cord-cutters and streaming subscribers** who pay for YouTube TV, ESPN+, Peacock, Prime Video, or other services but don't always know which service carries which game. They need seamless routing from alert to stream.
- **Fans who want fewer, better alerts** — people who have turned off ESPN notifications because they were too frequent and too generic.

## User Pain Points

Watch-NORMA addresses several specific frustrations:

- **Too many games, not enough time.** On a busy college basketball Saturday, there may be 50+ games. Which ones matter to me?
- **Too many subscriptions, not enough clarity.** A user paying for YouTube TV, ESPN+, and Peacock still doesn't know which one carries tonight's game.
- **Generic push notifications.** ESPN sends score alerts for every game. That's noise, not signal.
- **Missed high-leverage moments.** A user's spread bet was live with 2 minutes left, but they didn't know until they checked the app an hour later.
- **Friction between alert and stream.** Even when a user gets a useful notification, tapping it rarely takes them directly to the live stream.
- **No compound awareness.** No existing app combines game state, betting positions, streaming access, and personal preferences into a single decision: "Should I watch this right now?"

## Product Differentiation

Watch-NORMA is not a score app, a sportsbook, a fantasy app, a TV guide, or a streaming aggregator. It is distinct from all of these:

- **vs. ESPN / CBS Sports / Bleacher Report** — Those apps send generic score updates. Watch-NORMA sends personalized, explainable alerts tied to the user's wagers, positions, and preferences. It also routes to the correct streaming app.
- **vs. DraftKings / FanDuel apps** — Sportsbook apps track bets but don't combine that with streaming routing, prediction-market awareness, or team/player-following context. They also don't tell you where to watch.
- **vs. Fantasy apps** — Fantasy apps focus on stat accumulation across a roster. Watch-NORMA focuses on live moment relevance and viewing action.
- **vs. TV Guide / JustWatch** — Those apps show what's on. Watch-NORMA tells you why you should care and when to tune in.
- **vs. YouTube TV / streaming apps** — Streaming apps show their own catalog. Watch-NORMA is provider-agnostic and routes the user to whichever service has the game.
- **vs. generic push-alert apps** — Watch-NORMA's alerts include structured "Why Now" explanations (headline, bullets, stats, wager impact) and are throttled, deduplicated, and scored for relevance.

## Product Status (as of May 2026)

Based on repository inspection, the following features are in the indicated states:

**Implemented and live:**
- iOS app in the Apple App Store (React Native / Expo)
- User authentication (email/password + Apple Sign-In)
- Game schedule ingestion (NCAAM, NBA, MLB, NCAAF, NFL) from ESPN + SportsDataIO + Sportradar
- Live score polling from ESPN (primary) with SportsDataIO fallback
- Play-by-play and summary ingestion from Sportradar with SportsDataIO fallback
- Game-watcher orchestrator with durable Postgres-backed state, backoff, and rate budgeting
- Sportsbook odds polling from The Odds API (DraftKings, FanDuel, BetMGM, ESPNBet)
- Kalshi prediction-market integration (RSA-signed API, position sync, settlement)
- Polymarket prediction-market integration (wallet-based, position sync)
- Alert engine v2 with 4-stage pipeline (candidate generation, signal extraction, scoring, delivery)
- Structured "Why Now" alert explanations with headlines, bullets, wager impact
- Alert throttling, deduplication, quiet hours, per-user caps
- Push notifications via Expo Push API with delivery logging
- Streaming-provider deep linking (3-step fallback: native scheme, universal link, App Store)
- Manual wager entry with parlay support
- Bet slip scanning via Claude Vision (photograph a bet slip)
- Email wager ingestion from Gmail (forwarded sportsbook confirmation emails)
- Wager auto-resolution on game close (spread, moneyline, over/under)
- User preferences (favorite teams, quiet hours, notification caps)
- Connections management (streaming, TV, sportsbooks, prediction markets)
- Vickrey auction ad engine with Thompson Sampling creative optimization
- Dynamic floor pricing, budget pacing, fraud detection
- Advertiser portal (Next.js) with campaign management, billing, reporting
- Stripe integration for advertiser wallet deposits
- Automated social content generation and publishing (X/Twitter)
- CMO agent for brand social content with Claude
- CI/CD via GitHub Actions (TypeScript checks, Jest, Deno type-checks, EAS OTA updates)
- Deep-link health monitoring and observability
- Health-check endpoint for system monitoring
- Account deletion (GDPR/App Store compliance)

**Partially implemented:**
- Multi-platform social publishing (Instagram, Facebook, TikTok, Reddit) — engine built, not all platform APIs fully connected
- Web advertiser portal — core pages exist, some admin features in progress

**Planned (scaffolded but no external API exists):**
- Sportsbook partner API integrations (DraftKings, FanDuel) — `BetIngestor` interface defined, stub adapters written. No public consumer API exists for these services.
- OAuth-based sportsbook account linking

**Not possible with current external APIs:**
- Watch history from streaming services (no streaming service offers this API)
- Automatic bet detection from sportsbook apps (would require scraping, violates ToS)
