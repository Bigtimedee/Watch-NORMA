# 10 — Non-Negotiable Rules for Future Work

These rules apply to every developer, agent, or AI tool working on Watch-NORMA. They are not suggestions. They are hard constraints. Violating any of these rules can break the product, harm users, expose sensitive data, or undermine revenue.

---

## The Rules

**1. Do not change Watch-NORMA without reading this documentation folder first.**
Read `/docs/watch-norma-context/README.md` and any files relevant to your work. This documentation is the canonical project context.

**2. Do not break the "Watch on YouTube TV" / streaming-provider routing flow.**
The deep-link fallback chain (native scheme → universal link → App Store) is a critical user path. Changing provider URLs, schemes, or routing logic without testing is unacceptable. Multiple outages have been caused by YouTube TV link regressions (see migrations 052–054).

**3. Do not route known subscribers to generic sign-up pages when a watch/login route exists.**
If the user is a YouTube TV subscriber and taps "Watch on YouTube TV," the app must open YouTube TV's watch or login URL — never a marketing page, never a generic sign-up flow. This applies to all streaming providers. The `universal_link` field in `provider_registry` must point to a functional watch/login URL.

**4. Do not send generic alerts when a personalized, explainable alert is required.**
Every alert must include a structured "Why Now" explanation with at least a headline and one bullet. The user must understand why they are being notified. Alerts without explanations are a product regression.

**5. Do not send duplicate alerts for the same user/event without deduplication logic.**
The hash-based dedup system, per-user caps, and cooldown windows exist to prevent notification spam. Do not bypass or weaken these protections.

**6. Do not send stale alerts after the relevant moment has passed.**
If a game has ended, no further live alerts should be generated. The "game_resolved" alert is the final notification. The orchestrator must deactivate watchers for closed games.

**7. Do not fabricate sportsbook, prediction-market, or streaming-account data.**
If a sportsbook API integration does not exist, do not pretend it does. If a user's prediction position cannot be verified, do not display made-up P&L. If broadcast availability is unknown, say so — do not guess.

**8. Do not imply betting advice or guaranteed outcomes.**
The app tracks wagers and positions. It does not advise users to bet, suggest they will win, or guarantee outcomes. Alert language must be factual ("your spread is live") not advisory ("you should cash out").

**9. Do not expose API keys, OAuth tokens, or user account data.**
Never `console.log` secrets. Never include real credentials in commits. Never return Kalshi private keys, Stripe tokens, or Gmail service account credentials in API responses. RLS must enforce user-scoped data access.

**10. Do not treat planned integrations as implemented.**
The `BetIngestor` interface for DraftKings/FanDuel is a stub. Sportsbook partner APIs do not exist. Do not write code that assumes these integrations are live. Do not show UI that implies they are working.

**11. Do not add ad logic that delays or obscures the core watch action.**
The auction runs inside the alert pipeline but must never block alert delivery. Sponsor ads are additive — they appear below the alert content, never replacing it. The "Watch on [Provider]" button must always be the primary action. The "Bet Now" CTA is secondary.

**12. Do not break user notification preferences, opt-outs, or quiet hours.**
If a user sets quiet hours, push notifications must be suppressed during those times. If a user disables push notifications, no push must be sent. If a user sets max 3 alerts per game, the 4th alert must be throttled. These are user-trust mechanisms.

**13. Do not alter alert logic without adding or updating tests.**
Alert scoring, must-notify rules, throttling, and dedup are the product's core intelligence. Any change to `evaluate-alerts`, `alert-scoring.ts`, or `evaluate-alerts/logic.ts` must come with updated or new tests in the corresponding `_test.ts` files.

**14. Do not alter streaming-provider routing without testing provider-specific flows.**
Changing `deep-links.ts`, `provider_registry` data, or `WatchNowButton` logic requires testing the full fallback chain for affected providers. At minimum: verify the scheme URL, the universal link (HTTP GET returns 200 or redirect to app), and the store fallback.

**15. Do not assume broadcast availability is universal; account for regional restrictions and uncertainty.**
Broadcast data from ESPN/SportsDataIO reflects national coverage. Regional sports networks, local blackouts, and streaming exclusives may not be captured. When availability is uncertain, the UI must communicate uncertainty rather than false confidence.

**16. Do not store more sensitive user data than necessary.**
Wager amounts, Kalshi API keys, prediction-market positions, and email content are sensitive. Minimize retention. Do not add new data collection without considering privacy implications. Email content from wager parsing should be processed and discarded, not stored.

**17. Do not make major architectural changes without updating the documentation folder.**
If you add a new Edge Function, a new database table, a new integration, a new cron job, or a new screen, update the relevant documentation files in `/docs/watch-norma-context/`.

**18. Do not complete meaningful work without summarizing whether the documentation must be updated.**
At the end of every session, explicitly state whether any documentation needs updating and what changed.

---

## Additional Rules

**19. Always use ESPN's `status.type.description` field, never `status.type.name`.**
The May 2026 P0 outage (37 days, 140 orphaned games) was caused by reading the wrong ESPN field. This is a permanent rule. See `OUTAGE-REPORT-2026-05-16.md`.

**20. "Watch NORMA" is the brand name. Never propose renaming the app.**
The brand is established in the App Store and all marketing materials. Do not suggest or implement name changes.

**21. Do not use AI image generation (DALL-E, Midjourney, etc.) for social media assets.**
Social media posts use real NORMA app screenshots from Supabase Storage. AI-generated images are prohibited for brand authenticity. A test (`no-ai-image-generation.test.ts`) enforces this.

---

## Required Closing Checklist for Future Claude Code Sessions

At the end of any meaningful Watch-NORMA work, answer the following:

- [ ] Did I read `/docs/watch-norma-context/` first?
- [ ] Did I change product behavior?
- [ ] Did I change architecture?
- [ ] Did I change routes or APIs?
- [ ] Did I change environment variables?
- [ ] Did I change live sports data handling?
- [ ] Did I change alert logic?
- [ ] Did I change streaming-provider routing?
- [ ] Did I change ad or monetization logic?
- [ ] Did I change privacy/security assumptions?
- [ ] Did I update the documentation folder if needed?
- [ ] What tests did I run?
- [ ] What remains unknown?

If any answer is "yes" and the documentation was not updated, update it before closing the session.
