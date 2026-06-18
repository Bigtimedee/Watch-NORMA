# NORMA x Kalshi — Partner Brief

**For:** Kalshi Business Development  
**Date:** June 2026  
**Contact:** hello@norma-app.com

---

## What NORMA Does

NORMA is a push notification app for sports bettors and prediction market traders. It monitors live game data every minute and sends users a notification at exactly the right moment — when their position is entering its resolution window and they need to pay attention.

The core promise: you don't have to watch the game to know when your bet matters.

---

## The Kalshi Integration

NORMA connects to a user's Kalshi account via the Kalshi read-only API. Once connected, NORMA polls the user's open positions every 5 minutes and cross-references them against live game data.

When a sports market linked to a user's position is entering its final resolution window, NORMA sends a push notification:

> "Your Kalshi position on [Market] is resolving. [Team] leads by 3 with 4 minutes left."

**What NORMA can do with the API:**
- Read open positions
- Read portfolio balance
- Read market data

**What NORMA cannot do:**
- Place trades
- Cancel trades
- Modify positions

The API key is stored in an encrypted server-side vault and is used exclusively for read-only requests. Users retain full control and can revoke access from Kalshi's settings at any time.

---

## Connection Flow (2 Steps for the User)

1. **Get an API key** — the user logs in to kalshi.com, goes to Settings → API → Create Key, and copies the Key ID.
2. **Paste it in NORMA** — the user pastes the Key ID and their private key PEM into the NORMA connection wizard, taps "Test Connection," and they're live.

Total time: under 3 minutes for a user already logged in to Kalshi.

---

## Alerts Users Receive

Users who connect Kalshi receive push notifications at two moments:

| Trigger | Notification content |
|---|---|
| Sports position entering final resolution window | Market name, current score, time remaining, direction of position |
| Position resolves (win or loss) | Final result, payout amount |

Notifications are sent only for sports markets where NORMA has live data coverage (NFL, NBA, NCAA basketball). Other market types are monitored for position status changes.

---

## The Ask

We are looking for one of the following co-marketing arrangements:

**Option A — Newsletter mention**  
A single mention in Kalshi's user newsletter introducing NORMA as a companion app for sports-betting users. Suggested framing: "Know the moment your sports market is resolving — NORMA alerts you in real time."

**Option B — In-app notification**  
A one-time in-app notification to Kalshi users who have at least one open sports market position, surfacing NORMA as a recommended companion app.

**Option C — Mutual promotion**  
NORMA promotes Kalshi to our user base (sports bettors considering prediction markets) in exchange for Kalshi surfacing NORMA to their sports-betting users.

---

## Why This Benefits Kalshi

- **Engagement:** Users who get a timely notification when their position is resolving are more likely to return to Kalshi to review their result, place their next trade, or explore adjacent markets.
- **Retention:** Users who feel informed about their positions are less likely to churn.
- **Acquisition:** NORMA users who have not yet tried Kalshi are a direct conversion target — NORMA already reaches sports bettors who are comfortable with both financial risk and app-based tracking.

---

## About NORMA

NORMA is a React Native app available on iOS. It is built on Supabase and uses the Expo push notification stack. The Kalshi integration is live and in production.

For questions or to discuss co-marketing terms, contact: hello@norma-app.com
