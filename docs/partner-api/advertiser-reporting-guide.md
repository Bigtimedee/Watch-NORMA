# NORMA Advertiser Reporting Guide

This guide covers every way an advertiser can pull performance data from the NORMA reporting API, export raw daily data as a CSV file, configure a budget webhook, and correctly interpret attribution metrics.

---

## 1. Authentication

All reporting endpoints require a Bearer token issued by Supabase Auth for your advertiser account.

```
Authorization: Bearer <your-supabase-access-token>
```

Every request is scoped to the authenticated advertiser. You can only access campaigns that belong to your advertiser record. Attempting to query another advertiser's campaign returns `404 Campaign not found`.

---

## 2. POST Reporting API (JSON)

**Endpoint:** `POST /functions/v1/reporting-api`

**Content-Type:** `application/json`

This endpoint returns aggregated campaign metrics as JSON. Use it for dashboards, automated monitoring, and any integration that prefers structured data over CSV.

### 2.1 Overview Report

Returns a summary row for every campaign belonging to your advertiser account.

**Request body:**
```json
{
  "report_type": "overview"
}
```

**Response:** `{ "campaigns": [ ...rows from advertiser_reporting view... ] }`

Each row includes total impressions, taps, conversions, and spend across the full campaign lifetime.

### 2.2 Campaign Detail Report

Returns full metrics for a single campaign: lifetime summary, daily breakdown, conversion funnel, and conversions by type.

**Request body:**
```json
{
  "report_type": "campaign_detail",
  "campaign_id": 42
}
```

**Response:**
```json
{
  "metrics": { ...lifetime totals from advertiser_reporting view... },
  "daily": [ ...rows from get_campaign_daily_stats RPC... ],
  "funnel": {
    "delivered": 10000,
    "seen": 8200,
    "tapped": 430,
    "converted": 87
  },
  "conversions_by_type": {
    "cta_tap": 52,
    "sportsbook_open": 28,
    "app_return": 7
  }
}
```

Note: `daily` rows are subject to a minimum cohort size enforced by the `get_campaign_daily_stats` Postgres function. Days with fewer than the minimum number of impressions are suppressed for user privacy.

### 2.3 Creative Performance Report

Returns per-creative-variant impression counts, tap counts, and CTR. Use this to compare A/B variants and pause underperformers.

**Request body:**
```json
{
  "report_type": "creative_performance",
  "campaign_id": 42
}
```

### 2.4 Attribution Report

Returns the full attribution picture for a campaign: click-through vs view-through conversions, CPA, and a breakdown by conversion type with an explicit inferred/verified flag.

**Request body:**
```json
{
  "report_type": "attribution",
  "campaign_id": 42
}
```

See Section 5 for a detailed explanation of how to interpret the attribution data.

### 2.5 Supply Forecast

Returns NORMA's predicted ad supply (impressions available) by date and moment type. Use this during campaign planning to choose date ranges and moment targeting.

**Request body:**
```json
{
  "report_type": "supply_forecast",
  "date_from": "2026-07-01",
  "date_to": "2026-07-31"
}
```

---

## 3. GET /export CSV Format

**Endpoint:** `GET /functions/v1/reporting-api/export`

**Query parameters:**

| Parameter | Required | Format | Description |
|---|---|---|---|
| `campaign_id` | Yes | integer | The campaign to export data for |
| `start` | Yes | `YYYY-MM-DD` | First day of the export window (UTC) |
| `end` | Yes | `YYYY-MM-DD` | Last day of the export window (UTC) |
| `format` | No | `csv` | Reserved for future formats; currently always returns CSV |

**Example request:**
```
GET /functions/v1/reporting-api/export?campaign_id=42&start=2026-06-01&end=2026-06-30
Authorization: Bearer <token>
```

**Response headers:**
```
Content-Type: text/csv
Content-Disposition: attachment; filename="norma-campaign-42-2026-06-01-2026-06-30.csv"
```

**CSV columns:**

| Column | Description |
|---|---|
| `Date` | Calendar day in UTC (`YYYY-MM-DD`) |
| `Impressions` | Number of ad impressions delivered on this day |
| `Clicks` | Number of impressions where the user tapped the ad |
| `CTR (%)` | Click-through rate: `(Clicks / Impressions) * 100`, two decimal places |
| `Spend (cents)` | Total clearing price paid for all impressions on this day, in US cents |
| `Attributed Conversions` | Conversions attributed to impressions on this day (see Section 5) |
| `CPA (cents)` | Cost per attributed conversion: `Spend (cents) / Attributed Conversions`. Blank if zero conversions |

**Example rows:**
```
Date,Impressions,Clicks,CTR (%),Spend (cents),Attributed Conversions,CPA (cents)
2026-06-01,1240,63,5.08,31000,12,2583
2026-06-02,980,41,4.18,24500,8,3062
2026-06-03,1105,58,5.25,27625,14,1973
```

**Importing into Excel or Google Sheets:**

Open the CSV directly in Excel (`File > Open`) or import it into Google Sheets (`File > Import`). The column headers are human-readable and the date column is formatted as plain text (`YYYY-MM-DD`) so it will not be misinterpreted as a date serial in any locale.

---

## 4. Budget Webhook

### 4.1 Setup

Add a `webhook_url` to your campaign. This is a one-time field update via the NORMA Campaign API:

