# NORMA Partnership Plan
### Driving User Acquisition, Advertiser Revenue, and Acquisition-Ready Scale
**Prepared June 2026 — Confidential**

---

## Implementation Status — June 2026

All tasks below have been implemented, committed, and pushed to production.

| Task | Description | Status | Commit |
|------|-------------|--------|--------|
| SB-01 | Enable Programmatic Intent API | ✅ Complete | Activated, INTENT_API_ENABLED=true |
| SB-02 | Deploy MCP server to Railway + DNS | ✅ Complete | mcp.getnorma.app live |
| SB-03 | DraftKings ConversionIngestor adapter | ✅ Complete | See _shared/conversion-ingestor.ts |
| SB-04 | Sportsbook advertiser onboarding package | ✅ Complete | /onboarding?track=sportsbook, pitch doc |
| SB-05 | Direct deal proposal template + portal | ✅ Complete | Migration 085, /admin/campaigns/direct-deals |
| SB-06 | Co-marketing landing pages for referrals | ✅ Complete | /partners/[partnerKey], migration 086 |
| ST-01 | Activate streaming demand type | ✅ Complete | /onboarding?track=streaming, removed scaffold label |
| ST-02 | Streaming affiliate tracking infrastructure | ✅ Complete | Migration 087, /admin/revenue/affiliates |
| ST-03 | Streaming partner outreach materials | ✅ Complete | streaming-partner-outreach.md |
| PM-01 | Kalshi connection experience upgrade | ✅ Complete | KalshiWizard why-connect + tutorial + test |
| PM-02 | Polymarket position alert improvements | ✅ Complete | resolve_risk alert type in evaluate-alerts |
| SM-01 | Press kit and editorial partnership package | ✅ Complete | press-kit.md, editorial-partnership-pitch.md |
| SM-02 | Social content pipeline partner mentions | ✅ Complete | alert_called_it template, partner_mention column |
| FF-01 | Fantasy roster import | ✅ Complete | ImportRosterSheet, migration 088 |
| TP-01 | Apple App Store feature submission | ✅ Complete | apple-app-store-feature-checklist.md |
| TP-02 | Anthropic case study | ✅ Complete | anthropic-case-study.md |
| IR-01 | Health monitoring + status page | ✅ Complete | /status page, uptime-monitoring-setup.md |
| IR-02 | Advertiser reporting API CSV export + webhook | ✅ Complete | Migration 089, GET /reporting-api/export |
| IR-03 | Partner management dashboard | ✅ Complete | Migration 090, /admin/partners full CRM |

---

## How to Use This Document

Each section describes a specific partner category, the strategic rationale, and concrete implementation tasks. Tasks labeled with a **[CLI]** tag have been implemented — the prompt text is preserved for reference.

---

## Executive Summary

NORMA's path to a $1B+ acquisition runs through one equation: **more users × more advertiser spend = a marketplace that acquirers must own rather than rebuild.** Organic app store growth alone won't get there in 12-24 months. Partnerships will.

NORMA's position is strategically unique. The app sits at the intersection of three industries — sports betting, streaming, and sports media — each of which is actively consolidating, each of which needs what NORMA has. Sportsbooks (FanDuel, DraftKings) want to reach engaged bettors at peak intent moments. Streaming services (ESPN+, YouTube TV) want to reduce churn and grow subscriptions. Sports media companies (ESPN, The Athletic) want to extend engagement beyond the app. NORMA is the layer connecting all of them to users in the exact moment they are most likely to act.

This plan targets three outcomes that compound toward acquisition readiness:

1. **User growth via distribution partnerships** — sportsbooks and streaming services embed or co-market NORMA to their user bases, driving downloads without paid acquisition cost.
2. **Advertiser revenue via commercial partnerships** — the same sportsbooks and streaming services become NORMA's highest-value advertisers, running campaigns in the Vickrey auction targeting those intent moments.
3. **Technical moats via verified data partnerships** — server-to-server conversion callbacks from sportsbook partners upgrade NORMA's attribution from "inferred" to "verified," creating a data advantage that no competitor can replicate without the same partnerships.

The acquisition thesis: an acquirer (a sportsbook, a media company, or an ad-tech platform) that acquires NORMA gets a proprietary intent-moment marketplace, a captive high-value audience, and a partner network that they cannot easily rebuild. Each partnership signed between now and the acquisition event makes NORMA harder to replicate and more strategically necessary to own.

---

## Strategic Framework

### The Two Jobs of Every Partnership

Every partnership NORMA signs should do at least one of these jobs — ideally both:

**Job 1 — Grow the user base.** NORMA's ad inventory is constrained by DAU. At the current average clearing price of ~$0.30 per impression and a max of 3 ads/user/day, reaching $10K MRR requires roughly 1,000–2,500 DAU. Reaching the scale needed to be credible as a $1B+ acquisition target (conservatively 100K+ MAU) requires distribution leverage that the App Store alone cannot provide on NORMA's timeline.

**Job 2 — Grow advertiser revenue.** NORMA's auction is only as valuable as the advertisers competing in it. Right now, sportsbook advertisers are the primary category. Adding streaming services and commerce advertisers (merchandise, ticketing, food delivery) creates a multi-category auction with deeper competition, higher clearing prices, and a more defensible revenue base.

### Partner Tiers

| Tier | Partners | Primary Job |
|------|----------|-------------|
| 1 — Sportsbooks | FanDuel, DraftKings, BetMGM, Caesars, ESPNBet | Both (distribution + advertising) |
| 2 — Streaming | ESPN+, YouTube TV, Peacock, Prime Video, Paramount+ | Both (distribution + advertising) |
| 3 — Prediction Markets | Kalshi, Polymarket | Distribution (user acquisition) |
| 4 — Sports Media | The Athletic, Bleacher Report, Yahoo Sports | Distribution |
| 5 — Fantasy Sports | DraftKings DFS, Yahoo Fantasy, Sleeper, Underdog | Distribution |
| 6 — Tech Platforms | Apple, Anthropic | Distribution + credibility |

---

## Tier 1: Sportsbooks

### Why Sportsbooks Are Priority One

Sportsbooks have three things NORMA needs: massive marketing budgets, a user base almost perfectly overlapping with NORMA's target audience, and a near-term regulatory urgency to acquire bettors efficiently before competitors do.

FanDuel alone reportedly spends $400M+ annually on marketing. DraftKings is comparable. That spend currently goes to TV commercials, generic digital ads, and app install campaigns targeting cold audiences. NORMA offers something fundamentally different: a captive audience of active bettors who are already tracking their wagers in NORMA, at the exact moment those wagers are live and at stake. That is the highest-value moment a sportsbook CTA can appear.

The additional structural advantage: NORMA already has technical scaffolding for sportsbook partner API integrations (`_shared/bet-ingestor.ts`, stub adapters for DraftKings and FanDuel). The `ConversionIngestor` interface (`_shared/conversion-ingestor.ts`) is ready to receive server-to-server conversion callbacks. These exist in the codebase precisely because this partnership type was anticipated.

