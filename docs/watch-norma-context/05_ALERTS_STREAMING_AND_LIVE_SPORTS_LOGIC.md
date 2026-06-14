# 05 — Alerts, Streaming, and Live Sports Logic

## Alert Philosophy

Watch-NORMA should send fewer, better alerts. The app must not become notification spam. Every alert must be timely, personally relevant, explainable, and actionable.

An alert should answer three questions: "Why should I care?", "What's happening?", and "Where can I watch?" If it cannot answer at least the first two, it should not be sent.

The alert engine uses a scoring system with a threshold to ensure only high-relevance moments generate notifications. This means most game moments produce no alert at all — that is by design. The user should trust that when NORMA sends a notification, it matters.

## Alert Types

The following alert types are implemented in `evaluate-alerts/logic.ts`:

**Basketball (NCAA + NBA):**
- `close_game` — margin ≤ 6 in the second half
- `comeback` — team that was down by 10+ now within 3
- `spread_alert` — user's spread wager is near the line
- `total_alert` — combined score approaching the over/under line
- `moneyline_alert` — underdog leading late / favorite trailing
- `player_prop` — player stat approaching a prop threshold (proximity-based)
- `foul_trouble` — starter with 4+ fouls
- `overtime` — overtime period begins
- `game_resolved` — game is final (bet resolved)
- `prediction_resolved` — prediction market position settled
- `nba_close_game` — NBA-specific close-game rules

**MLB-specific:**
- `mlb_close_game` — margin ≤ 2 in the 7th inning or later
- `mlb_scoring_threat` — runners in scoring position with < 2 outs in a close game
- `mlb_no_hitter` — no-hitter in progress through 6+ innings
- `mlb_pitcher_limit` — starting pitcher at high pitch count
- `mlb_walk_off` — walk-off opportunity (home team trailing/tied in 9th+)
- `mlb_run_line` — MLB run line wager proximity

**Must-notify rules** (fire immediately regardless of score threshold):
- Game final (bet resolved or prediction resolved)
- Overtime starts
- 1-possession game (margin ≤ 3) with under 2:00 remaining
- Star player picks up 4th foul (starter with ≥ 12 ppg average)

## Relevance Engine

The alert engine runs as a 4-stage pipeline inside `evaluate-alerts/index.ts`, using shared modules from `_shared/alert-scoring.ts`.

### Stage 0: Candidate Generation

For each active game, the engine queries:
- All users who follow a team or player in the game
- All users with open wagers mapped to the game
- All users with open prediction-market positions mapped to the game

Each candidate carries context: which follows, wagers, and positions connect them to this game.

### Stage 1: Signal Extraction

For each (user, game) pair, `extractSignals()` builds a `SignalVector`:

- **Game state signals:** margin (absolute score difference), clock_minutes, period, is_close_game (margin ≤ 6 in 2nd half), is_final_minutes (under 2:00 in 2nd half), lead_changes_recent (from PBP events)
- **Summary signals:** home_biggest_lead, away_biggest_lead, bench_points_delta, efg_delta (effective FG% difference), turnovers_delta, foul_trouble array
- **Proximity signals:** For each wager/position, `computeProximity()` evaluates how close the user's bet is to resolving — returning a ProximityLevel (NONE, LOW, MEDIUM, HIGH, RESOLVED) with current_value, target_value, pct_complete, trend, and time_pressure
- **User relevance signals:** follows_team, follows_player_on_court, has_wager, wager_is_covering, wager_type, has_position

### Stage 2: Scoring + Rule Evaluation

`computeScore()` applies weighted scoring:

| Signal | Weight |
|--------|--------|
| User has wager on this game | +30 |
| Wager line is being crossed (HIGH proximity) | +25 |
| Close game (margin ≤ 6, 2nd half) | +20 |
| User follows a team playing | +15 |
| Final 5 minutes | +10 |
| Lead change in last 3 minutes | +10 |
| Foul trouble (4+ fouls, starter) | +8 |
| Bench points swing (≥ 10) | +5 |
| eFG% divergence (≥ 10%) | +5 |
| User follows player on court | +5 |

The threshold is 40. Examples:
- Following a team + close game = 35 → no alert
- Following a team + close game + final 5 min = 45 → alert
- Wager + line being crossed = 55 → alert
- Just following a team, blowout = 15 → no alert

