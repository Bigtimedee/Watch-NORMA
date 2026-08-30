# Football 2026 Advertiser Inventory
**Watch NORMA — NFL & NCAAF Season**
**Prepared:** 2026-08-29

All floor prices are sourced directly from applied migrations. No forecasted revenue figures are stated — only structural facts about when moments fire and what impression volumes are plausible.

---

## Available Ad Moments

Ad moments are triggered by real game events via the `evaluate-alerts` pipeline. Each moment corresponds to an `alert_type` row in `floor_prices`. A moment fires at most once per throttle window per user per game.

### Core Football Moments (migration `20260706000004_football_floor_prices.sql`)

| Alert Type | Sport | Floor CPM | Min CPM | Max CPM | When It Fires |
|------------|-------|-----------|---------|---------|---------------|
| `football_close_game` | NFL | $0.40 | $0.05 | $2.00 | One-score game (margin ≤ defined threshold) in the fourth quarter or overtime |
| `football_close_game` | NCAAF | $0.35 | $0.05 | $2.00 | Same condition for college football games |
| `football_two_minute` | NFL | $0.45 | $0.05 | $2.00 | Two-minute warning window; one-score game; highest-intensity football moment |
| `football_two_minute` | NCAAF | $0.40 | $0.05 | $2.00 | Same condition for college football games |
| `football_overtime` | NFL | $0.50 | $0.05 | $2.00 | Overtime period starts |
| `football_overtime` | NCAAF | $0.45 | $0.05 | $2.00 | Same condition for college football games |

### F3 Moments — New for 2026 Season (migration `093_football_f3_floor_prices.sql`)

| Alert Type | Sport | Floor CPM | Min CPM | Max CPM | When It Fires |
|------------|-------|-----------|---------|---------|---------------|
| `football_red_zone` | NFL | $0.25 | $0.05 | $1.50 | Followed or wagered team enters the opponent's 20-yard line; fires any quarter |
| `football_red_zone` | NCAAF | $0.20 | $0.05 | $1.50 | Same condition for college football games |
| `football_upset_watch` | NCAAF | $0.40 | $0.05 | $2.00 | Ranked NCAAF team trailing in the fourth quarter; ESPN scoreboard `rank` field required |

**Note on `football_upset_watch`:** This moment type is defined for NCAAF only. NFL does not use an AP/Coaches Poll ranking system, so upset-watch logic applies exclusively to college football.

---

## F3 Moment Details

### `football_red_zone` — Red Zone Alert

**Floor CPM:** $0.25 (NFL), $0.20 (NCAAF)  
**When it fires:** When a team followed by the user, or a team mapped to an open wager, enters the opponent's 20-yard line. The alert fires during any quarter — not limited to late-game situations.  
**Targeting capability:** Sport (NFL or NCAAF), team follow, open wager mapped to the team. A user without a follow or wager on the team in possession will not receive this alert.  
**Impression frequency:** Fires multiple times per game because red zone opportunities occur throughout all four quarters. The alert throttle table (`alert_throttle`) prevents duplicate firings within the throttle window for the same `dedup_hash`.  
**Advertiser relevance:** Red zone moments are high-intent viewing windows — fans watching a possession game are likely already watching or about to open a streaming app. Streaming providers, ticketing platforms, and sportsbooks performing real-time line-update promotions are natural fits.

---

### `football_upset_watch` — Upset Watch

**Floor CPM:** $0.40 (NCAAF only)  
**When it fires:** A ranked NCAAF team (AP or Coaches Poll ranking surfaced via the ESPN scoreboard API `rank` field) is trailing in the fourth quarter. This is a "watch party urgency" signal — the ranked team may be about to lose.  
**Targeting capability:** Sport (NCAAF only), team follow. Users who follow the ranked team or have an open wager on them are candidates.  
**Impression frequency:** One-time-per-game signal; fires once when the ranked team falls behind in Q4. Does not repeat within the same game.  
**Advertiser relevance:** Upset watch moments concentrate on college football Saturdays and create the highest viewer intent outside of overtime. Streaming providers showing the game, sportsbooks with live-bet availability, and merchandise retailers running fan-gear promotions are strong fits.

---

