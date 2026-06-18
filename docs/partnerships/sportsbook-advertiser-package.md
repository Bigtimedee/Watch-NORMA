# NORMA Sportsbook Advertiser Package

---

## 1. What Is a NORMA Intent Moment?

NORMA sends push notifications to sports fans at the exact moment their wager, prediction, or team follow crosses a threshold. Every notification is a distinct in-game event — a spread being crossed, a bet resolved, overtime beginning, a close game entering its final minutes. The ad fires inside that push as a "Sponsored" label, meaning the user is already reaching for their phone.

---

## 2. Available Moment Types and Floor CPMs

| Moment Type         | Floor CPM | Typical CTR Range |
|---------------------|-----------|-------------------|
| prediction_resolved | $0.60     | 11–17%            |
| bet_resolved        | $0.50     | 9–15%             |
| overtime            | $0.40     | 12–18%            |
| close_game          | $0.35     | 7–13%             |
| spread_alert        | $0.30     | 6–10%             |
| moneyline_alert     | $0.30     | 5–9%              |
| total_alert         | $0.25     | 4–8%              |
| prop_alert          | $0.25     | 4–8%              |
| position_alert      | $0.20     | 3–7%              |
| foul_trouble        | $0.15     | 2–6%              |
| follow_alert        | $0.10     | 2–4%              |

---

## 3. Audience Profile

Active sports bettors tracking DraftKings, FanDuel, and BetMGM wagers in-app. Prediction market participants on Kalshi and Polymarket. Team followers across NBA, MLB, and NCAA. The audience self-selects via financial stakes — there is no interest-graph inference. NORMA users have already put money on the line before the ad is served.

---

## 4. Attribution Methodology

**Today**: Inferred attribution via `stream_open` and `wager_placed` events within a configurable 30-minute post-notification window. No SDK required on the advertiser side.

**Upgrade path**: Server-to-server conversion callbacks (S2S) via NORMA's ConversionIngestor interface. One engineering sprint separates inferred from verified attribution. The activation mechanism is a revenue-share or CPA agreement — sign the deal, go live on verified attribution.

---

## 5. Pricing

Second-price Vickrey auction. You pay $0.01 above the second-highest competing bid, never your max bid. No minimum commitment. No setup fee. Self-serve at getnorma.app/auth.

Direct deals are available for advertisers seeking guaranteed monthly impression volumes. Contact bd@norma-app.com to discuss a reserved inventory agreement.

---

## 6. Geo-Compliance

Built in. Sportsbook campaigns are automatically filtered by state-level sports betting legality at impression time. Advertisers do not manage state audience segments — NORMA handles it. You set your bid and creative; NORMA ensures the impression only fires in states where the campaign is legally eligible.

---

## 7. Self-Serve Portal Walkthrough

**Step 1**: Create an account at getnorma.app/auth.

**Step 2**: Complete your advertiser profile — company name, billing contact, payment method.

**Step 3**: Create a campaign. Choose **Sportsbook Fast Track** to pre-select the highest-value sportsbook moment types (prediction_resolved, bet_resolved, overtime, close_game). Set your bid at $0.35 or higher for strong auction competitiveness. Enter your creative — headline, body copy, destination URL.

**Step 4**: Your campaign goes live within 30 minutes of creation and approval. No calls required.

---

## 8. Contact

**Business development**: bd@norma-app.com

**30-minute walkthrough**: getnorma.app/demo
