-- NORMA Advertising — Cron Jobs
-- Migration 022: Scheduled jobs for the advertising system

-- Refresh materialized views every 15 minutes
SELECT cron.schedule(
  'refresh-ad-metrics',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/ad-metrics-refresh',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Auto-complete expired campaigns daily at midnight
SELECT cron.schedule(
  'auto-complete-campaigns',
  '0 0 * * *',
  $$
    UPDATE public.campaigns
    SET status = 'completed', updated_at = now()
    WHERE status = 'active'
      AND flight_end IS NOT NULL
      AND flight_end < now();
  $$
);

-- Generate supply forecasts daily at 2 AM
SELECT cron.schedule(
  'generate-supply-forecasts',
  '0 2 * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/forecast-supply',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Run fraud detection sweep hourly
SELECT cron.schedule(
  'ad-fraud-check',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/ad-fraud-check',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Enforce daily budget pacing every 5 minutes
SELECT cron.schedule(
  'ad-budget-pacer',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/ad-budget-pacer',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Adjust auto-bid amounts every 30 minutes
SELECT cron.schedule(
  'ad-auto-bidder',
  '*/30 * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/ad-auto-bidder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Purge impression-level data older than 90 days (aggregate into daily stats first)
SELECT cron.schedule(
  'purge-old-impressions',
  '0 3 * * 0',
  $$
    DELETE FROM public.impressions
    WHERE delivered_at < now() - INTERVAL '90 days';
  $$
);