### Target Partners

**FanDuel** — Highest priority. Owned by Flutter Entertainment (publicly traded). Has a structured BD team and active ad partnerships. FanDuel's audience skews younger, sports-obsessed, and multi-platform — a near-perfect match. FanDuel also has the FanDuel TV property (formerly Fox Bet Super 6/Stadium), suggesting appetite for content-adjacent engagement tools.

**DraftKings** — Second priority. Publicly traded, large media-buying operation, owns VSiN (sports betting radio/streaming). DraftKings has been acquisitive in the media/engagement space (acquired Golden Nugget, PointsBet US). Direct competitor to FanDuel but both should be approached — category exclusivity in the auction is configurable, and BD negotiations can proceed in parallel.

**BetMGM** — Owned by Entain and MGM Resorts. Large marketing budget. MGM's hospitality assets create potential for commerce integrations (hotel deals, event tickets) that extend beyond pure sportsbook advertising.

**Caesars Sportsbook** — Known for aggressive customer acquisition offers. Lower-fit on the media side but high ad spend.

**ESPNBet** — Penn Entertainment's ESPN-licensed product. Already tracked in NORMA's odds polling. The ESPN brand connection means potential for media co-marketing angles.

### Partnership Structures

**Structure A: Advertising Partnership (Immediate Revenue)**
The sportsbook runs paid campaigns in NORMA's Vickrey auction targeting high-intent moments. The sportsbook gets: unique access to engaged bettors at peak intent moments, closed-loop attribution (currently inferred, upgradeable to verified via server-to-server callbacks), geo-compliant delivery (NORMA's auction already filters by state jurisdiction), and Thompson Sampling creative optimization at no additional cost.

NORMA gets: recurring ad revenue at or above the current floor CPMs ($0.25–$0.60 depending on moment type), proof of enterprise advertiser demand that strengthens the acquisition valuation, and data on sportsbook CTA effectiveness that improves the auction over time.

**Structure B: Co-Marketing / User Acquisition (Distribution)**
The sportsbook surfaces NORMA to their users as a recommended companion app. This could be as lightweight as an email mention ("Track your bets smarter with NORMA") or as deep as a co-branded integration in the sportsbook's confirmation email flow. Given that NORMA already ingests wager confirmation emails from sportsbook accounts (`ingest-email-wagers`), there is a natural narrative: "Forward your bet confirmations to NORMA to track them automatically."

NORMA gets: distribution to millions of active bettors. The sportsbook gets: a stickiness tool that keeps their bettors engaged with their wagers, reducing churn.

**Structure C: Server-to-Server Conversion Callbacks (Data Partnership)**
Once any advertising relationship is established, the strategic upgrade is getting the sportsbook to fire a server-to-server callback when a NORMA-attributed user places a bet. This changes NORMA's conversion data from `verification_source = 'inferred'` to `verification_source = 'partner_api'` — a fundamental improvement in attribution quality. No competitor without this partnership can offer verified sportsbook conversion data.

NORMA's `ConversionIngestor` interface is already defined. The technical implementation for one partner is a matter of writing the adapter. The business requirement is a revenue-share or cost-per-acquisition agreement that incentivizes the sportsbook to invest the engineering work.

### Implementation Tasks

---

**TASK SB-01: Deploy and activate the Programmatic Intent API**

The Programmatic Intent API (`intent-api` Edge Function, P2-09) is production-ready but gated behind `INTENT_API_ENABLED` (default off). Enabling it allows sportsbook media buyers and DSPs to programmatically query NORMA's inventory and submit bids — a prerequisite for any enterprise advertising relationship.

This is also the technical foundation for telling a sportsbook's media buying team: "You can connect your DSP directly to our inventory." That is the kind of enterprise-grade infrastructure that supports both the advertiser pitch and the acquisition narrative.

**[CLI]** Paste this prompt into Claude in the Watch-NORMA project directory:

```
Enable the NORMA Programmatic Intent API for production use. Specifically:

1. In the Supabase dashboard, set the INTENT_API_ENABLED secret to "true" for the production project.
2. Review supabase/functions/intent-api/index.ts to confirm the implementation is production-ready: correct auth, rate limiting, correct floor price lookups from the DB (not hardcoded), and accurate 7-day supply forecasts from the supply_forecasts table.
3. Confirm the api_keys table (migration 079) is present and correct. Add a seed SQL comment showing how to create an initial API key for a test partner.
4. Write a concise API reference document at docs/partner-api/intent-api-reference.md covering: authentication (Bearer token via api_keys table), GET /inventory (parameters, response schema, example), POST /bid (parameters, validation rules, response), rate limits, and error codes.
5. Update docs/watch-norma-context/06_ADS_MONETIZATION_AND_AUCTION_LOGIC.md to mark P2-09 as "Live" with the enable instructions.
```

---

**TASK SB-02: Deploy the MCP server to Railway and configure DNS**

The `norma-ads-mcp` MCP server is production-ready, containerized, and has a committed `railway.toml`. The only remaining steps are deployment and DNS. This makes NORMA's ad inventory accessible to AI agents, DSPs, and Claude-powered media buyers — a credible differentiator in any enterprise advertising pitch.

When a FanDuel media buyer asks "Can your platform connect to our systems automatically?", the answer is: "Yes. We support MCP over HTTP/SSE at `mcp.getnorma.app`, as well as a full REST API with OpenAPI spec at `getnorma.app/api/ads/openapi.json`."

**[CLI]**:

```
Complete the MCP server deployment for NORMA's agentic advertising infrastructure. Specifically:

1. Review packages/norma-ads-mcp/railway.toml and packages/norma-ads-mcp/Dockerfile to confirm they are deployment-ready.
2. Provide step-by-step deployment instructions for Railway (not automated — Dave will run these manually):
   a. How to create the Railway project from the norma-ads-mcp package
   b. Which environment variables to set (NORMA_API_KEY, PORT, etc.)
   c. How to get the Railway service hostname after deploy
3. Provide the exact DNS CNAME record to add: mcp.getnorma.app → <railway-service>.up.railway.app
4. Update web/public/adagents.json to confirm mcp_server_url is "https://mcp.getnorma.app" (already correct per docs — just verify).
5. Write a one-page partner technical brief at docs/partner-api/mcp-server-brief.md explaining what the MCP server is, who it's for, how to connect, and what tools are exposed. Target audience: a technical media buyer at FanDuel or DraftKings.
```

---

**TASK SB-03: Implement the DraftKings ConversionIngestor adapter**

NORMA's `_shared/conversion-ingestor.ts` has a stub adapter for DraftKings that returns `{ accepted: false, reason: "not_live" }`. Building the real adapter implementation (behind a feature flag) creates a shippable technical artifact that can be demonstrated to DraftKings during BD conversations. It also positions NORMA to go live with verified conversion tracking the moment DraftKings agrees to fire the callback.