`checkMustNotify()` runs independently and bypasses the scoring threshold for critical moments.

`determineAlertType()` selects the most appropriate alert type label based on which signals fired.

### Stage 2b: "Why Now" Explanation

`buildWhyNow()` generates a structured explanation for every alert that passes the threshold:

- `headline` — e.g., "Your Spread Is Live", "Close Game Alert", "Overtime!"
- `bullets` — e.g., ["Duke trails by 3 with 4:12 left", "They were down 14 in the 1st half"]
- `stats_used` — e.g., `{margin: 3, clock_minutes: 4.2, biggest_lead: 14}`
- `confidence` — 0.0–1.0 (how "important" this moment is)
- `wager_impact` — only if user has a wager: `{wager_id, wager_description, status: 'covering' | 'not_covering' | 'at_risk' | 'decided'}`

### Stage 3: Throttling + Dedup

Implemented in `evaluate-alerts/index.ts` using the `alert_throttle` table:

1. **Dedup hash** — `computeDedupHash()` creates a hash from user_id, game_id, alert_type, margin_bucket (Math.floor(margin / 3)), and period. This prevents alerts for every single point scored.
2. **Hash check** — if the same hash exists in `alert_throttle` within the cooldown window, the alert is suppressed.
3. **Per-user caps** — from `user_preferences.notification_settings`:
   - `max_alerts_per_game` (default 5)
   - `max_alerts_per_hour` (default 10)
4. **Quiet hours** — if current time falls within the user's quiet hours, push is suppressed but in-app alert is still created.
5. **Cooldown** — minimum time between alerts of the same type for the same game.

### Stage 3.5: Sponsor Auction

If the alert clears throttling, the Vickrey auction engine (`_shared/auction-engine.ts`) runs to attach a contextual sponsor. The auction checks fatigue score, ad personalization preference, frequency caps, floor price, eligible bids, and runs second-price logic. If a sponsor wins, `sponsor_logo_url`, `sponsor_text`, and `sponsor_cta_url` are attached to the alert. The sponsor text may be interpolated with template variables (team name, score, etc.). The auction never delays or blocks the alert delivery.

### Stage 4: Delivery

1. Alert is inserted into `alerts` table with score, explanation (JSONB), and sponsor fields.
2. Delivery channel is determined: push + in-app (default), in-app only (quiet hours or app foregrounded).
3. `send-push` is invoked with alert ID. It validates the alert exists, checks the user has push enabled and a valid token, appends sponsor text to the notification body if present, computes the badge count (unread alerts), and sends via Expo Push API.
4. Delivery result is logged in `delivery_log` with status (sent/failed/throttled), provider_message_id, and any error detail.

## Alert Payload

Every alert stored in the database includes:

| Field | Purpose |
|-------|---------|
| `id` | Unique alert ID |
| `user_id` | Owning user |
| `game_id` | Related game |
| `type` | Alert type (close_game, spread_alert, etc.) |
| `title` | Short title text |
| `body` | Notification body text |
| `score` | Numeric relevance score |
| `explanation` | JSONB: headline, bullets, stats_used, confidence, wager_impact |
| `sport` | Sport key (ncaam, nba, mlb) |
| `read` | Whether user has seen it |
| `sponsor_logo_url` | Sponsor logo (if auction winner) |
| `sponsor_text` | Sponsor copy (if auction winner) |
| `sponsor_cta_url` | Sponsor click destination |
| `suppressed_reason` | Why the alert was throttled (if applicable) |
| `created_at` | Timestamp |

The push notification payload includes the alert title, body (with sponsor text appended if present), badge count, and `data: { gameId }` for deep-link navigation.

## Streaming Routing Rules

These are non-negotiable product rules:

1. **Never send a watch alert without attempting to identify where the user can watch.** If broadcast data exists and the user has a connected provider, the alert should include a "Watch on [Provider]" action.

2. **Never route an existing streaming subscriber to a generic sign-up page.** If the user has YouTube TV connected and taps "Watch on YouTube TV," the app must open the YouTube TV app or its watch URL — not `https://tv.youtube.com/welcome` or a marketing page. The `universal_link` in `provider_registry` must point to a watch/login route.

