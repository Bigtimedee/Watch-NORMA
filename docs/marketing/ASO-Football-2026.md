# ASO Football 2026 — App Store Optimization Package
**Watch NORMA — NFL & NCAAF Season Launch**
**Prepared:** July 2026 | **Target launch:** September 1, 2026 (NFL Kickoff)

---

## 1. Keyword Research Framework

### App Store Character Limits
| Field | Limit | Notes |
|-------|-------|-------|
| Title | 30 chars | Indexed by App Store search; highest weight |
| Subtitle | 30 chars | Indexed; appears below title in search |
| Keyword field | 100 chars | Comma-separated, no spaces after commas; not shown to users |
| App preview | N/A | First 3 screenshots shown before expand |

### Primary Keywords

| Keyword | Rationale | Estimated Intent | App Store Field |
|---------|-----------|-----------------|-----------------|
| `sports betting alerts` | Core product description; high commercial intent from bettors searching for bet-tracking alert apps | Very High | Keyword field |
| `bet tracker` | Shorter, high-frequency search term for users tracking active bets; appears in competitor titles | Very High | Keyword field |
| `NFL score alerts` | Seasonal spike starting Week 1; users who want notification-level awareness during games | High | Keyword field |
| `spread tracker` | Specific to the wager type most NFL bettors care about; distinguishes Watch NORMA from generic score apps | High | Subtitle |

### Secondary Keywords

| Keyword | Rationale | Estimated Intent | App Store Field |
|---------|-----------|-----------------|-----------------|
| `where to watch NFL` | High search volume in streaming era; directly maps to Watch NORMA's deep-link feature | High (informational) | Keyword field |
| `red zone alerts` | Football-specific trigger moment; bettors and fantasy players both search this | Medium-High | Keyword field |
| `prop bet tracker` | Player prop betting is the fastest-growing wager type; coverage gap vs. sportsbook apps | Medium-High | Keyword field |
| `football wager` | Broader pairing term; captures users who typed the wager type before the app type | Medium | Keyword field |
| `NFL overtime` | Specific moment type; users who want OT notification coverage; low competition | Medium | Keyword field |
| `live game alerts` | Broad but accurate; works for both football and the existing basketball audience | Medium | Keyword field |

### Recommended Keyword Field (100 chars)
```
bet tracker,NFL alerts,spread tracker,prop tracker,football wager,red zone,live game alerts
```
Character count: 91. Reserve 9 chars for iteration.

**Avoid:** "football," "NFL," "sports" — Apple does not index generic category terms when they appear in competitor titles at scale. Use them only when the long-tail pairing adds specificity.

---

## 2. Title and Subtitle Candidates

App Store title format: `Watch NORMA: [value prop]` — brand name is non-negotiable (rule 20).

### Option A — Broad intent (recommended for launch)
| | Text | Length |
|--|------|--------|
| **Title** | `Watch NORMA: Sports Bet Alerts` | 30 |
| **Subtitle** | `NFL, NBA & Live Bet Tracker` | 27 |

**Rationale:** Title covers the broadest high-intent query ("sports bet alerts") while retaining multi-sport positioning. Subtitle adds NFL specificity for the football season without sacrificing year-round relevance. The conjunction "NFL, NBA &" signals to the algorithm that this app spans seasons.

**Tradeoff:** "Sports Bet Alerts" is less distinctive than a more specific football phrase. Competing apps may use similar phrasing. Win position depends on reviews volume and conversion rate.

---

### Option B — Football-first, bettor-first
| | Text | Length |
|--|------|--------|
| **Title** | `Watch NORMA: NFL Bet Tracker` | 29 |
| **Subtitle** | `Alerts When Your Bet Goes Live` | 31 → 30 |

Corrected subtitle: `Alert When Your Bet Goes Live` (30 chars)

**Rationale:** Title contains "NFL Bet Tracker" — high-intent exact-match phrase during football season. Subtitle explains the trigger mechanism, which is the product's clearest differentiator (no other app alerts specifically when a wager line is being crossed). High bettor-intent conversion.

**Tradeoff:** Heavily football-specific — ranking may drop during NBA/March Madness seasons when "NFL" intent falls. Best suited as the seasonal variant to swap in from August through January.

---

### Option C — Streaming-led, fan-led
| | Text | Length |
|--|------|--------|
| **Title** | `Watch NORMA: Live Game Alerts` | 30 |
| **Subtitle** | `NFL Scores, Spreads & Odds` | 26 |