**[CLI]**:

```
Build the DraftKings ConversionIngestor adapter in NORMA's codebase. Specifically:

1. Read supabase/functions/_shared/conversion-ingestor.ts to understand the ConversionIngestor interface and existing stub.
2. Read supabase/functions/_shared/geo-compliance.ts to understand how sportsbook geo rules work.
3. Implement a DraftKingsIngestor class that:
   a. Accepts an incoming HMAC-SHA256 signed webhook payload (use the auth model described in 06_ADS_MONETIZATION_AND_AUCTION_LOGIC.md: 300s replay window, secrets via Supabase secrets)
   b. Validates the signature (reject if invalid or replayed)
   c. Maps the incoming payload to a NormalizedConversion object with: user_id (via a lookup on wagers.external_bet_id or profiles.email), campaign_id (from impression attribution within the 30-minute window), conversion_type ("wager_placed"), and verification_source = "partner_api"
   d. Returns { accepted: true } on success or { accepted: false, reason } on failure
4. Gate the adapter behind a Supabase secret: DRAFTKINGS_CALLBACK_SECRET. If not set, return { accepted: false, reason: "not_configured" }.
5. Add a new Edge Function supabase/functions/conversion-callback/index.ts that: routes incoming requests to the correct ingestor based on a path parameter (e.g., /conversion-callback/draftkings), handles CORS, writes verified conversions to the conversions table with verification_source = "partner_api".
6. Write unit tests for the HMAC validation and payload mapping.
7. Document the callback spec at docs/partner-api/conversion-callback-spec.md — this is the document you hand to DraftKings engineering to implement their side.
```

---

**TASK SB-04: Build the Sportsbook Advertiser Onboarding Package**

FanDuel's media buying team needs to be able to sign up for NORMA's advertiser portal, create a campaign, and see results within 30 minutes of receiving a pitch. The current onboarding flow exists but needs a sportsbook-specific track: pre-configured moment type targeting (spread_alert, close_game, bet_resolved), a sample campaign with realistic CPM estimates, and documentation written for a media buyer rather than a developer.

**[CLI]**:

```
Create a sportsbook advertiser onboarding package for NORMA. This includes:

1. Read web/ (the Next.js advertiser portal) to understand the current onboarding flow at /onboarding.
2. Create a "Sportsbook Fast Track" onboarding variant that pre-selects:
   - Moment types: spread_alert, moneyline_alert, close_game, bet_resolved, overtime, player_prop
   - Demand type: sportsbook
   - CTA label: "Bet Now"
   - Attribution window: 30 minutes
   - Suggested starting bid: $0.35 (just above the close_game floor)
3. Create a one-page partner pitch document at docs/partnerships/sportsbook-advertiser-package.md covering:
   - NORMA's inventory: what an "intent moment" is, why it's high-value
   - Available moment types and their floor CPMs
   - Audience profile (active bettors, wager trackers, prediction market users)
   - Attribution methodology (inferred today, upgradeable to verified via S2S callback)
   - Pricing (Vickrey auction, second-price clearing, no minimum commitment)
   - Geo-compliance (built-in state-level filtering for sportsbook ads)
   - Self-serve portal walkthrough (create account → deposit via Stripe → create campaign → live in under 30 min)
   - Contact: bd@norma-app.com
4. Add a "Request a Demo" CTA to the advertiser portal's landing page that emails bd@norma-app.com with the requester's name, company, and monthly budget range.
```

---

**TASK SB-05: Build a Direct Deal proposal template for guaranteed inventory**

NORMA's auction supports `priority_tier > 0` direct deals that bypass competitive bidding. For a sportsbook willing to commit to a guaranteed monthly spend ($5K–$50K/month), NORMA can offer guaranteed delivery at a negotiated CPM — a much simpler buying model that suits enterprise advertisers who don't have programmatic trading desks.

**[CLI]**:

```
Create a direct deal (guaranteed delivery) proposal template and supporting infrastructure. Specifically:

1. Read supabase/functions/_shared/auction-engine.ts to understand how priority_tier direct deals bypass the auction.
2. Create a proposal template at docs/partnerships/direct-deal-proposal-template.md. It should be a fill-in-the-blank document covering:
   - Partner name and campaign description
   - Guaranteed monthly impression volume (e.g., 50,000 impressions/month)
   - Negotiated CPM (e.g., $0.40 CPM = $20/1,000 impressions)
   - Total guaranteed monthly spend (impressions × CPM / 1000)
   - Target moment types and sports
   - Flight dates (start/end)
   - Creative specs (logo, sponsor_text max 120 chars, CTA URL)
   - Attribution reporting cadence (weekly email report)
   - Payment terms (monthly invoice or prepaid wallet)
3. Add a "Direct Deal" campaign type to the admin campaign creation flow in the advertiser portal: when demand_type = 'direct_deal', set priority_tier = 1 and hide the bid/budget UI in favor of a monthly impression guarantee field.
4. Create an admin view at /admin/campaigns/direct-deals that shows all priority_tier > 0 campaigns with their guaranteed delivery pacing: impressions committed vs. delivered, days remaining, and a flag if delivery is running behind pace.
```

---

**TASK SB-06: Create a co-marketing user acquisition page for sportsbook referrals**

NORMA already has a referral system (migration 066: referral_codes, referrals tables, get-referral-code edge function). The missing piece is a co-branded landing page that a sportsbook can link to from their confirmation emails or app: "Track your DraftKings bets smarter. Download Watch NORMA."

**[CLI]**:

```
Build a co-marketing landing page for sportsbook user acquisition partnerships. Specifically:

1. Create a new page at web/app/partners/[partnerKey]/page.tsx (e.g., /partners/draftkings) that:
   - Accepts a partner key in the URL and renders a co-branded landing page
   - Displays the partner's logo (pulled from provider_registry by key) alongside the NORMA logo
   - Headline: "Track your [Partner] bets with Watch NORMA"
   - Three value props tailored to bettors: (1) Get alerted when your spread is live, (2) Know when to tune in, (3) See your wager status in real time
   - App Store download button with an associated referral code (generate one per partner using the existing get-referral-code function)
   - The referral code is embedded in the App Store URL as a deep link so downloads from this page are attributed to the partner
2. Create a seed SQL snippet that creates referral_codes for draftkings, fanduel, betmgm, caesars, espnbet.
3. Add a /admin/partners page that shows each partner's referral code, a link to their co-marketing page, and conversion metrics (clicks → downloads → activations) pulled from the referrals table.
4. Document the co-marketing page at docs/partnerships/co-marketing-landing-page.md with instructions for how to brief a sportsbook's marketing team on adding the link to their confirmation email.
```

---

## Tier 2: Streaming Providers

### Why Streaming Providers Are Priority Two

Streaming services have a subscriber acquisition and churn problem. A YouTube TV or ESPN+ subscriber who regularly uses NORMA to find and watch games is a significantly more engaged subscriber — and a more valuable one to the streaming service. NORMA can demonstrate this value through the `stream_open` conversion events it already tracks (though currently inferred, not verified).

