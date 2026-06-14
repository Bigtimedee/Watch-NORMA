# NORMA CLI Prompt Pack — "Intent Layer for Live Sports"

This folder is a sequenced set of **copy-and-paste prompts** for the Claude CLI. Each file is a
single, self-contained ticket: paste the whole file's prompt block into the CLI, let it run to
completion, review the diff, commit, then move to the next one.

The pack is built around one thesis (your words): **NORMA monetizes the exact moment a fan suddenly
cares.** Search captured intent for the web; NORMA captures intent for live sports — and routes
viewers, wagers, and spend at the second value is highest. To get there NORMA must be (1) boringly
reliable at scale, then (2) productized as a real intent marketplace with demand beyond a single
sportsbook category.

## How to use this pack

1. Work **top to bottom**. Phase 1 hardens the platform; Phase 2 builds the marketplace on top of
   it. Several Phase 2 tickets assume Phase 1 measurement/observability exists.
2. Paste **one file at a time**. Each is scoped to a single shippable PR.
3. After each run: review the diff, run the test commands the prompt specifies, then commit.
4. Don't batch. Atomic tickets keep the blast radius small and the non-negotiable rules enforceable.

## Sequencing at a glance

**Phase 1 — Platform hardening** (close the gaps in `docs/watch-norma-context/09_*`)
- P1-01 Alert-pipeline integration tests (the critical path has no E2E coverage)
- P1-02 Load-test harness for March Madness scale
- P1-03 Automated health monitoring + paging
- P1-04 Data-retention cleanup jobs
- P1-05 Automated universal-link health verification cron
- P1-06 Automatic data-provider failover (ESPN → SportsDataIO)
- P1-07 CTA-level geo enforcement parity + tests
- P1-08 Multi-sport odds coverage (NBA/MLB) verification + extension
- P1-09 Alert user-feedback loop (thumbs up/down)
- P1-10 Column-level encryption for Kalshi credentials (pgcrypto)
- P1-11 Blackout / regional-restriction uncertainty surfacing
- P1-12 NFL + college-football ingestion scaffold

**Phase 2 — Intent marketplace** (the monetization thesis)
- P2-01 Formalize the "intent moment" as the unit of inventory
- P2-02 Real-time auction monitoring dashboard
- P2-03 Closed-loop conversion & attribution measurement
- P2-04 Productize supply forecasting on `/inventory`
- P2-05 Per-category floor pricing + yield management
- P2-06 Generalize demand categories (streaming + commerce)
- P2-07 Post-outcome commerce moment type (Fanatics-style)
- P2-08 Partner-API readiness scaffold (DK/FD) — scaffold only, no fabrication
- P2-09 Programmatic Intent API design + auth scaffold (server-to-server)
- P2-10 Brand-safety & editorial-separation hardening for new demand

## Global rules every prompt re-states (and you should hold the CLI to)

These come straight from `docs/watch-norma-context/10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`.
They are repeated in each ticket, but the short version:

- **Read `docs/watch-norma-context/` first.** It is the canonical project brain.
- **Update the docs in the same session** if behavior, schema, routes, env vars, integrations,
  alert logic, streaming routing, or ad logic change. End each session by answering the closing
  checklist in doc 10.
- **Never break streaming-provider routing.** The native-scheme → universal-link → App Store
  fallback chain is sacred. Never route a known subscriber to a marketing/sign-up page.
- **Ads are additive, never blocking.** The auction runs inside the alert pipeline but must never
  delay delivery or displace the "Watch on [Provider]" primary action. "Bet Now" is secondary.
- **Never fabricate integrations.** No DraftKings/FanDuel consumer API exists. Scaffolds must be
  clearly labeled and return empty / "coming soon" — never fake data or fake UI state.
- **Migrations are additive only.** Next free prefix is **067**. Never drop columns v1 depends on.
- **ESPN: always `status.type.description`, never `status.type.name`.** (Cause of the 37-day P0.)
- **Tests are mandatory** for any change to alert scoring, throttling/dedup, routing, or the auction.
- **Never log secrets.** RLS enforces user-scoped access. Keep it that way.
- **"Watch NORMA" is the brand. Never propose renaming it.**

## A blunt note on the thesis (read before Phase 2)

The pitch positions NORMA against Google/Meta/Trade Desk and names DraftKings, FanDuel, YouTube TV,
Prime Video, Peacock, and Fanatics as the demand side. Be clear-eyed about what is buildable now
versus partnership-gated:

- **Buildable now:** the intent-moment model, real-time auction telemetry, attribution measurement,
  supply forecasting, per-category pricing, and additional advertiser *categories* (the bid records
  and creatives are just rows — you don't need the partner to exist to model the inventory).
- **Partnership-gated, not code-gated:** actual DK/FD/streamer/Fanatics demand, server-to-server
  programmatic bidding by real partners, and any "wager sync" from sportsbooks. P2-08 and P2-09
  build the *interface and readiness*, not live partner connections. Do not let the CLI ship UI or
  copy that implies these partners are live until contracts exist. Conflating "we built the socket"
  with "the partner is plugged in" is the single most likely way this roadmap misleads investors.

The marketplace is real and defensible on the supply side (you own the moment). The demand side is a
business-development problem these prompts cannot solve — they only make NORMA ready to absorb demand
the instant it is signed.
