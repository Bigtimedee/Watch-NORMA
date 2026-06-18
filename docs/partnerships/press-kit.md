# NORMA Press Kit

**App:** Watch NORMA
**Platform:** iOS (App Store)
**Contact:** press@norma-app.com

---

## Company Overview

NORMA is a free iOS app for sports bettors and fans who need fewer alerts, not more. Available on the App Store, NORMA covers NCAA basketball, NBA, and MLB. Instead of flooding users with generic score updates, NORMA monitors live game state, sportsbook odds, and each user's active wagers in the background and fires a push notification only when something personally relevant happens: a close game in the final minutes, a spread crossing the user's line, overtime starting, or a player approaching a prop threshold. Each alert includes a structured "Why Now" explanation and a one-tap link to the right streaming app. The business runs on a proprietary second-price Vickrey auction ad engine that lets sportsbooks and streaming services reach bettors at peak intent moments — when the spread is live, not when the game is over.

---

## Key Stats

| Metric | Value |
|--------|-------|
| Sports covered | NCAA basketball (NCAAM), NBA, MLB |
| Distinct alert moment types | 11 (close game, overtime, spread alert, total alert, moneyline alert, prop alert, position alert, bet resolved, prediction resolved, foul trouble, follow alert) |
| Push notification delivery target | Under 90 seconds from on-court event |
| Ad auction clearing speed | Under 50ms (Vickrey second-price mechanism) |
| Ad integration entry points | 2 machine-readable channels: MCP server (`mcp.getnorma.app`, HTTP/SSE) and Programmatic Intent API (`/api/ads/`) |
| Alert pricing floors (by moment) | $0.10 (follow alert) to $0.60 (prediction resolved) CPM |
| Floor price optimizer | Runs daily; adjusts floors based on fill rate and clearing ratio |

### Alert Moment Types (Full List)

Basketball (NCAA + NBA): close game, comeback, spread alert, total alert, moneyline alert, player prop, foul trouble, overtime, bet resolved, prediction resolved.

MLB: close game (margin ≤ 2, 7th inning+), scoring threat, no-hitter in progress, pitcher at pitch limit, walk-off opportunity, run line proximity.

---

## Founder

**Dave Maloney** — [Dave Maloney — add bio here]

---

## Boilerplate Quote

"[QUOTE PLACEHOLDER — Dave to add]"

---

## Product Screenshots for Press Coverage

The following six screens best represent NORMA for editorial and media coverage. Request high-resolution assets at press@norma-app.com.

1. **Game Alert (push notification view)** — Shows the full push notification with "Why Now" headline, bullet context, and a single "Watch on [Provider]" action. This is the core product moment.

2. **Alert Feed (in-app)** — The alerts tab showing a stack of recent alerts with "Why Now" explanations, wager impact badges ("covering by 1"), and sponsor attribution labels.

3. **Live Game Detail** — Score, clock, period, current odds (spread/total/moneyline), and the Watch button routing to the correct streaming provider. Shows how NORMA bridges live action and viewing rights.

4. **Wager Tracker** — Active wagers list showing status (covering / at risk / decided) updated in real time as odds and scores move.

5. **Connections Screen** — The hub where users link their sportsbooks (DraftKings, FanDuel, BetMGM), streaming services (ESPN+, YouTube TV, Peacock, Prime Video), and prediction markets (Kalshi, Polymarket). Shows NORMA's role as a cross-platform layer.

6. **Advertiser Portal / Ad Auction Admin** — The Next.js campaign dashboard showing moment-type targeting, floor CPM pricing, supply forecast charts, and real-time auction fill rate. Useful for B2B and industry coverage.

---

## App Store

Available free on the iOS App Store. Search "Watch NORMA" or visit getnorma.app.

---

## Press Contact

press@norma-app.com