The pitch to a streaming service is: "Your most engaged subscribers are the ones who feel compelled to tune in to specific games. NORMA's users are those subscribers. Advertise your service to our users, and you'll acquire subscribers who are pre-disposed to stick around."

There are also deep-link revenue opportunities. When a streaming service has an affiliate program and NORMA drives a subscription sign-up via a "Watch on ESPN+" CTA, NORMA can earn a referral commission. This is a near-zero-cost revenue channel: the infrastructure (deep links, `stream_open` attribution) already exists.

### Target Partners

**ESPN+** — Highest priority. ESPN's content is deeply integrated into NORMA's data (ESPN is the primary score source). ESPN+ carries a large portion of NCAA and NBA content. The deep-link scheme (`sportscenter://`) is already in the provider registry. A partnership pitch can be grounded in shared audience (NORMA users watch ESPN content) and shared economics (ESPN+ wants subscriber acquisition).

**YouTube TV** — High priority. Carries all major broadcast and cable networks. NORMA's most common "Watch" CTA likely points to YouTube TV for users who have it connected. Deep-link stability has been a recurring issue (migrations 052–054), making a formal partnership relationship doubly valuable — YouTube TV's tech team would have an incentive to notify NORMA of changes.

**Peacock** — NBC's streaming service. Carries NFL Sunday Night Football, Premier League, and Big Ten basketball. Acquired Hulu's live sports subscribers. Actively investing in sports content.

**Prime Video** — Carries NFL Thursday Night Football exclusively. Growing sports portfolio.

**Fubo / Sling / DirecTV Stream** — Cord-cutter alternatives to YouTube TV. All carry live sports. Lower priority than the top two but includeable in a broader streaming partnership sweep.

### Partnership Structures

**Structure A: Advertising Partnership** — The streaming service runs campaigns in NORMA's auction targeting `stream_open` and `close_game` moment types. CTA: "Watch Now on ESPN+." Attribution is inferred (`stream_open` conversion) upgradeable to verified if the streaming service fires a subscription-confirmation callback. This is the same server-to-server callback model as the sportsbook ConversionIngestor.

**Structure B: Affiliate Commission** — NORMA refers subscribers to the streaming service via deep links. If the streaming service has an affiliate program (Amazon Associates covers Prime Video; ESPN/Disney has affiliate structures), NORMA earns per referral. The `stream_open` event is already tracked — adding an affiliate parameter to the deep link is a small technical task.

**Structure C: Featured Placement** — The streaming service features NORMA in their app's sports section or sends an email to subscribers: "Know exactly when to tune in. Watch NORMA." Low-effort distribution play.

### Implementation Tasks

---

**TASK ST-01: Activate streaming demand type in the advertiser portal**

The auction engine's `streaming` demand type is fully implemented (migration 077) but the advertiser portal currently labels streaming/commerce campaigns as "Scaffolded — no live deals." Removing that label and activating the self-serve flow for streaming advertisers opens the channel for inbound streaming service advertisers.

**[CLI]**:

```
Activate the streaming demand type in NORMA's advertiser portal. Specifically:

1. Read web/ to find where streaming/commerce campaigns are labeled "Scaffolded — no live deals."
2. Remove the scaffolded label. Replace it with the correct CTA copy for streaming campaigns: CTA label = "Watch Now", attribution type = "stream_open (inferred)".
3. Create a "Streaming Service Fast Track" onboarding variant in the advertiser portal that pre-selects:
   - Moment types: close_game, overtime, game_resolved, mlb_close_game, mlb_walk_off
   - Demand type: streaming
   - CTA label: "Watch Now"
   - Suggested starting bid: $0.25 (above the total_alert floor; streaming services should bid below sportsbooks to reflect lower urgency)
4. Update the brand_safety_status flow: streaming campaigns now start as "pending" (requiring admin approval per migration 080). Add clear messaging in the campaign creation UI explaining this.
5. Create a streaming advertiser pitch document at docs/partnerships/streaming-advertiser-package.md covering:
   - Why NORMA's alert moments are high-value streaming subscriber acquisition inventory
   - Available moment types for streaming (live game, close game, overtime, final)
   - Audience: cord-cutters already connected to streaming services, highly engaged sports viewers
   - Attribution: stream_open (inferred; verified available via callback integration)
   - No geo-restriction for streaming campaigns (unlike sportsbook)
   - Self-serve portal onboarding steps
```

---

**TASK ST-02: Build streaming affiliate tracking infrastructure**

When a NORMA user taps "Watch on ESPN+" and signs up for ESPN+, that is a subscriber acquisition event worth $5–$15 in affiliate commission. NORMA's `deep_link_events` table already logs tap events, but there is no affiliate parameter injection or commission tracking. Adding this is a direct, near-zero-marginal-cost revenue channel that also strengthens the streaming partnership pitch.

**[CLI]**:

```
Build affiliate commission tracking for streaming deep links. Specifically:

1. Read lib/deep-links.ts to understand the current 3-step deep link fallback chain and how provider_registry is used.
2. Add an affiliate_tag column to provider_registry (new migration): TEXT NULL. This stores the affiliate parameter for providers that have affiliate programs (e.g., ESPN+ affiliate tag, Amazon Associates tag for Prime Video).
3. Update the deep link chain: when a provider has an affiliate_tag, append it to the universal_link as a query parameter (e.g., ?ref=norma or ?tag=norma-20 for Amazon). Do not modify the ios_scheme — affiliate tracking only applies to web fallback.
4. Add a streaming_affiliate_events table (new migration) to record: user_id, provider_key, event_type (tap | subscription_confirmed), affiliate_tag, session_id, created_at. This is separate from deep_link_events because it carries revenue-tracking intent.
5. Seed affiliate_tag values for the providers that have known affiliate programs:
   - espn_plus: ESPN/Disney affiliate program (Dave to supply actual tag after enrollment)
   - prime_video: Amazon Associates (Dave to supply actual tag after enrollment)
   - Placeholder NULLs for YouTube TV, Peacock (no public affiliate program)
6. Create a /admin/revenue/affiliates page showing: clicks by provider, estimated commissions (clicks × average commission rate), and a table of streaming_affiliate_events.
7. Document the affiliate setup at docs/partnerships/streaming-affiliate-setup.md with instructions for enrolling in ESPN+ and Amazon Associates affiliate programs.
```

---

**TASK ST-03: Build a streaming provider partnership pitch and outreach template**

**[CLI]**:

