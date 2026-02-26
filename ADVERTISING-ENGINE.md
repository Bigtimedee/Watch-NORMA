# NORMA Advertising Engine

## Executive Summary

NORMA operates a real-time, second-price (Vickrey) ad auction engine purpose-built for push notification inventory. Unlike display ad networks that optimize for impressions on static pages, NORMA's engine is designed around **live sporting moments** — dynamic, time-sensitive events where user attention is at its peak.

The engine runs an 11-step auction pipeline in under 50ms, incorporating dynamic floor pricing, category exclusivity, budget pacing, and Thompson Sampling creative optimization. Every component is designed to maximize revenue per notification while preserving user experience through fatigue controls, frequency caps, and intelligent throttling.

**What makes it different from incumbents:**
- **Inventory is a push notification**, not a banner or interstitial — 95%+ viewability vs. ~50% industry average
- **Contextual pricing**: floor prices adjust in real time based on the sporting moment (tournament, late-game, overtime)
- **Second-price auction** incentivizes truthful bidding — advertisers always bid their true value
- **Thompson Sampling** continuously optimizes which creative variant is shown, without manual A/B test management
- **Daily floor optimizer** automatically tunes pricing using a feedback loop, with guardrails to prevent over-correction

---

## The Ad Unit

NORMA's ad inventory is a **push notification**. When a scoreable moment occurs during a live game (close game, lead change, final minutes, overtime), NORMA sends a notification to relevant users. Advertising is embedded within these high-attention moments.

Key properties of the ad unit:
- **Viewability**: Push notifications appear on the lock screen and notification center — 95%+ viewability rate
- **Engagement**: Users who open the notification have actively chosen to engage — no accidental clicks
- **Contextual relevance**: Ads are delivered alongside live game moments the user cares about
- **Scarcity**: Limited inventory (max 3 ads per user per day) creates natural price pressure
- **Measurability**: Every impression, view, and tap is tracked with full attribution

---

## Auction Pipeline

Every ad-eligible moment runs through this 11-step pipeline:

### Step 1: Moment Fires
A scoreable moment occurs (game start, close game, lead change, final minutes, overtime, etc.). The alert engine identifies this as an ad-eligible event.

### Step 2: Fatigue Check
Has this user received an ad in the last 30 minutes? If yes, skip. Prevents notification fatigue while preserving ad quality.

### Step 3: Frequency Caps
- Per-campaign cap: max 1 impression per user per campaign per 24 hours
- Per-user cap: max 3 ad impressions per day across all campaigns

