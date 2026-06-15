# 02 — User Experience and Flows

## New User Onboarding

The onboarding flow starts at `/(auth)/welcome` and guides the user through account creation and initial setup.

**Step 1: Welcome screen.** The user sees the NORMA logo, three feature highlights (personalized game alerts, streaming shortcuts, wager tracking), and two CTAs: "Join the Game" (sign up) and "Sign In" (existing user).

**Step 2: Account creation.** The user can sign up with email/password (providing name, email, password) or Apple Sign-In on iOS. Email sign-up requires email verification. After successful auth, the user is redirected to the authenticated tab navigator.

**Step 3: Connect services.** From the Connections tab, the user can connect streaming services (ESPN+, YouTube TV, Peacock, etc.), TV providers, sportsbooks (DraftKings, FanDuel, BetMGM), and prediction markets (Kalshi, Polymarket). Connecting a streaming service or sportsbook means the user indicates "I use this" — there is no OAuth flow for streaming or sportsbooks. Kalshi requires API key + private key (.pem) via a multi-step wizard. Polymarket requires a wallet address.

**Step 4: Set preferences.** From the Profile tab, the user opens the Preferences sheet to select favorite teams, set quiet hours (start/end times), configure per-game and per-hour alert limits, and choose notification channels (push and/or in-app).

**Step 5: Follow games and teams.** From the Games tab, the user can tap into any game detail and follow it (heart icon). Following a team or game ensures the user receives alerts for that entity.

## Returning User Experience

When a returning user opens the app, they land on the Games tab. The screen displays:

- **Date picker** — horizontal scroll of dates (±5 days from today, Eastern timezone). Tap a date to see that day's games.
- **Sport filter** — pills for All Sports, NCAA, NBA, MLB.
- **Tab switcher** — "All Games" (every game for the date/sport), "Live" (in-progress games only), "Following" (games the user follows).
- **Game cards** — each card shows away/home teams, scores (if live/final), status badge (Scheduled, Live, Halftime, Final), broadcast info, and venue.
- **Pull-to-refresh** — manual refresh of game data.
- **Live count badge** — the Games tab icon shows a badge with the count of currently live games.

The Alerts tab shows an unread count badge. The user can immediately see if new alerts have arrived.

## Alert Flow

This is the core user experience and the reason Watch-NORMA exists.

**1. Trigger.** The alert engine evaluates every active game on a recurring cycle (approximately every 30–60 seconds for live games). For each game, it generates candidate users — anyone following a team or player in the game, anyone with an active wager mapped to the game, and anyone with a prediction-market position tied to the game.

**2. Scoring.** Each candidate receives a numeric relevance score based on game state signals (margin, clock, period, lead changes, foul trouble) and user-specific signals (has wager, wager is covering, follows team, follows player on court). Must-notify rules fire immediately for critical moments (game final, overtime, 1-possession game under 2:00, star player 4th foul).

**3. Threshold.** Only candidates scoring above 40 (or matching a must-notify rule) generate an alert.

**4. Explanation.** Every alert includes a structured "Why Now" explanation: a headline (e.g., "Your Spread Is Live"), bullets (e.g., "Duke trails by 3 with 4:12 left"), relevant stats, confidence level, and wager impact if applicable (covering / not covering / at risk / decided).

**5. Throttling and dedup.** The alert is checked against the `alert_throttle` table for duplicate hash, per-user caps (max alerts per game, max alerts per hour), cooldown windows, and quiet hours.

**6. Sponsor attachment.** If the alert clears throttling, the Vickrey auction engine runs to find a contextually relevant sponsor ad. The ad is attached to the alert but never delays or obscures the core alert content.

**7. Delivery.** The alert is inserted into the `alerts` table, a push notification is dispatched via Expo Push API (unless quiet hours or user preference says otherwise), and the delivery result is logged in `delivery_log`.

**8. User receives notification.** The push notification arrives on the user's phone. Tapping it opens the app and navigates to the relevant game detail screen.

**9. Alert card.** In the Alerts tab, each alert is rendered as a rich card showing: alert type icon and badge (close_game, spread_alert, etc.), sport badge (NBA/MLB), time ago, title, body, explanation bullets, wager impact callout, sponsor logo and text (if present), action buttons — "Watch on [Provider]" and "Bet Now" (sportsbook deep link), and a subtle thumbs-up / thumbs-down feedback control.

