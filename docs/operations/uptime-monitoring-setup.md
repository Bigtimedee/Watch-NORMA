# NORMA Uptime Monitoring Setup

Connect the NORMA health-check endpoint to an uptime monitor so Dave gets paged when anything degrades.

---

## Health-Check Endpoint

```
https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/health-check
```

**Method:** `GET`
**Auth:** `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (required — function is not public)
**Expected response:** HTTP 200, `Content-Type: application/json`, body includes `"status": "healthy"`

---

## Option A: Better Uptime (Recommended, paid)

Better Uptime supports keyword assertions and structured alerting, which is the cleanest match for this endpoint.

### Step 1 — Create a monitor

1. Log in at [betteruptime.com](https://betteruptime.com) and go to **Monitors → New Monitor**.
2. Set the following fields:

| Field | Value |
|-------|-------|
| Monitor type | HTTP |
| URL | `https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/health-check` |
| Check frequency | **1 minute** |
| Request method | GET |
| Follow redirects | Yes |

3. Under **Request headers**, add:
   - `Authorization` → `Bearer <paste SUPABASE_SERVICE_ROLE_KEY here>`

4. Under **Confirmation before alerting**, set to **1 check** (alert immediately, no grace period).

### Step 2 — Alert conditions

Better Uptime alerts on non-200 by default. Add a keyword assertion to catch cases where the function returns 200 but the body signals a problem:

1. Go to **Advanced settings → Response assertions**.
2. Add: **Response body contains** `"status": "healthy"`.
3. Under **Alert if response time exceeds**, enter `2000` ms.

This means an alert fires when any of the following is true:
- HTTP response code is not 200
- Response body does not contain `"status": "healthy"`
- Response takes more than 2 seconds

### Step 3 — Notification channels

1. Go to **On-call → Integrations → Email**.
2. Add `dave@thed10.com` as the primary contact.
3. Optional: add a Slack webhook under **Integrations → Slack**. Enter the incoming webhook URL for the `#norma-ops` channel (or whatever channel you use for engineering alerts).

### Step 4 — Status page (optional)

Better Uptime includes a hosted status page. Under **Status Pages → New Page**, add the NORMA monitor. This gives you a shareable URL like `norma.betteruptime.com` that you can link from the public status page if desired.

---

## Option B: UptimeRobot (Free alternative)

UptimeRobot's free tier supports 50 monitors at 5-minute intervals. The paid plan ($7/month) enables 1-minute checks.

### Step 1 — Create a monitor

1. Log in at [uptimerobot.com](https://uptimerobot.com) and click **Add New Monitor**.
2. Set:

| Field | Value |
|-------|-------|
| Monitor type | HTTP(s) |
| Friendly name | NORMA Health Check |
| URL | `https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/health-check` |
| Monitoring interval | 5 minutes (free) or 1 minute (Pro) |

3. Under **Advanced settings → Custom HTTP Headers**, add:
   - Header: `Authorization`
   - Value: `Bearer <paste SUPABASE_SERVICE_ROLE_KEY here>`

### Step 2 — Alert conditions

1. Under **Keyword Monitoring**, enable **"Alert me when keyword does NOT exist"**.
2. Enter keyword: `"status": "healthy"`.

UptimeRobot will alert if the response is non-200 or the body does not include the healthy keyword.

For response time alerting on the free plan, check **Alert when response time exceeds** and set `2000` ms (available under Monitor Settings on some plans).

### Step 3 — Notification channels

1. Go to **Alert Contacts → Add Alert Contact**.
2. Select **E-mail** and enter `dave@thed10.com`.
3. For Slack: select **Slack** as the contact type and paste your incoming webhook URL.

---

## What gets alerted

| Condition | Trigger |
|-----------|---------|
| Function returns non-200 | Supabase edge runtime error or cold-start timeout |
| Body missing `"status": "healthy"` | DB query failure inside health-check |
| Response takes > 2 seconds | DB contention or slow edge region |

The health-check queries six separate Postgres tables. A response time spike usually means DB load, not a network issue.

---

## Checking alerts manually

To run a quick one-off check from the terminal:

```bash
curl -s \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/health-check \
  | jq '{status, active_games, stale: .watchers.stale_count, failed: .alert_pipeline.last_hour.failed, espn_degraded: .espn_failover.espn_degraded}'
```

Expected healthy output:

```json
{
  "status": "healthy",
  "active_games": 4,
  "stale": 0,
  "failed": 0,
  "espn_degraded": false
}
```

---

## Public status page

The NORMA web portal includes a public status page at `/status` that renders the same health-check data server-side. Link it from incident communications or your monitoring tool's escalation message.
