# Watch NORMA — Streaming Advertiser One-Pager
**Category: Streaming Services**
**CTA type: Watch Now**

---

## The Moment

A streaming service's highest-value acquisition moment is when a fan knows a game they care about is happening *right now* and hasn't decided where to watch it yet.

Watch NORMA reaches that fan at exactly that moment — with a push notification explaining why this specific game matters to them, and a "Watch on [Provider]" deep link already targeted to their connected services.

The streaming ad unit is not pre-roll or banner inventory. It is a sponsored "Watch Now" CTA attached to a push alert at peak user engagement: the moment a close game starts, overtime begins, or a user's followed team hits a lead change in the final five minutes.

---

## Moment Types

| Moment Type | Trigger | Season |
|-------------|---------|--------|
| `close_game` | Margin ≤ 6 in the second half (NCAA basketball); margin ≤ 8 in Q3+ (NFL/NCAAF) | Year-round |
| `overtime` | Overtime period begins (basketball) | Oct–Apr |
| `football_close_game` | Q4 one-score game, two-minute warning, lead change in final 5 min | Sept–Jan |
| `football_overtime` | NFL/NCAAF overtime begins | Sept–Jan |
| `nba_close_game` | NBA late-quarter margin ≤ 6 with under 3 min remaining | Oct–Jun |

These are the moments when a fan who isn't watching a game decides to find it. That is your window.

---

## Audience

Users who receive streaming-relevant alerts are:
- **Connected multi-service subscribers** — 73% of Watch NORMA users have connected at least one streaming provider (YouTube TV, ESPN+, Peacock, Paramount+, Prime Video, or similar). They are active streaming customers, not trial users.
- **Sports bettors** — users with active wagers receive alerts when their spread is live. These users are highly motivated to watch — and to subscribe to whatever service carries the game.
- **Multi-screen secondscreen users** — users who follow teams or players across multiple simultaneous games. They switch actively between services based on real-time game state.

No PII is shared with advertisers. Targeting is by moment type, not by user identity.

---

## Floor Pricing

| Moment Type | Default Floor | Notes |
|-------------|---------------|-------|
| `close_game` | $0.35 | Basketball and football combined |
| `overtime` | $0.40 | Basketball |
| `football_overtime` | $0.50 (NFL) / $0.45 (NCAAF) | Football-specific, active Sept–Jan |
| `football_close_game` | $0.40 (NFL) / $0.35 (NCAAF) | Two-minute and Q4 moments |

Floors are second-price (Vickrey auction). If you are the only bidder for a moment type, you pay the floor. Multiple bidders increase clearing prices.

These are base floors. Dynamic premium multipliers apply: NCAA Tournament games (1.5x), weekend games (1.2x), late-game under 2 min remaining with one-score margin (1.5x).

---

## Attribution

| Signal | Type | Description |
|--------|------|-------------|
| `cta_tap` | App-verified | User tapped "Watch Now" inside Watch NORMA |
| `app_return` | App-verified | User returned to Watch NORMA within 30 minutes |
| `stream_open` | Inferred | External stream app opened within attribution window — subscription **not confirmed** |

Upgrading `stream_open` to verified requires a server-to-server callback from the streaming provider. Until that partnership exists, the UI clearly labels stream_open as inferred. We do not claim verified streaming conversions.

---

## No Geo-Restriction

Streaming campaigns are not subject to state-level jurisdiction restrictions. Your ad is eligible to display to Watch NORMA users in all US states. (Sportsbook campaigns, by contrast, are restricted to legal gambling states — streaming campaigns are unrestricted.)

---

## Getting Started

1. Create an account at `getnorma.app/advertiser`
2. Select "Streaming" as your demand type
3. Set your creative text, CTA URL (Watch Now), and bid per impression
4. Campaign undergoes brand review (typically within 24 hours)
5. Once approved, your ads enter the live auction immediately

**Minimum campaign budget:** $50

Contact: `ads@getnorma.app`