**10. Watch action.** Tapping "Watch on [Provider]" triggers the tap-to-stream animation and deep-links the user to the streaming app.

**11. Alert feedback.** A small "Useful?" thumbs-up / thumbs-down control appears below each alert card's action buttons. Tapping saves the rating to the `alert_feedback` table (upsert — one rating per user per alert, updatable). The control uses optimistic local state so the UI responds immediately. Feedback is not used to alter scoring in real-time; it accumulates for future scoring-weight tuning. The control is intentionally small and visually subordinate to the primary Watch action.

## Streaming Provider Flow

This is mission-critical UX. The streaming routing flow must be reliable and must never degrade.

**How the app determines where to watch:** Each game has a `broadcast` field (populated from ESPN/SportsDataIO data) containing network names (ESPN, TNT, CBS, FOX, etc.). The function `getBroadcastProviderKeys()` maps broadcast strings to provider keys. The function `getBestWatchProvider()` intersects those provider keys with the user's connected providers (from the `connections` table) and the full provider registry (from `streaming_providers` / `provider_registry`) to find the best match.

**How it displays options:** The `WatchNowButton` component shows a single primary action: "Watch on [Provider Name]" (e.g., "Watch on YouTube TV"). If the user has a connected provider that carries the game, that provider is shown. If multiple connected providers carry the game, the best match is chosen. If no connected provider matches, the button may show the broadcast network or a generic fallback.

**How it routes users:** When the user taps "Watch on [Provider]":
1. The tap-to-stream animation begins (portal effect with blur overlay).
2. The deep-link engine calls `openStreamingApp()` which follows a 3-step fallback chain:
   - Try the provider's `ios_scheme` (native app deep link, e.g., `sportscenter://`)
   - If that fails, try the `universal_link` (e.g., `https://tv.youtube.com`)
   - If that fails, open the `fallback_store_url` (App Store link)
3. Success/failure and method used are logged to `deep_link_events` for observability.

**Critical rule: Never route existing subscribers to generic sign-up pages.** If the user is already a YouTube TV subscriber and taps "Watch on YouTube TV," the app must open YouTube TV directly — not a marketing page. The `universal_link` field in `provider_registry` must point to a watch/login URL, not a marketing URL. This has been a focus of multiple migrations (052, 053, 054 for YouTube TV specifically) and the `deep-link-health-check` Edge Function monitors for regressions.

**Multiple providers for the same event.** If a game airs on both ESPN and ABC, and the user has both ESPN+ and YouTube TV connected, the system selects the best match based on provider priority and connectivity.

**Unknown availability.** If broadcast data is missing or no connected provider matches, the app should not fabricate certainty. The Watch button should be hidden or show "Broadcast TBD."

**Local blackouts and regional restrictions.** The current system does not have blackout detection. Broadcast data from ESPN/SportsDataIO reflects national coverage. Regional sports networks and local blackouts are a known gap. If a user encounters a blackout, the deep link may fail silently — this is documented as a known limitation.

## Sportsbook / Prediction Market Flow

**Sportsbooks (Tier C — manual tracking):** The user connects a sportsbook in the Connections tab, meaning they indicate "I use DraftKings." This is not an API integration — no credentials are exchanged for sportsbooks. The user then tracks wagers manually via: (a) the AddWagerSheet form in game detail (sportsbook, market type, description, line, odds, stake, parlay legs), (b) bet slip scanning (photograph a bet slip, Claude Vision extracts wager details, user confirms), or (c) email forwarding (forward sportsbook confirmation emails to bets@getnorma.app, parsed automatically, user reviews).

