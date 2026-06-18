# NORMA Programmatic Intent API — Reference

**Base URL:** `https://kbqybsrnlmhpxskvhftd.supabase.co/functions/v1/intent-api`
**Version:** v1
**Status:** Live (requires `INTENT_API_ENABLED=true` secret)
**Contact:** bd@norma-app.com

---

## Authentication

All requests require a Bearer token issued from the `api_keys` table.

```http
Authorization: Bearer <your_api_key>
```

Keys are SHA-256 hashed at rest. The raw key is shown once at issuance and never stored. To provision a key, see the seed instructions in `supabase/migrations/079_api_keys.sql`.

**Scopes:**

| Scope | Grants |
|-------|--------|
| `inventory:read` | GET /inventory |
| `bid:write` | POST /bid |

Default keys include both scopes.

---

## Rate Limits

- **50 requests per minute** per API key (in-memory window, resets on Edge Function cold start)
- Exceeded: HTTP 429 with `retry_after_seconds: 60`

---

## Endpoints

### GET /inventory

Returns a 7-day supply forecast by moment type and league, joined with floor prices. No user data is returned — aggregate only.

**Request**

```http
GET /inventory
Authorization: Bearer <key>
```

No query parameters required. Returns forecasts from today through the next 7 days.

**Response**

```json
{
  "api_version": "v1",
  "inventory": [
    {
      "forecast_date": "2026-06-18",
      "moment_type": "spread_alert",
      "league": "ncaa_basketball",
      "predicted_moments": 1420,
      "predicted_moments_low": 1180,
      "predicted_moments_high": 1660,
      "floor_cents": 30,
      "basis_note": "14 games scheduled; spread alert rate 101/game (90d avg)"
    }
  ]
}
```

**Response fields**

| Field | Type | Description |
|-------|------|-------------|
| `forecast_date` | string (YYYY-MM-DD) | Calendar date of the forecast |
| `moment_type` | string | One of the 11 NORMA moment types |
| `league` | string | `ncaa_basketball`, `nba`, `mlb`, etc. |
| `predicted_moments` | integer | Expected impression opportunities |
| `predicted_moments_low` | integer | 10th-percentile estimate |
| `predicted_moments_high` | integer | 90th-percentile estimate |
| `floor_cents` | integer | Minimum bid in cents (e.g. `30` = $0.30 CPM) |
| `basis_note` | string | Human-readable explanation of the forecast basis |

---

### POST /bid

Submits or updates a bid for a specific campaign and moment type. Bids enter the existing second-price Vickrey auction identically to manual bids — no separate programmatic pathway.

**Request**

```http
POST /bid
Authorization: Bearer <key>
Content-Type: application/json

{
  "campaign_id": 42,
  "moment_type": "spread_alert",
  "bid_cents": 38
}
```

**Request fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `campaign_id` | integer | Yes | ID of the campaign to bid for (must belong to your advertiser account) |
| `moment_type` | string | Yes | Moment type to bid on (must match a value in `floor_prices`) |
| `bid_cents` | integer | Yes | Bid amount in cents (min: floor for the moment type; max: 500) |

**Validation rules**

- `campaign_id` must belong to the advertiser account associated with the API key
- Campaign `status` must be `active`
- Campaign must have at least one creative
- `bid_cents` must be ≥ floor for the requested `moment_type`
- `bid_cents` must be ≤ 500 (= $5.00 CPM maximum)
- Bids are upserted: calling POST /bid again with the same `campaign_id` + `moment_type` updates the existing bid

**Response (success)**

```json
{
  "accepted": true,
  "bid_id": 1891,
  "clearing_note": "Bid enters existing second-price Vickrey auction. You pay at most $0.01 above the second-highest bid. Clearing logic is unchanged.",
  "api_version": "v1"
}
```

**Response (failure)**

```json
{
  "error": "Bid (20c) is below floor for spread_alert (30c)"
}
```

---

## Error Codes

| HTTP Status | Meaning |
|-------------|---------|
| 400 | Missing required field (`campaign_id`, `moment_type`, or `bid_cents`) |
| 401 | Missing, invalid, or revoked API key |
| 403 | API key lacks required scope (`bid:write`) |
| 404 | Campaign not found or not owned by this advertiser |
| 422 | Bid below floor, bid above maximum, campaign inactive, or no creative |
| 429 | Rate limit exceeded (50 req/min) |
| 503 | `INTENT_API_ENABLED` secret not set — API not active |
| 500 | Internal server error (details logged to Supabase Edge Function logs) |

---

## Moment Types and Floor Prices

| Moment Type | Floor CPM | Description |
|-------------|-----------|-------------|
| `prediction_resolved` | $0.60 | Prediction market position resolves |
| `bet_resolved` | $0.50 | Active wager settles (win/loss/push) |
| `overtime` | $0.40 | Game enters overtime |
| `close_game` | $0.35 | 1-possession margin in final minutes |
| `spread_alert` | $0.30 | Score crosses user's spread line |
| `moneyline_alert` | $0.30 | Momentum shift puts moneyline at risk |
| `total_alert` | $0.25 | Scoring pace approaches over/under line |
| `prop_alert` | $0.25 | Player prop approaching its line |
| `position_alert` | $0.20 | Prediction position changes significantly |
| `foul_trouble` | $0.15 | Key starter at 4 fouls |
| `follow_alert` | $0.10 | Notable moment for a followed team/player |

---

## Enabling the API (Internal)

Set the Supabase secret in the production project:

```bash
supabase secrets set INTENT_API_ENABLED=true --project-ref <project_ref>
```

To disable and return to 503:

```bash
supabase secrets set INTENT_API_ENABLED=false --project-ref <project_ref>
```

---

## Auction Mechanics

Programmatic bids enter NORMA's second-price Vickrey auction identically to bids placed via the advertiser portal. There is no separate programmatic pathway or pricing tier. The clearing price is always $0.01 above the second-highest bid, and is never higher than the winning bid.

Geo-compliance rules apply to all bids: sportsbook campaigns are filtered by state-level sports betting legality at impression time, not at bid time. A winning bid in an ineligible state is skipped; the next eligible bid wins at the same clearing price.
