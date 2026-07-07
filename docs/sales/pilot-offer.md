# NORMA Standard Pilot Package

For all first-time advertisers. Designed to reduce friction and produce enough data for a renewal decision.

---

## Pilot Tiers

### Starter Pilot — $100

- $100 budget, no credit match
- Any single moment type
- No geo-restriction (unless sportsbook category — see note)
- Standard direct-deal priority tier (priority_tier = 1)
- Self-serve setup at getnorma.app/advertise
- Campaign report emailed weekly (manual until automated reports launch)
- No minimum impressions guarantee

**Best for**: Testing a new channel. Expect 200–500 impressions depending on moment type and active game schedule.

---

### Credit-Matched Pilot — $250 spend + $250 match = $500 effective

- Advertiser pays $250; NORMA matches $250 in bonus impressions
- Two moment types (e.g., `close_game` + `bet_resolved`)
- Priority tier 2 (elevated in auction queue above standard direct-deal)
- Guaranteed minimum: 500 impressions (make-good if not reached within flight)
- Weekly automated performance report (once Prompt 7 automation ships)
- 30-minute onboarding call with founder to configure targeting and review creative
- One creative revision included at no charge
- Attribution: inferred from app engagement; postback webhook setup included if requested

**Best for**: Advertisers who want enough volume to make a renewal decision with data. Recommended for streaming and sportsbook categories.

**Eligibility**: New advertisers only. One credit-match per company. Flight window: 30 days from campaign activation.

---

## What "Guaranteed Minimum" Means

NORMA's supply is game-schedule dependent. If live game volume falls short of the projected minimum during the pilot flight, NORMA will extend the campaign flight at no additional charge until the impression minimum is reached. This guarantee is capped at 90 days from activation. If minimum is still not reached at 90 days, remaining budget is refunded.

---

## Onboarding Call Agenda (30 min)

1. Campaign goal and KPI alignment (5 min)
2. Moment type selection and targeting rules (10 min)
3. Creative review — NORMA brand safety standards, sponsored label requirements, CTA copy (10 min)
4. Postback webhook setup if conversion tracking is needed (5 min)

---

## What Happens After the Pilot

- Advertiser receives a pilot wrap report: impressions, CTR, attributed conversions (labeled inferred vs verified), CPM, best-performing moments
- Renewal offer: standard self-serve at prevailing floor CPM, or negotiated direct deal with higher priority tier
- Insider advertisers who renew at $1,000+ get a dedicated Slack channel with the NORMA team

---

## Sportsbook / DFS Note

Sportsbook and DFS campaigns are geo-filtered automatically by the `sportsbook_restrictions` table. Pilot impressions are only served in jurisdictions where the operator is licensed. Impression count on the wrap report reflects served impressions only — unserved impressions (restricted states) are not billed and do not count toward minimums.

---

## Self-Serve vs Founder-Assisted

| Path | Setup | Priority tier | Minimum | Support |
|------|-------|---------------|---------|---------|
| Self-serve | getnorma.app/advertise | Standard (0) | $100 | Email |
| Starter pilot | Founder-assisted | 1 | $100 | Email + async |
| Credit-matched pilot | Founder-assisted | 2 | $250 | Call + async |
| Direct deal | Contract | 3+ | Negotiated | Dedicated |

---

## Standard Terms

- Payment: credit card via Stripe (Stripe Connect). No net-30 for pilots.
- Creative approval: 24–48 hours. AI pre-screen (pass/flag) surfaced to admin; human approval required before any creative enters the live auction.
- Brand safety: All sponsored text must include "Sponsored" label (auto-enforced by NORMA). No misleading claims, no guaranteed-win language, no content targeting users under 21 for sportsbook category.
- Cancellation: Unused budget refunded within 5 business days of cancellation request. Minimum spend is $0 (cancel any time).
