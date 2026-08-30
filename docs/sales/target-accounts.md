# NORMA Advertiser Target Accounts

100-account outreach template for founder-led sales. Each category has 10 named targets, the buyer persona, and the NORMA-specific value proposition. All sportsbook/DFS targets are subject to geo-filtering via `sportsbook_restrictions` — confirm user jurisdiction eligibility before including any sportsbook creative in a campaign.

---

## Category 1 — Sportsbooks / DFS Operators (geo-restricted)

**Buyer persona**: VP Marketing, Director of Acquisition, or Performance Marketing Manager

**Value proposition**: NORMA users already have an open bet when they receive an alert. `bet_resolved` and `spread_alert` moments are the highest-intent touch in sports media — the user is mid-action, not browsing. Floor CPM $0.30–$0.50. Geo-compliance built in: ads only serve to users in your licensed states.

| # | Company | Notes |
|---|---------|-------|
| 1 | DraftKings | Largest DFS/sportsbook; performance marketing team in Boston |
| 2 | FanDuel | Flutter subsidiary; strong brand spend alongside performance |
| 3 | BetMGM | MGM/Entain JV; active in most US states; strong NFL creative history |
| 4 | ESPN Bet | Penn Entertainment; ESPN parent gives cross-platform angle |
| 5 | Caesars Sportsbook | Heavy TV spender; looking for digital diversification |
| 6 | bet365 | UK-headquartered; US expansion; performance-first culture |
| 7 | Fanatics Betting | Newest entrant; aggressive acquisition budget |
| 8 | Underdog Sports | DFS focus; college + NFL heavy; growth-stage marketing |
| 9 | PrizePicks | DFS-adjacent; prop-heavy; strong social media presence |
| 10 | Sleeper | Fantasy/social betting hybrid; younger demographic overlap with NORMA |

---

## Category 2 — Streaming Services

**Buyer persona**: VP of Growth Marketing, Head of Sports Partnerships, or Director of Subscriber Acquisition

**Value proposition**: NORMA knows when a game is about to get great before the viewer does. `close_game` and `overtime` moments are the exact seconds a fan decides whether to open a streaming app. "Watch on ESPN+" deep-link already exists in-app — a streaming ad turns an intent signal into a direct subscription conversion. Floor CPM $0.35–$0.40. No geo-restrictions.

| # | Company | Notes |
|---|---------|-------|
| 1 | ESPN+ | Already integrated as deep-link provider; natural first close |
| 2 | Peacock | NBC Sports rights; NFL Wild Card exclusives; subscriber growth mode |
| 3 | Paramount+ | CBS Sports; SEC football; growing sports catalog |
| 4 | Amazon Prime Video | Thursday Night Football; significant sports acquisition budget |
| 5 | Apple TV+ | Friday Night Baseball; MLS; very selective — emphasize quality |
| 6 | YouTube TV | Live TV streaming; multiview; sports-first positioning |
| 7 | Hulu + Live TV | Disney bundle; strong NBA/college coverage |
| 8 | FuboTV | Sports-focused vMVPD; highest sports viewership share per sub |
| 9 | DAZN | Boxing/MMA; international sports; expanding US presence |
| 10 | DirecTV Stream | RSN coverage; cord-cutter migration audience |

---

## Category 3 — Sports Merchandise / Collectibles

**Buyer persona**: VP of Digital Marketing, Director of E-commerce, or Head of Fan Acquisition

**Value proposition**: `post_outcome` and `bet_resolved` are the highest-purchase-intent seconds in sports fandom — the team just won, the bet just paid. NORMA reaches fans 30 seconds after a meaningful game moment. Attribution is inferred (no post-click tracking unless postback webhook is configured), but buyer is already in a euphoric state. Floor CPM $0.25–$0.50. No geo-restrictions.

| # | Company | Notes |
|---|---------|-------|
| 1 | Fanatics | Largest sports retail; owns licensed jersey production |
| 2 | Nike (Sports Apparel) | Team partnership licensing; game-day drop campaigns |
| 3 | Adidas (Sports) | NBA and college partnership focus |
| 4 | Mitchell & Ness | Throwback/retro; collector demographic |
| 5 | FOCO | Bobbleheads/novelty; impulse-buy price point; match `bet_resolved` |
| 6 | New Era | Licensed headwear; strong NCAA and NBA relationships |
| 7 | WinCraft | Fan accessories; graduation from mass-market |
| 8 | Rally House | Regional fan retailer; city-specific targeting opportunity |
| 9 | Panini | Trading cards; basketball/football collector; `post_outcome` timing |
| 10 | Topps (Fanatics) | Baseball card leader; MLB game moments are natural triggers |

---

## Category 4 — Ticketing

**Buyer persona**: VP of Marketing, Head of Paid Acquisition, or Director of Fan Engagement

**Value proposition**: A fan watching a tight game in the 2nd half is the most likely buyer of a ticket to next week's game. `close_game` moments during the regular season convert to next-game ticket intent. Floor CPM $0.35. Audience is authenticated, location-inferred from timezone — local games can be targeted by region.