**Rationale:** Subtitle covers three high-volume query patterns (scores, spreads, odds) without requiring the title to carry them. Appeals to the broader sports-fan audience who may not identify as "bettors." The word "Odds" indexes against a high-volume query family.

**Tradeoff:** Lower bettor specificity — may convert less efficiently with the core acquisition audience (bettors 21–40). Better for top-of-funnel volume than bottom-of-funnel conversion.

---

### Recommendation

Launch with **Option A** (broadest, multi-sport safe). Switch to **Option B** for the two weeks bracketing NFL Kickoff and the Super Bowl. Revert to Option A during playoffs when NBA/March Madness competes for keyword attention.

---

## 3. Screenshot Storyboard (6 Frames)

All screenshots must be captured from the live app. No AI-generated or composited imagery (rule 21).

---

### Frame 1 — Football alert with "Why Now" card
**Screen:** Alert feed showing a football-type alert card
**What to show:** An in-progress NFL game alert (e.g., `football_two_minute` or `football_close_game`) with the full "Why Now" explanation panel expanded: headline such as "Two-Minute Warning — One Score Game," bullets showing the margin and clock, and the wager impact badge if applicable
**Caption text (overlaid):** "Know the moment your bet goes live."
**Design notes:** Capture after enabling NFL in ALERTABLE_SPORTS on a test device. The orange accent border on an unread alert is important — it signals urgency to new users. Include the sport badge (NFL) in the upper-left of the card.

---

### Frame 2 — Watch deep-link moment
**Screen:** Alert card with the "Watch on [Provider]" button highlighted, OR the game detail screen immediately after tapping Watch
**What to show:** A live NFL game alert card where a streaming provider (e.g., "Watch on ESPN+" or "Watch on Peacock") is visible. If possible, show the native provider app launching in the background.
**Caption text:** "One tap to the live game."
**Design notes:** This screenshot is the most direct answer to the "where to watch NFL" search query. The Watch button should be the visual focal point — full orange color, easy to read at thumbnail scale. Capture on an iPhone 15 Pro for a clean screen.

---

### Frame 3 — Wager tracking
**Screen:** Active wager card or the wager section of the game detail screen
**What to show:** An NFL spread wager that is currently "covering" — show the wager description, the current score/margin, and the "Covering +1.5" or similar status badge from the wager impact section. If a "Why Now" explanation shows wager_impact, capture that expanded view.
**Caption text:** "See your spread in real time."
**Design notes:** The orange wager impact badge against the dark background reads clearly at thumbnail scale. Avoid showing dollar amounts (rule 16) — the screenshot should show only the spread line (e.g., "Chiefs -3.5") and coverage status.

---

### Frame 4 — Live odds
**Screen:** Game detail odds section or the odds panel within a live game card
**What to show:** NFL game with spread, moneyline, and over/under lines displayed — updated via The Odds API from DraftKings/FanDuel. If multiple odds sources appear, show the sportsbook attribution.
**Caption text:** "Live spreads and lines, always fresh."
**Design notes:** Three columns (spread, moneyline, O/U) with team names on the left reads clearly even at 50% thumbnail scale. The "BET NOW" button from a connected sportsbook is a bonus if it appears — it reinforces the commerce integration.

---

### Frame 5 — Referral / insider moment
**Screen:** The referral nudge UI that appears after a thumbs-up on an alert, or the profile referral section
**What to show:** The "Know someone sweating this game? Invite them" referral nudge with the orange "Invite" button. Alternatively, the profile screen showing the referral code and "Friends invited" count.
**Caption text:** "Share the moment. Invite a friend."
**Design notes:** This frame positions Watch NORMA as a social experience, not just a solo utility. The nudge appearing inline on an alert card (rather than a separate screen) reinforces the moment-first product philosophy. Capture with a game that has a recognizable NFL matchup in the background.

---

### Frame 6 — Connections
**Screen:** Connections tab showing connected streaming and sportsbook providers
**What to show:** A mix of streaming providers (YouTube TV, ESPN+, Peacock) and a sportsbook (DraftKings or FanDuel) shown as connected (green checkmarks or filled toggle). The list should look populated — not empty — to signal an active user state.
**Caption text:** "All your streams and bets, one app."
**Design notes:** This frame answers the "multi-subscription confusion" pain point directly. Show 4–6 connected providers for credibility. The Connections screen layout (grid or list) should be clean at thumbnail scale — avoid overcrowding.

---

## 4. What's New Copy — Football Release

**Version X.X.X — NFL & College Football**

NFL and college football are here.

Watch NORMA now tracks your football bets and follows in real time — spread proximity in Q4, two-minute drill alerts for one-score games, and overtime notifications the moment the period starts. If you have a wager on a game, you'll know when it matters.