```
Create streaming partner outreach materials. Specifically:

1. Create docs/partnerships/streaming-partner-outreach.md containing:
   a. A 200-word cold outreach email template targeting a streaming service's partnerships or affiliate team. Subject line variants (3 options). Personalization instructions for ESPN+ vs. YouTube TV vs. Peacock.
   b. A one-page partner brief (suitable for a PDF export) covering: NORMA's audience (active sports fans with streaming subscriptions already connected), deep-link integration (NORMA already routes users to streaming apps with a single tap), attribution capability, and the ask (affiliate commission enrollment + optional advertising partnership).
   c. A list of the correct contact roles to target at each streaming service (partnerships, affiliate, app marketing, sports content BD).
2. Create a seed SQL file at supabase/seeds/streaming_providers_affiliate_update.sql that adds affiliate_tag placeholders and documents where Dave should insert the actual tags after enrollment.
```

---

## Tier 3: Prediction Markets

### Why Prediction Markets Are a Tier 3 Priority

Kalshi and Polymarket are already deeply integrated into NORMA — users can connect their accounts, sync positions, and receive alerts when those positions are resolving. That integration is a distribution asset: Kalshi and Polymarket have their own engaged user bases who would benefit from NORMA's game-state alerts.

The partnership ask here is simpler than with sportsbooks or streaming services: a featured placement or co-marketing mention from Kalshi or Polymarket to their user base. "If you hold sports positions on Kalshi, Watch NORMA will alert you when those positions are resolving."

Kalshi specifically has been growing rapidly (following its landmark legal win allowing event contracts in the US). Their user base is technically sophisticated and skews toward the bettor/investor overlap — exactly the NORMA user. A Kalshi BD conversation can start from a genuine integration story: "We already support your API. Your users can connect in 2 minutes."

### Implementation Tasks

---

**TASK PM-01: Upgrade the Kalshi connection experience for co-marketing**

The Kalshi connection flow (`KalshiWizard`) currently requires users to provide an API Key ID and RSA private key — a high-friction flow that will turn away most Kalshi users who discover NORMA through a co-marketing push. Lowering this friction is a prerequisite for a Kalshi distribution partnership.

**[CLI]**:

```
Improve the Kalshi connection experience to reduce onboarding friction. Specifically:

1. Read app/(tabs)/connections/kalshi-connect.tsx and the KalshiWizard component to understand the current flow.
2. Add a "Why connect Kalshi?" screen at the start of the wizard explaining the value: "NORMA will alert you when your Kalshi positions are resolving — no need to watch the game yourself."
3. Add an in-wizard tutorial showing users exactly where to find their Kalshi API Key ID and how to generate an RSA key pair, with screenshots or clear step-by-step instructions.
4. Add a "Test Connection" button in the wizard that calls the kalshi-proxy to verify credentials before saving.
5. After successful connection, show a "What happens next" confirmation: "NORMA will check your positions every 5 minutes. We'll notify you when a position is resolving."
6. Create a co-marketing one-pager at docs/partnerships/kalshi-partner-brief.md for the Kalshi BD team: what the integration does, how many steps to connect, what alerts users receive, and the ask (a mention in Kalshi's newsletter or app to Kalshi users who also follow sports).
```

---

**TASK PM-02: Add Polymarket position alert improvements**

**[CLI]**:

```
Improve Polymarket position tracking and alerting to strengthen the Polymarket partnership narrative. Specifically:

1. Read supabase/functions/poll-markets/index.ts to understand how Polymarket positions are synced.
2. Read supabase/functions/resolve-predictions/index.ts to understand settlement logic.
3. Identify any gaps in team name extraction from Polymarket market titles (the current logic parses team names from title strings — document which patterns it handles and which it misses).
4. Add a "Polymarket Position Resolving" alert type to the alert engine: when a Polymarket position's underlying game enters the final 5 minutes and the position is at risk (wrong side by a margin ≤ 6 points), generate a resolve_risk alert.
5. Create docs/partnerships/polymarket-partner-brief.md: a co-marketing brief for the Polymarket team explaining the integration, how users connect, what alerts they receive, and the ask (a featured mention in Polymarket's community channels or social).
```

---

## Tier 4: Sports Media

### Strategic Rationale

Sports media companies (The Athletic — owned by the New York Times — Bleacher Report, Yahoo Sports, CBS Sports) have large audiences and strong SEO/content distribution. A single article or newsletter mention in The Athletic can drive thousands of app installs. These relationships are lower-friction to initiate than sportsbook or streaming BD because there is no revenue negotiation — the ask is editorial coverage or a content partnership, not a commercial deal.

The long-term play is more strategic. Sports media companies are potential acquirers. The New York Times bought The Athletic in 2022. ESPN has acquired editorial properties. A media company that sees NORMA's alert engagement data (users opening alerts at a 3x+ higher rate than generic sports push notifications) has a clear acquisition rationale: bolt NORMA's intelligence layer onto their existing audience to dramatically increase engagement and subscription value.

### Implementation Tasks

---

**TASK SM-01: Build a press kit and editorial partnership package**

**[CLI]**:

```
Create a press and editorial partnership package for NORMA. Specifically:

1. Create docs/partnerships/press-kit.md containing:
   a. Company overview (1 paragraph): what NORMA is, who it's for, the core promise, current status (live in App Store, NCAA/NBA/MLB coverage, Vickrey auction ad engine)
   b. Key stats (use actual data if available from the DB, otherwise use conservative estimates): number of alert types, sports covered, push notification delivery latency target (<90 seconds), ad auction pipeline speed (<50ms)
   c. Founder bio placeholder (Dave to fill in)
   d. Product screenshots guidance (which screens to include in press coverage)
   e. Boilerplate quote from Dave for press
   f. Contact: press@norma-app.com (or current contact)
2. Create docs/partnerships/editorial-partnership-pitch.md: a pitch template for sports media editors/journalists covering:
   - The pitch angle: "The sports app that tells you when to tune in, not just the final score"
   - Data angle: "We analyzed 10,000+ sports moments and found that users with active bets are 4x more likely to watch a game when they receive a contextual alert vs. a generic score update" (frame as hypothesis to validate with real data)
   - Story angles: personalized sports alerts, the intersection of betting and streaming, AI-powered sports intelligence
   - The ask: editorial coverage, newsletter mention, or a try-the-app invitation for their readers
3. Create a template outreach email targeting sports tech reporters at: The Athletic, ESPN, Bleacher Report, Yahoo Sports, The Ringer, Action Network (sports betting focused — high relevance), VSiN.
```

---

**TASK SM-02: Build the social content pipeline for partner-amplifiable moments**

NORMA already has an automated social content pipeline publishing to X/Twitter (the CMO agent). Creating content that partners can re-share (e.g., "NORMA called this comeback 4 minutes before it happened") is a distribution lever that costs nothing but planning.

**[CLI]**:

```
Enhance NORMA's social content pipeline to create partner-amplifiable content. Specifically:

1. Read supabase/functions/cmo-generate/index.ts and generate-social-content/index.ts to understand the current content generation pipeline.
2. Add a new content template type: "alert_called_it" — triggered when a game ends in a way that validates a prior NORMA alert. Example: NORMA sent a "spread is live" alert at 4:12 remaining, and the favored team won by covering the spread. Post: "NORMA called it. [Team] covered the spread. We sent the alert with 4:12 left."
3. Add a "partner_mention" flag to social posts: when a post involves a game broadcast on ESPN+, include an @ESPN or @ESPNPlus mention; when it involves a DraftKings spread alert, include @DraftKings. This increases the chance of partner reshares.
4. Add a weekly "NORMA in numbers" post template: X alerts sent, Y games monitored, Z moment types fired this week. These aggregate stats build credibility without revealing user-level data.
5. Update the CMO content calendar in the advertiser portal's /cmo page to show a "Partner Amplifiable" tag on posts that mention partners, so Dave can prioritize promoting those posts.
```

---

## Tier 5: Fantasy Sports

### Strategic Rationale

Fantasy sports players (DraftKings DFS, Yahoo Fantasy, Underdog Fantasy, Sleeper) are highly engaged sports fans who follow specific players with financial stakes — essentially the same profile as NORMA's target user. Many fantasy players don't actively place spread bets and may not have connected sportsbook accounts, but they absolutely want to know when their player is having a big game or is in foul trouble.

NORMA's v2 alert engine already supports player-level follows (`entity_type = 'player'` in the follows table). The gap is connecting NORMA's player-follow alerts to a fantasy platform's roster data, so NORMA can alert a user when *their rostered player* is having a breakout performance.

A formal API partnership with Sleeper or Yahoo Fantasy (where Sleeper exposes rosters via API) would allow NORMA to import fantasy rosters directly and use them as follow signals. This creates a new alert trigger category that neither NORMA nor the fantasy platform currently offers, and it provides a distribution channel from the fantasy app to NORMA.

### Implementation Tasks

---

**TASK FF-01: Fantasy roster import via manual entry (prerequisite for API partnerships)**

Before approaching fantasy platform BD teams, NORMA should offer a manual roster import flow that demonstrates the product concept. Users can paste their fantasy roster (player names, team) and NORMA converts them to player follows. This requires no partnership and validates demand before investing in API integration.

**[CLI]**:

```
Build a fantasy roster import feature for NORMA. Specifically:

1. Read app/(tabs)/connections/ to understand the existing connection management UI.
2. Add a "Fantasy Sports" section to the connections tab (after streaming and sportsbooks).
3. Create a "Import Fantasy Roster" sheet (similar to AddWagerSheet) that:
   a. Asks the user which fantasy platform (DraftKings DFS, Yahoo Fantasy, Sleeper, ESPN Fantasy, Underdog, other)
   b. Allows the user to type or paste player names (one per line) with optional team names
   c. On submit, calls the follows API to create entity_type = 'player' follows for each player
   d. Shows a confirmation: "NORMA will now alert you when these players are having key moments"
4. Add a "Fantasy" badge to player follow items in the follows list so users can distinguish fantasy-imported follows from manually added ones.
5. Write a unit test verifying that pasting 5 player names creates 5 correct follows with entity_type = 'player'.
6. Create docs/partnerships/fantasy-partner-brief.md: a pitch for Sleeper, Yahoo Fantasy, or Underdog BD teams explaining the integration concept, the user benefit, and the ask (API access to rosters + co-marketing mention to their user base).
```

---

## Tier 6: Tech Platform Partners

### Apple — The Most Important Conversation NORMA Isn't Having Yet

Apple has three properties that intersect directly with NORMA: **Apple Sports** (their live scores app), **Apple TV+** (streaming sports — MLS Season Pass, MLB Friday Night Baseball), and **Apple's App Store Editorial team** (which features compelling sports apps during major events like March Madness or the NBA Playoffs).

An App Store feature during March Madness alone could drive 10,000+ downloads in a week. Apple does not accept paid placements for features — they are editorial — but they do respond to developer outreach, especially for apps that use Apple technologies well (Apple Sign-In, which NORMA already supports, is a major factor).

Apple TV+ is also a natural streaming partner: NORMA should route "Watch on Apple TV+" deep links for MLS and MLB Friday Night games, and Apple TV+ should be prominently featured in the provider registry. If Apple TV+ had an affiliate or partner program, the streaming affiliate framework from Task ST-02 would apply directly.

### Anthropic — The Strategic Narrative Partner

NORMA uses Claude in multiple production pipelines (bet slip OCR via Claude Vision, email wager parsing, social content generation with the CMO agent). This is a genuine, production use case of Anthropic's technology — the kind of story Anthropic's developer relations and marketing teams actively seek to amplify.

A case study placement on Anthropic's website or in their developer newsletter drives credibility with technical audiences and potential acquirers who assess NORMA's AI capabilities. It also creates a relationship with Anthropic that could support future product development (e.g., access to new Claude models earlier, collaboration on the MCP server integration).

### Implementation Tasks

---

**TASK TP-01: Prepare an Apple App Store feature submission**

**[CLI]**:

```
Prepare NORMA for an Apple App Store editorial feature submission. Specifically:

1. Research what Apple's App Store editorial team looks for in sports app features. Create a checklist at docs/partnerships/apple-app-store-feature-checklist.md covering:
   - App Store listing quality (screenshots, description, keywords)
   - Use of Apple technologies (Apple Sign-In — already implemented, Push Notifications, Deep Links)
   - Timeliness (when to submit relative to March Madness, NBA Playoffs, MLB season)
   - The Apple developer relations contact process
2. Audit NORMA's current App Store listing (based on app.json and any available metadata) for improvement opportunities: screenshot descriptions, keyword optimization for "sports alerts," "bet tracker," "game notifications," subtitle.
3. Create a draft App Store feature pitch at docs/partnerships/apple-editorial-pitch.md: 2 paragraphs explaining what NORMA does, why it's timely, and which Apple technologies it uses. Target audience: an Apple App Store editorial reviewer.
4. Create a developer relations outreach email template targeting Apple's sports app editorial team.
```

---

**TASK TP-02: Build an Anthropic case study**

**[CLI]**:

```
Create an Anthropic case study for NORMA's Claude integrations. Specifically:

1. Review how Claude is used in NORMA's production codebase:
   a. parse-bet-slip (Claude Vision for bet slip OCR)
   b. ingest-email-wagers (Claude for email parsing)
   c. cmo-generate (Claude for social content generation)
   d. generate-social-content (Claude for multi-platform content)
2. Write a case study at docs/partnerships/anthropic-case-study.md covering:
   - Title: "How Watch NORMA Uses Claude to Power Intelligent Sports Alerts"
   - Company intro (2 sentences)
   - The challenge: sports fans need to track bets from multiple sportsbooks, but confirmation emails are unstructured and bet slips are photos
   - Solution: Claude Vision for bet slip OCR, Claude for email parsing — turning unstructured bet data into structured wager records in NORMA's DB
   - Solution: Claude for social content generation via the CMO agent
   - Results: quantify if possible (e.g., "X bet slips parsed, Y emails processed")
   - Technical highlight: the MCP server that exposes NORMA's ad inventory to AI agents
   - Quote placeholder from Dave
3. Create a template outreach email for Anthropic's developer relations / partnerships team proposing the case study for inclusion on anthropic.com/customers or the Claude.ai blog.
```