| # | Company | Notes |
|---|---------|-------|
| 1 | StubHub | Secondary market leader; strong mobile history |
| 2 | Ticketmaster / Live Nation | Primary + secondary; large digital acquisition budget |
| 3 | SeatGeek | Digital-native; API-first; strong college market |
| 4 | Vivid Seats | Performance marketing-heavy; open to new channels |
| 5 | AXS | Secondary market growing; NBA/concert overlap |
| 6 | Gametime | Last-minute tickets; mobile-first; close_game timing perfect |
| 7 | TickPick | No-fee positioning; value buyer; budget-conscious campaigns |
| 8 | Ballpark (MLB) | Official MLB ticket app; in-game purchase angle |
| 9 | NCAA Ticketing (Learfield) | College ticket official partner; March Madness campaigns |
| 10 | Golden State Warriors (team direct) | Test case for direct team partnership model |

---

## Category 5 — Fantasy / Betting Tools

**Buyer persona**: Head of Marketing, Director of User Acquisition, or Growth Lead

**Value proposition**: NORMA users are active bettors and fantasy players already. `prop_alert` and `spread_alert` moments reach users at the exact moment they're thinking about their lineup or live bet adjustment. Strong product-audience fit. No geo-restrictions (tools are not betting operators). Floor CPM $0.25–$0.30.

| # | Company | Notes |
|---|---------|-------|
| 1 | The Action Network | Betting analytics and news; editorial + affiliate model |
| 2 | OddsJam | Odds comparison and arbitrage; power-user demographic |
| 3 | Dimers | Predictive analytics for bettors; model-driven audience |
| 4 | FantasyPros | DFS/season-long tools; large email list, shifting to mobile |
| 5 | Rotowire | Injury and lineup news; real-time data overlap with NORMA |
| 6 | ESPN Fantasy (app) | Largest fantasy platform; cross-sell to ESPN+ |
| 7 | Yahoo Fantasy | Oath/Verizon; significant ad budget; fantasy-to-betting pipeline |
| 8 | Sleeper (Fantasy) | Social fantasy; growing Gen Z user base |
| 9 | Bet.Works (tools) | B2B → B2C tools player; evaluating consumer channels |
| 10 | PropSwap | Prop bet secondary market; niche but high-intent audience |

---

## DFS Pick'em Operators

**Updated:** 2026-08-29 — added following PrizePicks and Underdog Tier C integration shipping in 1.5.0.

**Buyer persona:** Head of Partnerships, VP of Product, or Director of User Acquisition

**Value proposition:** NORMA now imports PrizePicks and Underdog pick'em entries as first-class follows. A user who pastes their Underdog entry into NORMA immediately begins receiving live alerts on those players — stat milestone proximity, player prop pace, and fourth-quarter moments. NORMA is a natural retention driver: users who are notified that their pick'em player is on pace for a big game are more likely to return to the platform to check their entry.

**Current integration status (Tier C — import-only):**  
PrizePicks and Underdog are in `FANTASY_PLATFORMS` (`components/ImportRosterSheet.tsx`), registered in `LSApplicationQueriesSchemes` (`app.json`), and seeded in `provider_registry` as `category = 'dfs_pickem'`. Both platforms have display names in `lib/constants.ts` `SPORTSBOOK_NAMES`. The `parse-bet-slip` Edge Function recognizes PrizePicks entry screenshots. This is import-only — no live API connection exists.

**Partnership ask (Tier B / Tier A):**  
A Tier B partnership would provide an email-parse or entry-export path to eliminate the manual paste step. A Tier A partnership would provide a read-only roster/entry API. NORMA's architecture supports both without structural changes (see `docs/partnerships/fantasy-partner-brief.md`).

**Note:** Do not fabricate contact names, deal terms, or revenue commitments. All outreach should reference the shipped Tier C integration as proof of investment and the partnership brief as the technical roadmap.

| # | Company | Notes |
|---|---------|-------|
| 1 | PrizePicks | Largest DFS pick'em operator; NFL and NCAAF are peak season for prop entries; Tier C shipped; Tier B/A partnership would add live sync |
| 2 | Underdog Fantasy | Strong NFL best-ball and pick'em product; already in NORMA's platform list; Tier C shipped; overlapping bettor-adjacent audience |

---

## Notes for Founder Outreach

- **Pilot minimum**: $100 (or $250 credit-matched — see `pilot-offer.md`)
- **Attribution**: Inferred unless postback webhook is configured (`docs/partner-api/postback-webhook-spec.md`). Never claim app-verified conversions without the webhook.
- **Geo-compliance**: Sportsbook/DFS ads auto-filtered by `sportsbook_restrictions` table. Mention this in pitches as a feature, not a limitation.
- **Self-serve portal**: `getnorma.app/advertise` — link in all outreach.
- **Personalized one-pager**: run `npx ts-node scripts/generate-advertiser-onepager.ts --name "DraftKings" --category sportsbook --moments bet_resolved,spread_alert,close_game` before any meeting.