## Saturday/Sunday Impression Volume Logic

Watch NORMA does not publish guaranteed impression counts. The following describes the structural logic for forecasting window volume.

**NCAAF Saturdays:**  
The ESPN schedule ingestion covers all FBS games (not just Top-25). A typical FBS Saturday has 50 or more concurrent games across conferences. Alert volume concentrates in time windows where games are in progress simultaneously:
- **12:00 PM – 4:00 PM ET:** Afternoon kickoff window (noon and 3:30 PM kicks). Multiple FBS games in the first half or second quarter simultaneously.
- **4:00 PM – 8:00 PM ET:** Late afternoon and primetime window. SEC late kicks and primetime games enter their fourth quarters during this window, driving `football_close_game` and `football_two_minute` moments.
- **8:00 PM – 11:00 PM ET:** Night game window. Lower game count but higher per-game viewer intensity for marquee matchups.

**NFL Sundays:**  
A typical NFL Sunday has 13 or more games across three windows:
- **1:00 PM ET:** Early window (6–7 games). `football_red_zone` and `football_close_game` moments begin as games enter the fourth quarter around 3:30–4:00 PM ET.
- **4:05 PM / 4:25 PM ET:** Late window (5–6 games). Highest concurrent late-game alert volume of the week.
- **8:20 PM ET:** Sunday Night Football (1 game). Single game with nationally elevated viewership; `football_two_minute` and `football_overtime` moments here carry premium intent.

**NFL Thursday and Monday:**  
Single-game slates. Alert volume is lower in absolute terms but highly concentrated on one matchup with no competing games. `football_overtime` and `football_two_minute` moments on Thursday Night Football reach a focused audience.

---

## Targeting Capabilities

| Dimension | Available | Source |
|-----------|-----------|--------|
| Sport | Yes — `nfl` or `ncaaf` | `games.sport` column |
| Team follow | Yes — user explicitly follows the team | `follows` table, `entity_type = 'team'` |
| Open wager mapped to team | Yes — user has an active wager on this game | `wagers` table, mapped via `wager_targets` |
| Wager type (spread / total / moneyline / player_prop) | Yes — `wagers.market_type` | `wagers` table |
| Alert type | Yes — campaign targets specific moment types | `floor_prices.moment_type` |
| User timezone / geo | Partial — device timezone collected at app launch (FX3); state-level jurisdiction enforcement via `sportsbook_restrictions` | `profiles.timezone`; `sportsbook_restrictions` table |

**Geo-compliance note:** Sportsbook and DFS advertising is only served to users in jurisdictions where the operator is licensed. This is enforced by the `sportsbook_restrictions` table, not by advertiser selection. Advertisers do not need to handle state-level suppression themselves.

---

## Pricing Model

**CPM floor prices** are set per `(moment_type, sport)` pair. The floor is the minimum CPM the auction will accept for that moment. Winning bids above the floor are charged at the second-price auction clearing price.

**What triggers a billable moment:**  
1. The alert pipeline evaluates a candidate (user with a follow or wager on a game).  
2. The alert passes scoring threshold and throttle checks.  
3. The alert is created in the `alerts` table and dispatched to the user.  
4. If a campaign ad creative is attached to this `alert_type` for the user's jurisdiction, the impression is recorded and the winning bid is charged.

**A moment fires independently of whether the user taps the alert.** The billable event is the impression (alert delivered), not the click. Click-through attribution requires the advertiser's postback webhook (see `docs/partner-api/postback-webhook-spec.md`).

**Pricing floors by moment class:**

| Moment class | Peak floor CPM |
|---|---|
| `football_overtime` (NFL) | $0.50 |
| `football_two_minute` (NFL) | $0.45 |
| `football_overtime` (NCAAF) / `football_upset_watch` (NCAAF) | $0.40–$0.45 |
| `football_close_game` (NFL) / `football_two_minute` (NCAAF) | $0.40 |
| `football_close_game` (NCAAF) | $0.35 |
| `football_red_zone` (NFL) | $0.25 |
| `football_red_zone` (NCAAF) | $0.20 |

---

## Contact

Advertiser self-serve: `getnorma.app/advertise`  
Sales contact: `partnerships@norma-app.com`