---

## The Advertiser Revenue Playbook

### How to Convert Partners into Advertisers

Every user acquisition partnership (sportsbooks, streaming, prediction markets) creates a natural next conversation: "You're already sending your users to NORMA — now advertise to them here, at the moment they're most engaged."

The conversion sequence for each partner category:

**Sportsbooks:** Start with the co-marketing landing page (Task SB-06, no revenue). Once the partner sees NORMA downloads from the referral code, initiate the advertising conversation: "We're seeing [X] of your users downloading NORMA. They're now tracking their [DraftKings] bets here. Run a campaign to re-engage them when those bets are live." Move to a direct deal structure as spend scales.

**Streaming:** Start with affiliate enrollment (Task ST-02, passive income). Once affiliate revenue is established, pitch the advertising product: "We're already sending your app [Y] taps per month via organic deep links. A sponsored campaign would give you priority placement across all our users, not just yours."

**Prediction Markets:** Kalshi co-marketing drives downloads. If Kalshi's user base responds, Kalshi has an incentive to become an advertiser — especially for `prediction_resolved` moment types (floor CPM $0.60 — NORMA's highest-value moment).

### Campaign Approval and Compliance

The admin campaign approval workflow (migration 065) is already in place — new campaigns land as `pending` and require admin approval before entering the auction. For enterprise partners (sportsbooks, streaming services), Dave should establish a 24-hour approval SLA to avoid friction in the onboarding experience. The admin UI at `/admin/campaigns` shows the pending queue.

For sportsbook campaigns, the geo-compliance system automatically handles state-by-state restrictions — advertisers do not need to manage this themselves. This should be explicitly called out in every sportsbook pitch: "We handle geo-compliance automatically. You don't need a separate audience segment for each state."

---

## Technical Infrastructure for Acquisition Readiness

Beyond individual partnership tasks, several technical investments make NORMA a more credible and defensible acquisition target. These are not partnership-specific but are prerequisite for the acquisition thesis.

---

**TASK IR-01: Build automated health monitoring and an uptime status page**

Acquirers conduct technical due diligence. A system that pages on degradation and has a public uptime page signals operational maturity.

**[CLI]**:

```
Set up automated health monitoring for NORMA. Specifically:

1. Read supabase/functions/health-check/index.ts to understand what the health-check endpoint returns.
2. Create a configuration file at docs/operations/uptime-monitoring-setup.md with step-by-step instructions for connecting the health-check endpoint to Better Uptime (or UptimeRobot as a free alternative):
   - The health-check URL to monitor
   - Recommended check interval (every 1 minute)
   - Alert conditions (response > 2s, non-200, or any degraded field = true)
   - Notification channels (email to Dave, optional Slack)
3. Create a simple status page component at web/app/status/page.tsx that:
   - Calls the health-check endpoint server-side
   - Shows a green/yellow/red status for: score polling, PBP polling, alert engine, push delivery, ad auction, database
   - Shows "Last checked: X minutes ago"
   - Is publicly accessible (no auth required) at getnorma.app/status
4. Add the status page URL to the press kit (docs/partnerships/press-kit.md) and the advertiser portal footer.
```

---

**TASK IR-02: Build an advertiser-facing reporting API and data export**

Enterprise advertisers (sportsbooks, streaming services) will require data portability — the ability to pull their campaign performance data into their own analytics tools. NORMA's `reporting-api` Edge Function exists but needs a documented, versioned API that an advertiser's data team can integrate.

**[CLI]**:

```
Build a documented advertiser reporting data export. Specifically:

1. Read supabase/functions/reporting-api/index.ts to understand the current reporting API.
2. Add a CSV export endpoint: GET /reporting-api/export?campaign_id=X&start=YYYY-MM-DD&end=YYYY-MM-DD&format=csv. Returns: date, impressions, clicks, CTR, spend, attributed_conversions, CPA. Headers should be human-readable for import into Excel/Google Sheets.
3. Add a webhook notification: when a campaign's daily budget is 80% spent, fire a webhook to the campaign's registered webhook_url (add webhook_url to the campaigns table via a new migration). Payload: { campaign_id, remaining_budget_cents, daily_budget_cents, date }.
4. Update the OpenAPI spec at web/public/api/ads/openapi.json to document the new export endpoint and webhook.
5. Create an advertiser reporting guide at docs/partner-api/advertiser-reporting-guide.md covering: how to pull data via the API, the CSV export format, webhook setup, and how to interpret the attribution metrics (inferred vs. verified, attribution window).
```

---

**TASK IR-03: Build a partner dashboard in the admin portal**

As partner relationships scale, Dave needs a single view of all active partnerships, their referral performance, and their advertising activity.

**[CLI]**:

```
Build a partner management dashboard in NORMA's admin portal. Specifically:

1. Create a new admin section at web/app/admin/partners/page.tsx with:
   a. A table of all partners (pulled from a new partners table — see step 2) showing: partner name, tier (sportsbook/streaming/prediction-market/media), referral code, downloads attributed, active campaigns, total ad spend to date.
   b. A "Create Partner" form that creates a partner record, generates a referral code, and creates the co-marketing landing page URL.
   c. A "Partnership Status" column: Active, Negotiating, Prospect, Churned.
2. Create a partners table migration: id, name, tier, referral_code_id (FK to referral_codes), partnership_status, notes, bd_contact_name, bd_contact_email, created_at, updated_at.
3. Link the partners table to referral_codes so the /admin/partners view shows referral attribution data alongside advertising data from the campaigns table.
4. Add a "Partner Notes" field where Dave can log BD conversation history (e.g., "Spoke to FanDuel media team 2026-06-20 — following up in 2 weeks").
```

---

## 30 / 60 / 90 Day Execution Timeline

### Days 1–30: Foundation and First Revenue

**Goal:** First paying enterprise advertiser. MCP server live. Referral infrastructure ready for partner distribution.

| Priority | Task | Target | Status |
|----------|------|--------|--------|
| 1 | Deploy MCP server to Railway + configure DNS (SB-02) | Week 1 | ✅ Done |
| 2 | Enable Programmatic Intent API (SB-01) | Week 1 | ✅ Done |
| 3 | Activate streaming demand type in advertiser portal (ST-01) | Week 1 | ✅ Done |
| 4 | Build sportsbook advertiser onboarding package (SB-04) | Week 1–2 | ✅ Done |
| 5 | Build co-marketing landing pages for sportsbook referrals (SB-06) | Week 2 | ✅ Done |
| 6 | First outreach to FanDuel media/partnerships team | Week 2 | — Awaiting |
| 7 | First outreach to Kalshi BD | Week 2 | — Awaiting |
| 8 | Submit press kit to Action Network, VSiN, The Athletic | Week 3 | — Awaiting |
| 9 | Apple App Store editorial submission (TP-01) | Week 3 | ✅ Done (prep complete) |
| 10 | Build direct deal proposal template (SB-05) | Week 3–4 | ✅ Done |

