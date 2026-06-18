# NORMA x Polymarket — Co-Marketing Brief

**Document type**: Partner outreach brief
**Audience**: Polymarket community / growth team
**Date**: June 2026

---

## What NORMA Is

NORMA is a mobile app (iOS) for sports bettors and prediction market traders. It monitors live game data across NCAA basketball, NBA, and MLB and sends push notifications at the exact right moment based on a user's open positions. The core promise: you never miss a game that matters to your money.

NORMA is not a sportsbook and not a prediction market. It is the layer on top of them — a personalized alert system that knows what you have at stake.

---

## How NORMA Integrates with Polymarket

### Connection Method

Users connect their Polymarket account by entering their wallet address in the NORMA app (Settings > Connections > Prediction Markets > Polymarket). No private keys are required. NORMA reads public position data only.

### Position Sync

Once connected, NORMA calls the Polymarket CLOB API (`https://clob.polymarket.com/positions?user={wallet_address}`) every 5 minutes via a Supabase Edge Function (`poll-markets`). The sync:

- Fetches all open positions for the wallet
- Matches each market title to a live game in NORMA's database using fuzzy team-name matching
- Stores the position side ("Yes"/"No"), quantity, avg price, and current price in `prediction_positions`
- Marks positions as settled when the underlying game ends

### Supported Market Formats

NORMA's matching engine recognizes the following Polymarket title patterns and links them to the correct game:

| Pattern | Example | Notes |
|---|---|---|
| `Will [Team] win?` | "Will Duke win?" | Moneyline format; "Yes" = team wins |
| `Will [Team] cover the spread?` | "Will Kansas cover the spread?" | Spread format; "Yes" = team covers |
| `[Team A] vs [Team B]` | "Iowa vs Wisconsin" | Matchup format; first team = "Yes" side |
| `[Team A] at [Team B]` | "Duke at North Carolina" | Road-at-home format |
| `[Team A] vs [Team B] Winner` | "Gonzaga vs Arizona Winner" | Explicit winner market |

NORMA maintains an alias table for common abbreviations used in Polymarket titles (UNC, UConn, VCU, UNLV, LSU, etc.) that differ from official team names.

**Markets not yet matched** (users with these positions see a generic alert rather than a game-linked one):
- Player-specific markets ("Will [Player] score over X points?")
- Game total markets ("Over/Under X points")
- Custom margin markets ("Will [Team] win by more than X?")
- Futures and tournament bracket markets

---

## What Alerts Users Receive

### 1. `position_alert` — General Position Alert

Fires when a game is live, the margin is within 8 points, and the user has an open position. Gives the user context on the current score and time remaining.

> "Your Polymarket Yes position on 'Will Duke win?' — 5-point game in the 2nd half with 10:00 left. Tune in now."

### 2. `resolve_risk` — Position at Risk (NEW as of PM-02)

Fires in the **final 5 minutes** of regulation or any overtime period when:
- The game margin is between 1 and 6 points, AND
- The user's position is currently on the **wrong side** of the outcome

This is the highest-urgency alert NORMA sends for prediction market users. It tells the user their position is in danger with just enough time to watch the finish.

> "Position at Risk — Duke trails by 3 with 2:47 left in 2nd half."
> Body: "Your Polymarket position on 'Will Duke win?' is at risk — Duke trails by 3 with 2:47 left. Tune in now."

Alert is deduplicated: a user only receives one `resolve_risk` alert per game session (5-minute cooldown enforced via `alert_throttle` table).

### 3. `prediction_resolved` — Final Settlement Alert

Fires when the game ends and NORMA has settled the position (outcome "yes" or "no"). Includes the final score and net payout.

> "Polymarket — You Won. Kentucky 74, Vanderbilt 68. You won $47.20."

---

## How Users Connect

1. Open NORMA on iOS
2. Tap the **Connections** tab
3. Tap **Prediction Markets** > **Polymarket**
4. Enter your Polymarket wallet address (public — no private key)
5. Tap **Connect**

NORMA immediately syncs open positions and begins monitoring linked games.

---

## The Ask

NORMA is building a community of serious NCAA/NBA bettors who are also active on Polymarket. We are looking for a **featured mention** from the Polymarket team:

**Option A — Discord**: A post in the Polymarket community Discord (announcements or #sports channel) introducing NORMA as a companion app for traders who want live game alerts tied to their positions.

**Option B — Social**: A mention or retweet from the Polymarket Twitter/X account introducing NORMA to the sports prediction market audience.

**Option C — Newsletter / Blog**: A brief feature in a Polymarket roundup or ecosystem update post.

We are not asking for exclusivity or a formal commercial arrangement. This is a genuine mutual-value introduction: Polymarket users get a better way to follow their positions, and NORMA gets introduced to an audience who already understands prediction markets.

---

## What We Offer in Return

- Featured "Connect Polymarket" placement on the NORMA connections screen (already live)
- In-app prompt encouraging users to open a Polymarket position on active games
- Attribution in NORMA's App Store listing and partner page
- Co-branded social content for NORMA's channels at launch

---

## Contact

To discuss or request a demo of the NORMA x Polymarket integration, reach out via the Watch NORMA app feedback form or the repository contact listed in the project README.

---

*NORMA reads public Polymarket position data via the CLOB API. No private keys or trading permissions are requested or stored.*
