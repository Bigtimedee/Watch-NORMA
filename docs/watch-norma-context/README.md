# Watch-NORMA Project Context

This folder is the canonical project brain for Watch-NORMA. It contains everything a developer, AI agent, designer, or stakeholder needs to understand the product, architecture, business model, integrations, alert logic, streaming routing, advertising engine, and operational rules.

## What Is Watch-NORMA?

Watch-NORMA is a personalized sports-viewing intelligence app. It monitors live games, user preferences, sportsbook wagers, prediction-market positions, and streaming availability, then sends timely push notifications that tell users exactly when to tune in, why the moment matters, and where to watch. The core promise: **"Watch-NORMA tells you when to tune in."**

The app is live in the Apple App Store. It includes a React Native/Expo mobile client, a Supabase backend (Postgres + Edge Functions), a second-price Vickrey auction advertising engine, a Next.js advertiser portal, and an automated social content pipeline.

## Why This Folder Exists

Watch-NORMA is a complex system spanning live sports data ingestion, real-time alert scoring, streaming-provider deep linking, ad auctions, prediction-market settlement, social media automation, and mobile push delivery. No single file captures the full picture. This folder does.

## Required Reading Order

1. **[01_PRODUCT_CONTEXT.md](01_PRODUCT_CONTEXT.md)** — What Watch-NORMA is, who it serves, why it exists
2. **[02_USER_EXPERIENCE_AND_FLOWS.md](02_USER_EXPERIENCE_AND_FLOWS.md)** — User flows, screens, onboarding, alert delivery, streaming routing
3. **[03_TECHNICAL_ARCHITECTURE.md](03_TECHNICAL_ARCHITECTURE.md)** — Repo structure, tech stack, frontend/backend architecture, env vars, API surface
4. **[04_DATA_AND_INTEGRATIONS.md](04_DATA_AND_INTEGRATIONS.md)** — Sports data, streaming providers, sportsbooks, prediction markets, integration status
5. **[05_ALERTS_STREAMING_AND_LIVE_SPORTS_LOGIC.md](05_ALERTS_STREAMING_AND_LIVE_SPORTS_LOGIC.md)** — Alert philosophy, scoring pipeline, streaming routing rules, dedup, timing
6. **[06_ADS_MONETIZATION_AND_AUCTION_LOGIC.md](06_ADS_MONETIZATION_AND_AUCTION_LOGIC.md)** — Vickrey auction, floor pricing, fraud detection, advertiser portal, billing
7. **[07_SECURITY_PRIVACY_AND_RISK.md](07_SECURITY_PRIVACY_AND_RISK.md)** — Auth, secrets, sensitive data, legal/regulatory, abuse prevention
8. **[08_TESTING_DEPLOYMENT_AND_OPERATIONS.md](08_TESTING_DEPLOYMENT_AND_OPERATIONS.md)** — Local dev, CI/CD, testing strategy, deployment, observability
9. **[09_ROADMAP_KNOWN_GAPS_AND_DECISIONS.md](09_ROADMAP_KNOWN_GAPS_AND_DECISIONS.md)** — Bugs, gaps, open decisions, priorities, long-term vision
10. **[10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md](10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md)** — Hard rules, closing checklist for every session
12. **[12_PRODUCTION_RECONCILIATION_2026_07.md](12_PRODUCTION_RECONCILIATION_2026_07.md)** — What production actually runs versus what the repo contains. Read before trusting the migration ledger or assuming a function is deployed.
11. **[11_END_TO_END_USER_JOURNEY_MAP.md](11_END_TO_END_USER_JOURNEY_MAP.md)** — Every user type mapped end to end, each step tied to the file that owns it. Self contained: start here if you are reading only one file.

## Mandatory Rule for Future Work

Before performing any work on Watch-NORMA, read this documentation folder. Treat it as the canonical project context. If your work changes product behavior, architecture, schema, routes, environment variables, integrations, alert logic, streaming-provider routing, ad logic, privacy assumptions, or core assumptions, update this documentation in the same session.

## Keeping This Documentation Current

This folder must be updated whenever any of the following change:

- Product behavior or user flows
- Architecture or tech stack
- Database schema or migrations
- API routes or Edge Functions
- Environment variables or secrets
- Live sports data handling or provider logic
- Alert scoring, throttling, or delivery
- Streaming-provider routing or deep linking
- Ad auction, billing, or fraud detection
- Privacy, security, or compliance assumptions
- Deployment, CI/CD, or operational procedures
- Social content pipeline or publishing
- Roadmap priorities or known gaps