**Revenue target by Day 30:** First direct deal or self-serve sportsbook campaign live. $1K–$5K in advertiser spend.

### Days 31–60: Pipeline and Scale

**Goal:** Multiple active advertisers. Streaming affiliate commissions flowing. Fantasy import live.

| Priority | Task | Target | Status |
|----------|------|--------|--------|
| 1 | Streaming affiliate tracking (ST-02) | Week 5 | ✅ Done |
| 2 | DraftKings ConversionIngestor adapter (SB-03) | Week 5–6 | ✅ Done |
| 3 | Fantasy roster import (FF-01) | Week 6 | ✅ Done |
| 4 | Kalshi connection experience upgrade (PM-01) | Week 6 | ✅ Done |
| 5 | First outreach to DraftKings media team | Week 5 | — Awaiting |
| 6 | First outreach to ESPN+ partnerships | Week 6 | — Awaiting |
| 7 | Automated health monitoring + status page (IR-01) | Week 7 | ✅ Done |
| 8 | Anthropic case study submission (TP-02) | Week 7–8 | ✅ Done (prep complete) |
| 9 | Partner management dashboard (IR-03) | Week 8 | ✅ Done |
| 10 | Social content pipeline: partner-amplifiable content (SM-02) | Week 7–8 | ✅ Done |

**Revenue target by Day 60:** 3–5 active advertisers. $5K–$10K in monthly run-rate spend. Streaming affiliate revenue beginning.

### Days 61–90: Monetization and Acquisition Narrative

**Goal:** Enterprise advertiser deals. Verified conversion data from at least one sportsbook. Acquisition pitch materials ready.

| Priority | Task | Target | Status |
|----------|------|--------|--------|
| 1 | Advertiser reporting API + data export (IR-02) | Week 9 | ✅ Done |
| 2 | First direct deal signed with a sportsbook | Week 9–10 | — Awaiting |
| 3 | S2S callback live with first sportsbook partner | Week 10–12 | — Awaiting |
| 4 | Press coverage in at least one major sports publication | Week 10–12 | — Awaiting |
| 5 | Polymarket position alert improvements (PM-02) | Week 10 | ✅ Done |
| 6 | App Store feature (if approved by Apple) | Week 12 | — Awaiting Apple |

**Revenue target by Day 90:** $10K+ MRR from advertising. At least one verified conversion partner. Partnership pipeline active with 5+ prospects.

---

## Acquisition Positioning: How These Partnerships Build the Moat

Every partnership signed in the next 12–24 months compounds the acquisition thesis in one of three ways:

**Revenue Moat:** Direct deal and self-serve advertiser revenue from sportsbooks and streaming services demonstrates that NORMA's ad inventory is real, paid for, and scaling. An acquirer evaluating NORMA at $500M–$1B is buying a revenue stream, not just a user base. Recurring advertiser contracts (especially direct deals with named sportsbooks) are the most defensible form of that revenue.

**Data Moat:** Server-to-server conversion callbacks from sportsbook partners (Task SB-03) transform NORMA's attribution from inferred to verified. This data — knowing exactly which users who received a NORMA alert went on to place a bet — is uniquely valuable. No competitor without the same partnerships can replicate it. For a sportsbook acquirer, this data is worth potentially more than the app itself: it means NORMA knows which alert moments drive betting action, which can be used to optimize the entire sports product experience.

**Distribution Moat:** A co-marketing relationship with FanDuel or DraftKings that drives 100K+ downloads is not easily replicated. Each download creates a new user who sees the connection between their sportsbook account and NORMA's alerts. When FanDuel (or DraftKings) eventually wants to acquire NORMA's alert intelligence, they also acquire the relationships that made the distribution possible — and prevent a competitor from doing so.

**Technical Moat:** The MCP server (`mcp.getnorma.app`), the Programmatic Intent API, the OpenAPI spec, the ConversionIngestor interface — these are enterprise-grade infrastructure artifacts. An acquirer's technical due diligence team will see a platform built to be connected to, not a consumer app. That framing supports a higher multiple.

The combination — recurring revenue, verified conversion data, distribution partnerships, and enterprise API infrastructure — is what separates a $50M consumer app acquisition from a $1B+ platform acquisition. Every task in this plan moves NORMA from the former to the latter.

---

## Appendix: BD Contact Research Prompts

The following CLI prompts can be used to research and prepare outreach for each partner.

**[CLI] FanDuel Partnership Research:**
```
Research FanDuel's current marketing and partnership structure. Specifically:
1. Search the web for FanDuel's current media buying and affiliate partner program information.
2. Find the appropriate contact role for a sports app partnership pitch (likely: VP of Brand Marketing, Director of Affiliate Marketing, or Head of Sports Partnerships).
3. Find FanDuel's current ad tech and DSP integrations (to understand how to frame NORMA's Programmatic Intent API).
4. Create a personalized outreach email for FanDuel at docs/partnerships/outreach/fanduel-outreach.md.
```

**[CLI] DraftKings Partnership Research:**
```
Research DraftKings' current marketing and partnership structure. Specifically:
1. Search the web for DraftKings' media and marketing partnership contacts and programs.
2. DraftKings owns VSiN (sports betting media). Research if VSiN has done co-marketing with sports apps.
3. Find DraftKings' current affiliate program terms and commission rates for mobile app referrals.
4. Create a personalized outreach email for DraftKings at docs/partnerships/outreach/draftkings-outreach.md.
```

**[CLI] ESPN+ Partnership Research:**
```
Research ESPN+ / Disney's affiliate and partnership programs for sports apps. Specifically:
1. Search for ESPN+ affiliate program or Disney affiliate program terms.
2. Find the correct BD contact for ESPN+ app partnerships (likely under Disney's Streaming partnerships team).
3. Research ESPN's recent sports app partnerships or integrations (to understand what kind of deals they've done).
4. Create a personalized outreach email at docs/partnerships/outreach/espnplus-outreach.md.
```

**[CLI] Kalshi Partnership Research:**
```
Research Kalshi's current partnership and co-marketing programs. Specifically:
1. Search the web for Kalshi's developer API and any existing app integrations or co-marketing partners.
2. Find the appropriate BD contact at Kalshi for a third-party app integration partnership.
3. Research how Kalshi has marketed to their user base (newsletter, in-app, social) to understand the right channel for a co-marketing ask.
4. Create a personalized outreach email at docs/partnerships/outreach/kalshi-outreach.md.
```

---

*This document is maintained in the Watch-NORMA repository at `docs/NORMA-Partnership-Plan.md`. Update the implementation task status and timeline as partnerships are initiated and closed. BD contact notes should be logged in the partner management dashboard (Task IR-03) once built.*