```
PATCH /functions/v1/campaigns/<campaign_id>
Content-Type: application/json
Authorization: Bearer <token>

{ "webhook_url": "https://your-server.example.com/norma-budget-alert" }
```

Alternatively, set `webhook_url` when creating the campaign.

The URL must be HTTPS. HTTP endpoints are rejected. NORMA makes a single POST to this URL; it does not retry on failure. Your endpoint should respond with HTTP 200 within 5 seconds.

### 4.2 When the Webhook Fires

The webhook fires once per day when a campaign's cumulative daily spend reaches 80% of its `daily_budget_cents` value. It does not fire again on the same calendar day once it has already fired for that threshold.

The 80% threshold is designed to give you time to top up your wallet balance or temporarily pause creative variants before the budget is exhausted and ad delivery stops.

### 4.3 Payload

```json
{
  "event": "budget_threshold",
  "threshold_pct": 80,
  "campaign_id": 42,
  "spend_cents": 8000,
  "budget_cents": 10000,
  "timestamp": "2026-06-18T14:32:11.000Z"
}
```

| Field | Description |
|---|---|
| `event` | Always `"budget_threshold"` for this webhook type |
| `threshold_pct` | The threshold that was crossed (currently always `80`) |
| `campaign_id` | Your campaign's integer ID |
| `spend_cents` | Daily spend in US cents at the moment the threshold was crossed |
| `budget_cents` | Your `daily_budget_cents` setting at the time of firing |
| `timestamp` | ISO 8601 UTC timestamp when the threshold was crossed |

### 4.4 Recommended Response Actions

- Top up your wallet balance via the NORMA dashboard if you want delivery to continue through the rest of the day.
- Use the attribution and creative performance reports to decide whether the spend so far has met your ROAS target. If not, you may prefer to let the daily cap be reached and reduce the budget for tomorrow.
- If you receive this webhook consistently within the first few hours of the day, your `daily_budget_cents` is likely too low for the supply available. Consider increasing it.

---

## 5. Interpreting Attribution Metrics

### 5.1 Attribution Window

NORMA uses a 30-minute post-impression attribution window. A conversion is attributed to an impression if the conversion action occurred within 30 minutes of the impression being delivered to the user.

This is a last-touch, click-through or view-through model: any conversion within the window is attributed regardless of whether the user tapped the ad.

### 5.2 Inferred vs Verified Conversions

NORMA is a mobile push-notification app. It can observe actions that happen inside the NORMA app with certainty. It cannot observe actions that happen in third-party apps (sportsbooks, streaming services) after a deep link is opened.

| Conversion Type | Verification Status | What It Means |
|---|---|---|
| `cta_tap` | **App-verified** | User tapped the ad's call-to-action inside NORMA |
| `app_return` | **App-verified** | User returned to the NORMA app after following a deep link |
| `sportsbook_open` | **Inferred** | NORMA successfully opened the sportsbook app via deep link, but cannot confirm the user placed a bet |
| `stream_open` | **Inferred** | NORMA opened the streaming app, but cannot confirm the user watched the game |
| `wager_placed` | **Verified (S2S only)** | Available only for partners who send a server-to-server postback to NORMA; see Section 5.3 |

The attribution report explicitly labels every conversion type with `is_inferred: true` or `is_inferred: false`. Any dashboard or integration you build should surface this distinction. NORMA will never aggregate inferred and verified conversions into a single "conversion" metric without a label.

### 5.3 Server-to-Server (S2S) Postback

For sportsbook partners who want verified wager conversion tracking, NORMA supports an S2S postback endpoint. When a user follows a NORMA deep link and completes a qualifying action (account creation, first deposit, wager placement), the partner server calls the NORMA postback URL with a click token.

S2S postback integration is available to partners under a data-sharing agreement. Contact NORMA partnerships to set this up. S2S conversions appear as `wager_placed` with `is_inferred: false` in the attribution report.

### 5.4 How CTR Is Calculated

CTR is the percentage of delivered impressions that received a tap:

```
CTR = (tapped impressions / total impressions) * 100
```

A "tapped impression" is any impression row where `tapped_at` is not null. This records the moment the user tapped anywhere on the ad unit inside the NORMA notification card.

### 5.5 How CPA Is Calculated

CPA (cost per attributed conversion) is calculated as:

```
CPA = total spend in period / total attributed conversions in period
```

Spend is the sum of `clearing_price_cents` for all impressions in the period. Conversions are attributed using the 30-minute window described in Section 5.1.

In the CSV export, CPA is calculated per calendar day. In the attribution JSON report, CPA is calculated across the full campaign lifetime of the query.

A blank CPA field in the CSV means zero attributed conversions were recorded on that day. It does not mean your ads are not working — it may simply mean the attribution window for that day's impressions has not yet closed (if querying intraday data) or that users converted via an inferred channel that is not yet connected via S2S.

---

## 6. Rate Limits and Best Practices

- The reporting API does not have a published per-minute rate limit, but it runs on Supabase Edge Functions. Avoid polling more than once per minute for any single report type.
- For automated daily reporting, schedule your export job to run after midnight UTC to ensure all impression and conversion records for the previous day are fully written.
- Attribution conversions can arrive up to 30 minutes after the impression, so a day's CPA will not be final until 00:30 UTC the following day.
- The CSV export streams directly from the `impressions` table. Very large date ranges (more than 90 days) for high-volume campaigns may be slow. For long-range analysis, prefer to export month-by-month.