### Step 4: Floor Price + Dynamic Premium
Look up the base floor for this moment type, then apply dynamic premium multipliers based on context (see [Dynamic Floor Pricing](#dynamic-floor-pricing)).

### Step 5: Eligible Bids
Filter to bids where `effective_bid >= floor_price`. Campaigns with insufficient budget or exhausted daily caps are excluded.

### Step 6: Direct Deal Check
If a direct deal (guaranteed-delivery contract) exists for this moment type and hasn't hit its cap, it wins automatically at the contracted rate.

### Step 7: Category Exclusivity
Only one advertiser per category (e.g., one sportsbook, one beer brand) per notification. If two sportsbooks bid, only the higher bidder proceeds.

### Step 8: Budget Pacing
Check each campaign's daily budget and hourly throttle. If a campaign has spent >110% of its hourly ideal pace, temporarily exclude it to spread delivery evenly across the day.

### Step 9: Rank by Effective Bid Value
Sort remaining bids by:
```
effective_bid_value = base_bid × game_relevance_boost × creative_performance_boost × segment_match_boost
```

### Step 10: Second-Price Clearing
Winner pays $0.01 above the second-highest bid (Vickrey auction). This incentivizes truthful bidding — advertisers always bid their true value.

### Step 11: Creative Selection (Thompson Sampling)
The winning campaign may have multiple creative variants. Thompson Sampling (multi-armed bandit) selects which variant to show, balancing exploration and exploitation. See [Creative Optimization](#creative-optimization-thompson-sampling).

---

## Second-Price Clearing

NORMA uses a **Vickrey (second-price) auction**. The highest bidder wins but pays only $0.01 above the second-highest bid. This mechanism is **incentive-compatible**: the dominant strategy for every advertiser is to bid their true willingness-to-pay.

### Effective Bid Value Modifiers

Raw bids are adjusted by contextual modifiers before ranking:

| Modifier | Boost | Description |
|----------|-------|-------------|
| Game-Specific Targeting | 1.2x | Campaign targets this specific game or team |
| Creative Performance | up to 1.1x | Based on historical CTR of the selected creative variant |
| Segment Match | 1.15x | User matches the campaign's target audience segment |

### Worked Example: 4-Bidder Auction

| Bidder | Base Bid | Modifiers | Effective Bid |
|--------|----------|-----------|---------------|
| DraftKings | $0.35 | 1.2x game × 1.15x segment | **$0.483** |
| FanDuel | $0.40 | 1.05x creative | $0.420 |
| BetMGM | $0.28 | none | $0.280 |
| ESPN Bet | $0.22 | 1.1x creative | $0.242 |

**Winner**: DraftKings (highest effective bid: $0.483)
**Clearing price**: $0.421 (second-highest bid $0.420 + $0.01)

DraftKings bid $0.483 but only pays $0.421 — saving $0.062 per impression. This savings is the mechanism that incentivizes truthful bidding.

---

## Dynamic Floor Pricing

Floor prices are set per moment type and adjusted dynamically based on context.

### Base Floors

Each moment type has a base floor price stored in the `floor_prices` table:

| Moment Type | Typical Base Floor |
|-------------|-------------------|
| game_start | $0.10 |
| close_game | $0.15 |
| lead_change | $0.12 |
| final_minutes | $0.20 |
| overtime | $0.25 |
| halftime | $0.08 |

### Dynamic Premium Multipliers

Applied at auction time based on context:

| Condition | Multiplier | Rationale |
|-----------|------------|-----------|
| NCAA Tournament game | 1.5x | Peak audience engagement and attention |
| Weekend (Sat/Sun) | 1.2x | Higher concurrent viewership |
| 10+ live games simultaneously | 1.3x | High-density moments are premium inventory |
| Late-game or OT (< 2 min, margin ≤ 6) | 1.5x | Maximum user attention and emotional engagement |

Premiums **stack multiplicatively**. Example:

```
Moment type: "close_game" → base floor = $0.15
Context: NCAA Tournament, Saturday, late-game

Effective floor = $0.15 × 1.5 (tournament) × 1.2 (weekend) × 1.5 (late-game)
               = $0.405 → rounded to $0.41
```

---

## Floor Price Optimizer

A daily feedback loop that automatically tunes floor prices based on observed market dynamics.

### Schedule
Runs daily at **3:00 AM ET**, after the previous day's games have concluded.

### Decision Matrix

| Clearing Ratio | Fill Rate | Trend | Adjustment | Rationale |
|---------------|-----------|-------|------------|-----------|
| High (>80%) | High (>70%) | Stable/Up | +5% to +10% | Demand exceeds supply — room to raise |
| High (>80%) | Low (<40%) | Down | -5% to -10% | Bids clear but inventory goes unfilled |
| Low (<50%) | High (>70%) | Stable | No change | Market is balanced |
| Low (<50%) | Low (<40%) | Down | -10% | Floors too high — suppressing demand |
| Medium | Medium | Up | +5% | Gradual increase while market grows |

### Guardrails

- **Max single-day increase**: +20%
- **Max single-day decrease**: -10%
- **Absolute floor range**: $0.05 – $2.00
- **Minimum sample size**: 50 auctions per moment type before adjusting

### Audit Trail

Every floor price change is logged to the `floor_price_history` table with:
- Previous value, new value, and percentage change
- The reason for the adjustment
- Timestamp and triggering metrics (clearing ratio, fill rate, trend)

---

## Creative Optimization: Thompson Sampling

NORMA uses **Thompson Sampling**, a multi-armed bandit algorithm, to optimize which creative variant is shown for each winning campaign.

### How It Works

Each creative variant is modeled as a **Beta distribution**:
```
alpha = taps + 1
beta  = (impressions - taps) + 1
```

At auction time, we draw a random sample from each variant's Beta distribution and select the variant with the highest sample. This naturally balances **exploration** (trying variants with uncertain performance) and **exploitation** (favoring variants with proven performance).

### Exploration Phase (First 100 Impressions per Variant)
Each creative gets roughly equal traffic. We're gathering data to estimate true performance.

```
Variant A: 34 impressions, 5 taps  → Beta(6, 30)
Variant B: 33 impressions, 8 taps  → Beta(9, 26)
Variant C: 33 impressions, 3 taps  → Beta(4, 31)
```

### Exploitation Phase (100+ Impressions per Variant)
Traffic shifts toward the best performer, but never fully stops exploring (handles changing user preferences).

```
Variant A:   412 impressions,  61 taps (14.8%) → Beta(62, 352)
Variant B: 1,847 impressions, 389 taps (21.1%) → Beta(390, 1459)  ← winner
Variant C:   241 impressions,  22 taps  (9.1%) → Beta(23, 220)
```

### Why Thompson Sampling Over A/B Testing

| | A/B Testing | Thompson Sampling |
|---|-------------|-------------------|
| Traffic allocation | Fixed 50/50 (or N-way split) | Dynamic, shifts to winner |
| Waste | Sends traffic to losing variants for entire test | Minimizes regret automatically |
| Stopping rule | Requires manual significance calculation | Self-optimizing, no manual intervention |
| Adapts to change | Must restart test | Continuously adapts |
| Multiple variants | Complex multi-arm test design | Handles N variants natively |

---

## Auto-Bidding

Advertisers can opt into automated bidding strategies instead of setting manual bids.

### Target CPA Strategy

Advertiser sets a target cost-per-action (e.g., $2.50 per tap). The system adjusts bids based on observed vs target CPA:

```
observed_cpa = total_spend / total_conversions

if observed_cpa > target_cpa:
    bid *= 0.9   # lower by 10% — we're overpaying
if observed_cpa < target_cpa:
    bid *= 1.1   # raise by 10% — room to bid more aggressively
```

Adjustments are capped at ±10% per auction cycle to prevent instability.

### Maximize Impressions Strategy

Bid at exactly the floor price to win as many auctions as possible at the lowest cost:

```
bid = floor_price + $0.01
```

Best for brand awareness campaigns where volume matters more than targeting precision. Always wins if no competition, pays the minimum possible price.

---

## Budget Pacing

Campaigns have daily budgets that must be spread evenly across available inventory.

### Daily Cap
Each campaign sets a daily budget (e.g., $500/day). Once the cap is reached, the campaign is excluded from all remaining auctions that day.

### Hourly Throttle
To prevent front-loading spend in the morning:

```
hourly_ideal_pace = daily_budget / hours_remaining_in_day
hourly_actual_spend = sum of clearing prices in current hour

if hourly_actual_spend > hourly_ideal_pace × 1.1:
    temporarily exclude campaign (check again next hour)
```

This ensures campaigns don't exhaust their budget during early games and miss high-value evening inventory.

---

## Competitive Differentiation

| Feature | NORMA | Google Ads | Meta Ads | The Trade Desk |
|---------|-------|------------|----------|----------------|
| **Ad unit** | Push notification | Display/Search/Video | Feed/Stories/Reels | Display/Video/CTV |
| **Viewability** | 95%+ | ~50% display | ~70% feed | ~60% display |
| **Auction type** | Second-price (Vickrey) | First-price | First-price | First-price |
| **Bidding incentive** | Truthful bidding | Bid shading required | Bid shading required | Bid shading required |
| **Contextual pricing** | Real-time moment-based | Keyword/audience | Interest/behavior | Audience segments |
| **Creative optimization** | Thompson Sampling (automatic) | Manual A/B + Smart Bidding | Dynamic Creative (rule-based) | Manual A/B |
| **Floor pricing** | Daily auto-optimizer | Publisher-set | Platform-set | Publisher-set |
| **Category exclusivity** | Built-in (1 per category) | Not available | Not available | Publisher-managed |
| **Frequency cap** | 3/day hard cap | Configurable | Configurable | Configurable |
| **Inventory scarcity** | Natural (live moments only) | Abundant | Abundant | Abundant |

### Key Advantages

1. **Scarcity drives value**: Limited inventory (live sports moments only) creates natural price pressure — no race to the bottom
2. **Truthful bidding**: Second-price auction means advertisers don't need bid shading algorithms — they just bid their true value
3. **95%+ viewability**: Push notifications are seen, not scrolled past
4. **Zero fraud surface**: No bots viewing push notifications — every impression is a real device, real user
5. **Built-in exclusivity**: Category exclusivity prevents competitor ads from appearing together

---

## Key Constants

| Constant | Value | Description |
|----------|-------|-------------|
| Max ads per user per day | 3 | Hard frequency cap across all campaigns |
| Max impressions per campaign per user per 24h | 1 | Per-campaign frequency cap |
| Ad fatigue cooldown | 30 minutes | Minimum gap between ad notifications for a user |
| Category exclusivity window | Per notification | Only 1 advertiser per category per notification |
| Thompson Sampling exploration threshold | 100 impressions | Per variant before shifting to exploitation |
| Floor price min | $0.05 | Absolute minimum floor |
| Floor price max | $2.00 | Absolute maximum floor |
| Floor optimizer max daily increase | +20% | Guardrail on upward adjustment |
| Floor optimizer max daily decrease | -10% | Guardrail on downward adjustment |
| Floor optimizer min sample size | 50 auctions | Per moment type before adjusting |
| Auto-bid adjustment cap | ±10% | Per auction cycle |
| Budget pacing overspend threshold | 110% | Of hourly ideal pace before throttling |
| Second-price increment | $0.01 | Added to second-highest bid for clearing price |
| Bid value boost: game-specific | 1.2x | Campaign targets specific game/team |
| Bid value boost: creative performance | up to 1.1x | Based on historical CTR |
| Bid value boost: segment match | 1.15x | User matches target audience |
| Dynamic premium: tournament | 1.5x | NCAA Tournament games |
| Dynamic premium: weekend | 1.2x | Saturday and Sunday |
| Dynamic premium: high density | 1.3x | 10+ simultaneous live games |
| Dynamic premium: late-game/OT | 1.5x | < 2 min remaining, margin ≤ 6 |