**Prediction Markets (Kalshi — API integration):** The user connects Kalshi via the KalshiWizard (5-step flow: create API key in Kalshi's dashboard, enter Key ID, upload .pem private key, FAQ, confirmation). The app then syncs positions every 5 minutes via `poll-markets`, displaying each position with market title, YES/NO side, quantity, average price, current price, and P&L. When a game closes, `resolve-predictions` settles positions.

**Prediction Markets (Polymarket — wallet integration):** The user connects Polymarket via the PolymarketWizard (3-step flow: go to Polymarket, enter wallet address, FAQ). Positions are fetched from Polymarket's CLOB API using the wallet address.

**Alert integration:** Once wagers or positions exist, the alert engine factors them into relevance scoring. A user with a Duke +3.5 spread bet will receive alerts when Duke's margin approaches the spread line. The "Why Now" explanation includes wager impact: "Your Spread — Duke +3.5 — covering by 1 with 4:12 left."

**Important guardrails:** The app does not provide betting advice or guaranteed outcomes. It does not fabricate account data. If a sportsbook integration is not implemented (Tier A partner API), it is clearly marked as "Coming soon" in the UI.

## Notification Preferences

Users configure notification preferences in the Preferences sheet (accessible from the Profile tab). The current implementation supports:

- **Favorite teams** — multi-select from a list of teams. Users following a team receive alerts for all their games.
- **Quiet hours** — start and end times during which push notifications are suppressed (in-app alerts still created).
- **Max alerts per game** — default 5. Hard cap on how many alerts a user receives for a single game.
- **Max alerts per hour** — default 10. Hard cap on total alert volume.
- **Notification channels** — push (on/off) and in-app (on/off).
- **Ad personalization** — toggle in Profile settings. When off, the auction engine still runs but does not use behavioral signals.
- **Push notifications master toggle** — global on/off in Profile settings.

## In-App Screens

Based on the repository, the app has the following screens and components:

**Authentication:**
- `/(auth)/welcome` — onboarding landing page
- `/(auth)/sign-in` — email/password + Apple Sign-In
- `/(auth)/sign-up` — registration form

**Games Tab:**
- `/(tabs)/games/index` — game list with date picker, sport filter, tab switcher (All/Live/Following)
- `/(tabs)/games/[gameId]` — game detail with ScoreHeader, OddsDisplay, WatchNowButton, wager section (with bet slip scan and manual entry), MarketPrices (Kalshi + Polymarket positions), game info card

**Alerts Tab:**
- `/(tabs)/alerts/index` — alert feed with rich AlertCards, pull-to-refresh, real-time subscription for new alerts

**Connections Tab:**
- `/(tabs)/connections/index` — connection categories (streaming, TV, sportsbooks, prediction markets) with connected count badges
- `/(tabs)/connections/streaming` — streaming provider toggles
- `/(tabs)/connections/tv-provider` — TV provider toggles
- `/(tabs)/connections/sportsbooks` — sportsbook provider toggles
- `/(tabs)/connections/prediction-markets` — Kalshi + Polymarket connection status, position lists, P&L
- `/(tabs)/connections/kalshi-connect` — Kalshi API key wizard
- `/(tabs)/connections/polymarket-connect` — Polymarket wallet wizard

**Profile Tab:**
- `/(tabs)/profile/index` — user avatar, name, email, wagering stats, preferences link, push toggle, ad personalization toggle, timezone, version, data attribution, privacy/terms links, sign out, delete account

**Key Modal Components:**
- `AddWagerSheet` — manual wager entry form (sportsbook, market type, description, line, odds, stake, parlay legs)
- `ReviewScannedWagersSheet` — bet slip OCR results review
- `ReviewEmailWagersSheet` — email-parsed wager review
- `PreferencesSheet` — favorite teams, quiet hours, alert limits, notification channels

**Advertiser Portal (web/):**
- `/auth/login`, `/auth/signup`, `/auth/forgot-password`, `/auth/reset-password`
- `/dashboard` — advertiser overview
- `/campaigns` — campaign list, `/campaigns/new` — create campaign
- `/campaigns/[id]` — campaign detail, bidding, creatives, targeting, reporting sub-pages
- `/billing` — wallet balance, deposit history, Stripe checkout
- `/inventory` — supply forecasts
- `/reporting` — aggregate reporting
- `/settings` — account settings
- `/onboarding` — new advertiser setup
- `/cmo` — social content calendar and approval
- `/admin/dashboard` — admin overview
- `/admin/advertisers` — advertiser management
- `/admin/campaigns` — campaign management
- `/admin/fraud` — fraud event review
- `/admin/revenue` — revenue dashboard
- `/admin/users` — user management
- `/admin/auction-engine` — auction configuration
