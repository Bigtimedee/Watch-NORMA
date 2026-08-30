# App Store Product Page — Watch NORMA 1.5.0
**Football Season Launch — NFL & NCAAF**
**Prepared:** 2026-08-29 | **Target version:** 1.5.0 | **App ID:** 6759508383

All claims in this document are verifiable from the codebase at the time of writing.

---

## 1. Screenshots Shot List (5 frames)

All screenshots must be captured from the live 1.5.0 build. No composited imagery.

---

### Frame 1 — Games tab with NFL/NCAAF sport pills
**Screen:** `app/(tabs)/games/index.tsx` — Games list with the sport pill row visible at the top  
**What to capture:** The horizontal sport pill row showing NFL and NCAAF pills highlighted (NFL first during football season — `isFootballSeason` ordering is `["nfl", "ncaaf", "nba", "ncaam", "mlb"]`). A live or upcoming NFL game card should be visible below the pills.  
**Caption (overlaid):** "NFL and college football, live."  
**Notes:** Capture during a football window (August–February). The pill ordering is season-aware — this screenshot will show football-first automatically when the football season flag is active.

---

### Frame 2 — FootballScoreboard quarter line score
**Screen:** `app/(tabs)/games/[gameId].tsx` — Game detail for a live NFL or NCAAF game with the `FootballScoreboard` component visible  
**What to capture:** The `FootballScoreboard` component (`components/FootballScoreboard.tsx`) showing the quarter-by-quarter line score, current down and distance, possession indicator, and at least one scoring play in the scoring plays list. The component renders for `game.sport === "ncaaf" || game.sport === "nfl"`.  
**Caption (overlaid):** "Every drive. Every score."  
**Notes:** This component was added in Phase 3 F2. It only renders for football sports — basketball and baseball games show their own scoreboard layouts.

---

### Frame 3 — Red Zone alert card
**Screen:** `app/(tabs)/alerts/index.tsx` — Alerts feed showing a `football_red_zone` alert card  
**What to capture:** An alert card for `alert_type = "football_red_zone"` with the label "Red Zone Alert" (from `lib/alert-helpers.ts:25`), the red accent color (`#ef4444`), and the football outline icon. The "Why Now" explanation panel should be expanded showing the team inside the 20-yard line. The sport badge should read "NFL" or "NCAAF".  
**Caption (overlaid):** "Red zone. Your team is knocking."  
**Notes:** `football_red_zone` fires when a followed or wagered team crosses the opponent's 20-yard line. It fires throughout the game, not only in the fourth quarter.

---

### Frame 4 — Alerts tab filtered to NFL
**Screen:** `app/(tabs)/alerts/index.tsx` — Alerts feed showing a mix of football alert types  
**What to capture:** The Alerts tab with multiple football alert cards visible — ideally showing at least two different `alert_type` values such as `football_close_game` and `football_upset_watch`. The unread orange accent borders should be visible. Each card should show an NFL or NCAAF sport badge.  
**Caption (overlaid):** "The moment your bet matters."  
**Notes:** This frame communicates the breadth of football coverage without requiring a single perfect alert. Useful if a Red Zone alert is not available at capture time.

---

### Frame 5 — Quiet hours preference screen
**Screen:** `components/PreferencesSheet.tsx` — Preferences sheet open showing the quiet hours controls  
**What to capture:** The PreferencesSheet with quiet hours start and end fields visible and populated (e.g., "11:00 PM" to "8:00 AM"). The FX1 fix shipped quiet hours evaluated in the user's local time rather than UTC — this is the correct behavior for this screenshot.  
**Caption (overlaid):** "Alerts on your schedule."  
**Notes:** This frame addresses a key purchase objection for new users — fear of notification overload. Quiet hours are configurable via `user_preferences.notification_settings.quiet_hours_start/end`.

---

## 2. Promotional Text (170 characters max)

```
College football and NFL alerts are here. Get notified at the perfect moment — your spread, your wagers, your game.
```

Character count: 115. Within the 170-character limit.

**Alternate (if the primary is rejected by App Store Review):**
```
NFL and NCAAF alerts now live. NORMA tracks your spread and wagers in real time and notifies you the moment it matters.
```

Character count: 119.

---

## 3. What's New — Version 1.5.0 (500 characters max)

```
• College football (NCAAF) and NFL alerts are live
• FootballScoreboard: quarter line score, scoring plays, down & distance
• Red Zone alerts when your team crosses the 20
• Upset Watch: ranked NCAAF team trailing in Q4
• Quiet hours now respect your local time zone
• Sport-aware sportsbook deep links (no more basketball redirects)
• PrizePicks and Underdog added to roster import
```

Character count: 350. Within the 500-character limit.

**Verified feature map:**
| Bullet | Evidence |
|--------|----------|
| NCAAF and NFL alerts | `ALERTABLE_SPORTS` includes `ncaaf`/`nfl`; evaluators wired in `evaluate-alerts/logic.ts` |
| FootballScoreboard | `components/FootballScoreboard.tsx`; rendered in `[gameId].tsx:93-94` |
| Red Zone alerts | `alert_type = 'football_red_zone'`; label/color/icon in `lib/alert-helpers.ts:25,50,75`; floor price in `093_football_f3_floor_prices.sql` |
| Upset Watch | `alert_type = 'football_upset_watch'`; label/color/icon in `lib/alert-helpers.ts:26,51,76`; floor price in `093_football_f3_floor_prices.sql` |
| Quiet hours local time | FX1 fix; `evaluate-alerts/index.ts` |
| Sport-aware deep links | FX12 fix; `_shared/sportsbook-links.ts` |
| PrizePicks and Underdog roster import | `components/ImportRosterSheet.tsx:21-22` — both `prizepicks` and `underdog` are in `FANTASY_PLATFORMS` |

---

## 4. Keyword Field Additions (100 characters max)

**Current keywords** (from `eas.json` — no keyword field is stored there; App Store Connect is the authoritative source):

**Proposed additions for football launch:**
```
NFL alerts,college football,fantasy football alerts,pick'em
```

Character count: 60. Within the 100-character limit.

**Rationale:**
- `NFL alerts` — direct match for the feature shipped in 1.5.0
- `college football` — NCAAF coverage; high search volume in August–November
- `fantasy football alerts` — maps to roster import feature; DraftKings DFS, Yahoo, Sleeper, ESPN Fantasy, PrizePicks, Underdog all supported
- `pick'em` — routes DFS pick'em users (PrizePicks, Underdog) who search for tracking apps; these platforms are now in the roster import list

**Note:** "NFL" and "football" alone are not indexed efficiently when they appear in competitor titles at scale — use the long-tail pairings above.