3. **Prefer direct watch/deep link over marketing landing page.** The `ios_scheme` (native app) is always tried first. The `universal_link` is the second choice and must be a functional watch/login URL.

4. **If availability is uncertain, say so clearly.** If no broadcast data exists or no connected provider matches, do not fabricate a watch destination. The Watch button should be absent or show "Broadcast TBD."

5. **If multiple providers are available, show the best match.** `getBestWatchProvider()` selects based on the intersection of broadcast providers and connected providers. The user sees a single "Watch on [Provider]" button, not a list.

6. **If provider mapping is stale or unknown, do not fabricate certainty.** Stale broadcast data is better than wrong data, but neither should be presented as guaranteed.

7. **Log all deep-link attempts.** Every deep-link attempt is recorded in `deep_link_events` with provider, method (scheme/universal/fallback), platform, and success status. The `deep-link-health-check` function aggregates these events to detect regressions.

## Duplicate Alert Prevention

The deduplication system has multiple layers:

- **Hash-based dedup:** `computeDedupHash()` creates a key from user, game, alert type, and margin bucket. Margin is bucketed by 3 (Math.floor(margin/3)) so a score change from 5 to 4 does not trigger a new alert within the same bucket.
- **Per-game alert limit:** Default 5 per user per game. After 5 alerts, no more are sent for that game regardless of score.
- **Per-hour alert limit:** Default 10 per user per hour across all games.
- **Cooldown window:** Minimum time between same alert_type for same game (checked via `alert_throttle.created_at`).
- **Idempotent delivery:** `send-push` checks that the alert exists and has not already been delivered before sending.
- **Event ID tracking:** Game events from PBP are stored with IDs to prevent double-processing.
- **Snapshot hash dedup:** Game snapshots use `payload_hash` to prevent inserting duplicate state.

## Timing and Latency

- **Acceptable data delay:** The system tolerates up to 60 seconds of data delay from external APIs. The target is real-time alerts within 90 seconds of the actual on-court/field event.
- **Polling cadence:** Boxscores every 1 minute. Orchestrator evaluates every 1 minute. PBP every 30–60 seconds (sport-dependent). Summary every 90–120 seconds.
- **Stale alert prevention:** Alerts include game state timestamps. The client-side `timeAgo()` function shows relative time. If a push notification arrives more than 5 minutes after the moment, it may feel stale — this is a known UX concern during high-load periods.
- **Post-game alerts:** "Game resolved" and "Prediction resolved" alerts fire when the game closes. These are not time-sensitive in the same way as live alerts, so slight delays are acceptable.
- **Sportradar rate budget:** During high-density periods (e.g., March Madness with 30+ simultaneous games), the orchestrator may delay lower-priority PBP polls to stay within the Sportradar rate limit. This can increase latency for some games.

## Test Cases

Future agents working on alert or streaming logic must verify:

1. Alert is personally relevant — a user with no follows, wagers, or positions for a game should never receive an alert for it.
2. Alert includes a structured "Why Now" explanation with at least a headline and one bullet.
3. Alert routes to the correct provider — if the user has YouTube TV connected and the game is on ESPN (carried by YouTube TV), the Watch button should say "Watch on YouTube TV."
4. YouTube TV routing does not regress — the universal link must not point to a marketing/sign-up page. See migrations 052–054. The `verify-provider-links` cron (migration 069) automatically detects this class of regression every 6 hours.
5. Duplicate alerts are suppressed — changing the score by 1 point should not trigger a new alert if the margin bucket hasn't changed.
6. Stale alerts are not sent — if a game has already ended, no further live alerts should be generated (game_resolved is the final alert).
7. Quiet hours are respected — push notifications are suppressed during quiet hours; in-app alerts are still created.
8. User opt-outs are respected — if push_enabled is false or notification channels are off, no push is sent.
9. Wager coverage status is accurate — if the user has Duke +3.5 and Duke trails by 3, the alert should say "covering by 0.5."
10. Must-notify rules fire for critical moments — overtime, game final, 1-possession under 2:00, star 4th foul.
11. Per-game and per-hour caps are enforced — exceeding the cap should suppress the alert with a `suppressed_reason`.
12. Sponsor attachment does not delay the alert — the auction runs synchronously but should complete in under 50ms.
