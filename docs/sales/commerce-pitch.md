# Watch NORMA — Commerce Advertiser One-Pager
**Category: Commerce (Merchandise, Ticketing, Apparel, Fan Products)**
**CTA type: Shop Now**

---

## The Moment

The 30 seconds after a decisive win is one of the highest-purchase-intent moments in sports retail. Fans who just watched their team win — especially in a close game or after a comeback — are emotionally primed and ready to act.

Watch NORMA's `post_outcome` intent moment reaches those fans with a push notification at exactly that point: the game just ended, the winning team is known, and the fan's phone is already in their hand from following the game live.

There is no better time to show a fan a team jersey, a ticket to the next game, or a championship memento.

---

## The post_outcome Moment

`post_outcome` is an intent moment recorded once per closed game with a decisive winner. It fires after all live alert delivery is complete — it is never used to delay or alter game alerts.

**Qualifier flags** available in auction targeting:

| Flag | Definition | Commerce Relevance |
|------|------------|--------------------|
| `is_upset` | Margin ≤ 5 at final whistle | High: upsets drive emotional impulse purchasing |
| `is_blowout` | Margin > 20 at final whistle | Moderate: winning fans in a dominant game |
| `is_overtime` | Game went to overtime | High: drama = heightened emotional state |

**Season coverage:** post_outcome fires for every sport Watch NORMA supports — NCAA basketball (Oct–Apr), NBA (Oct–Jun), MLB (Apr–Oct), NFL/NCAAF (Sept–Jan, starting Sept 2026).

---

## Audience

Users reached by post_outcome commerce ads have just:
- Received a live game alert for a game they follow, have a wager on, or have a prediction-market position in
- Watched the game close in real time
- Experienced an outcome they care about personally (their team won, their wager resolved, their prediction settled)

This is not a sports fan who browsed ESPN. This is a fan who was emotionally invested in this specific game.

---

## Floor Pricing

`post_outcome` uses the platform's default floor for unlisted moment types: **$0.10 CPM** (subject to revision upward before first live deals — see `docs/sales/streaming-commerce-readiness.md`). Dynamic premium multipliers apply:

| Condition | Multiplier |
|-----------|------------|
| NCAA Tournament game | 1.5x |
| Weekend (Saturday/Sunday) | 1.2x |
| Overtime game | (is_overtime flag; multiplier TBD) |

Commerce campaigns compete in the same second-price Vickrey auction as sportsbook and streaming. If you are the only bidder for `post_outcome`, you pay the floor price. Multiple bidders increase clearing prices.

---

## Attribution

| Signal | Type | Description |
|--------|------|-------------|
| `cta_tap` | App-verified | User tapped "Shop Now" inside Watch NORMA |
| `app_return` | App-verified | User returned to Watch NORMA within 30 minutes |
| `commerce_open` | Inferred | External commerce site opened within window — purchase **not confirmed** |

Upgrading `commerce_open` to verified requires a server-to-server purchase callback from the commerce platform. Until that partnership exists, the UI clearly labels commerce_open as inferred. We do not claim verified purchase conversions.

**Attribution window:** 30 minutes (configurable per campaign).

---

## No Geo-Restriction

Commerce campaigns are not subject to state-level jurisdiction restrictions. Your ad is eligible to display to Watch NORMA users in all US states.

---

## Category Fit

Commerce is the right demand type for:
- Licensed team merchandise (jerseys, hats, gear)
- Ticket sales (secondary market, next-game tickets)
- Championship and playoff merchandise
- Fan experience products (sports memorabilia, signed items)
- Sports apparel and lifestyle brands tied to specific teams or leagues

Commerce is NOT the right type for:
- Sportsbooks or gambling products (use `demand_type = 'sportsbook'`)
- Streaming subscriptions (use `demand_type = 'streaming'`)
- Sweepstakes or contest entries (contact `ads@getnorma.app` for direct-deal terms)

---

## Getting Started

1. Create an account at `getnorma.app/advertiser`
2. Select "Commerce" as your demand type
3. Set your creative text, CTA URL (Shop Now), and bid per impression
4. Campaign undergoes brand review (typically within 24 hours)
5. Once approved, your ads enter the live `post_outcome` auction

**Minimum campaign budget:** $50

Contact: `ads@getnorma.app`
