# Daily metrics (usage scorecard feed)

`.github/workflows/daily-metrics.yml` runs `scripts/daily-metrics.mjs` every day at
12:00 UTC (06:00 CST / 07:00 CDT) and on manual dispatch.

- **Reads only.** Queries go through the Supabase Management API read-only endpoint
  (`POST /v1/projects/{ref}/database/query/read-only`); if that endpoint is unavailable
  the script falls back to `/database/query` and refuses anything that is not a single
  `SELECT`/`WITH` statement. It never writes to the database.
- **Auth:** repo secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` (the pair the
  Edge Function deploy already uses). No service-role key.
- **Output:** the orphan branch `metrics` (never merged into `main`):
  `metrics/daily/<report_date>.json` and `metrics/latest.json`. `report_date` is
  yesterday on the America/Chicago calendar, and every `*_yesterday` value covers that
  CT day.
- **Aggregates only:** counts and sums. No emails, names, or ids.
- A metric whose table or column is missing, or whose query fails, is `null` with the
  reason under `nulls`. The run fails only when every query fails or auth is refused.

## Keys (`metrics.*`)

| key | definition |
|---|---|
| users_total | `auth.users` rows |
| profiles_total | `profiles` rows |
| new_signups_yesterday | `profiles` created on report_date |
| auth_sign_ins_yesterday | `auth.users.last_sign_in_at` on report_date |
| dau / wau / mau | distinct signed-in users with an `app_events` or `deep_link_events` row on report_date / 7 / 30 CT days ending report_date (tracked actions only, so a floor) |
| push_sent_yesterday / push_failed_yesterday | `delivery_log` channel=push, status sent / failed |
| push_opened_yesterday | always `null`: no notification-open event exists |
| push_alerts_read_yesterday | alerts created on report_date with `push_sent` and `read` (open proxy) |
| referral_codes_total / referral_codes_created_yesterday | `referral_codes` |
| referral_link_clicks_yesterday | `referral_clicks` |
| referrals_redeemed_yesterday / referrals_redeemed_total | `referrals` rows |
| referrals_qualified_yesterday | `referrals.qualified_at` on report_date |
| guest_mode_sessions_yesterday | `web_events` `guest_mode_started` |
| social_posts_published_yesterday (+ `_by_platform`) | `social_posts` status=published, `published_at` on report_date |
| social_metrics_daily_summary_latest | all platform rows of `social_metrics_daily_summary` for its latest date |
| ad_campaigns_active | `campaigns` status=active |
| ad_impressions_yesterday | `impressions.delivered_at` on report_date |
| ad_clicks_yesterday | `ad_clicks.clicked_at` on report_date |
| ad_spend_cents_yesterday | sum of `impressions.clearing_price_cents` delivered on report_date |
| advertiser_accounts_total | `advertisers` rows |

Reading it without a Supabase key:
`https://raw.githubusercontent.com/Bigtimedee/Watch-NORMA/metrics/metrics/latest.json`
(private repo: use the GitHub contents API with `ref=metrics`).