Football streaming routing works the same way as basketball: one tap from the alert to the live game on ESPN+, Peacock, YouTube TV, or wherever it's airing.

Share any alert moment as a branded card with a single tap.

Minor performance improvements and bug fixes.

---

## 5. In-App Event Suggestions

App Store in-app events appear on product pages, in search results, and in the "Events" tab. Each has a title (30 chars), short description (50 chars), and long description (120 chars). Events should reflect real product behavior, not marketing language.

---

### Event 1 — NFL Kickoff Week
**Timing:** September 1–8, 2026 (NFL Week 1)
**Badge type:** "New Season" (blue)
| Field | Text | Length |
|-------|------|--------|
| Title | `NFL Kickoff Week` | 18 |
| Short description | `Football alerts are live for Week 1` | 36 |
| Long description | `Watch NORMA now tracks NFL wagers, spreads, and two-minute drills. Get notified the moment your bet goes live in Q4.` | 115 |

**Notes:** This event aligns with the highest search-volume week in the football calendar. It should be submitted to App Store Connect no later than August 18 for Apple review.

---

### Event 2 — College Football Saturday (Recurring)
**Timing:** Every Saturday September–November
**Badge type:** "Challenge" or "Major Update"
| Field | Text | Length |
|-------|------|--------|
| Title | `College Football Saturday` | 26 |
| Short description | `NCAAF alerts every week` | 23 |
| Long description | `All your NCAAF spreads and game follows tracked live. Watch NORMA sends the alert when your bet or your team needs attention.` | 121 |

**Notes:** A recurring event reinforces weekly engagement. App Store Connect supports recurring events.

---

### Event 3 — Super Bowl Weekend
**Timing:** February 1–2, 2027 (Super Bowl LXI)
**Badge type:** "Challenge"
| Field | Text | Length |
|-------|------|--------|
| Title | `Super Bowl Weekend` | 19 |
| Short description | `Every bet, every moment, tracked live` | 37 |
| Long description | `Watch NORMA tracks your Super Bowl spread, total, and props in real time. Know the moment your bet goes live with one tap to the broadcast.` | 138 → trimmed below |

Trimmed long description (120 chars): `Watch NORMA tracks your Super Bowl spread, total, and props live. One tap from the alert to the broadcast.`

---

## 6. A/B Test Plan — App Store Product Page Optimization

Apple's Product Page Optimization (PPO) supports A/B testing of: app icon, screenshots (up to 3 versions), and app preview video. It does NOT support testing title, subtitle, or keyword field changes — those require sequential testing via ranking observation, not split testing.

### What to test first: Screenshots (Frame 1)

**Hypothesis:** The football alert screenshot (Frame 1 — "Why Now" card) will outperform the connections screenshot (Frame 6) as the hero frame because high-intent bettors searching "NFL bet tracker" convert on product proof, not feature inventory.

**Test setup:**
| | Control | Treatment |
|--|---------|-----------|
| Frame 1 position | Alert card with Why Now (Frame 1 above) | Wager tracking close-up (Frame 3 above) |
| Frames 2–6 | Unchanged | Unchanged |

**Why screenshots before the icon:** The icon requires a new design asset and Apple review. Screenshots can be prepared from existing captures and do not require binary resubmission. Screenshots have documented conversion impact in comparable apps (see Apple's PPO case studies). Test the higher-leverage variable first.

**Primary metric:** Conversion rate (impressions to downloads) from App Store search for "NFL bet tracker" and "spread tracker."

**Secondary metric:** Day-1 retention cohort for the treatment arm vs. control — if the treatment attracts a less-qualified audience, retention will be lower even if conversion rate is higher.

**Duration:** 90 days minimum, or until statistical significance at 95% confidence. With typical App Store traffic, the test will need at least 500 impressions per arm to detect a 10% conversion lift.

**Iteration after this test:** If Frame 1 wins, test a second variable: subtitle text — Option A ("NFL, NBA & Live Bet Tracker") vs. Option B ("Alerts When Your Bet Goes Live"). Run via sequential observation (change subtitle, observe ranking and conversion delta over 4 weeks) since PPO does not support subtitle testing.

---

*This document covers ASO for the September 2026 football season launch. Update keyword performance data after Week 1 using App Store Connect Analytics (Impressions, Conversion Rate by Source). The app name, brand position, and non-negotiable product rules are governed by `docs/watch-norma-context/10_NON_NEGOTIABLE_RULES_FOR_FUTURE_WORK.md`.*
