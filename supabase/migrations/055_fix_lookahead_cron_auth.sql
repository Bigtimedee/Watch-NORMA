-- Fix poll-schedule-lookahead cron authentication.
--
-- Migration 046 scheduled the lookahead with:
--   headers := jsonb_build_object(
--     'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
--   )
--
-- That relied on the Postgres GUCs `app.settings.supabase_url` and
-- `app.settings.service_role_key` being populated on this project — they
-- aren't (and never have been). At cron fire time, current_setting() returned
-- NULL, the URL collapsed to a relative path, and the Authorization header
-- became "Bearer ". The cron silently did nothing every day, so no future
-- games were ever pre-populated — the Games screen showed "No games on …"
-- for every future date.
--
-- Compounding bug: even when the function WAS invoked manually with a valid
-- service role JWT, it internally did `fetch(... , { Authorization: Bearer
-- ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")} })`. Post-2025 that env var
-- is the new `sb_secret_*` opaque key (not a JWT), so the function gateway
-- rejected the inner call with UNAUTHORIZED_INVALID_JWT_FORMAT. The
-- accompanying code change replaces that raw fetch with
-- `supabase.functions.invoke(...)`, which is the pattern every other Edge
-- Function uses.
--
-- This migration replaces the broken cron job with one that uses the
-- hardcoded service-role JWT pattern from migration 004 — the only pattern
-- that has been reliably working in production.

-- Unschedule the broken cron (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('poll-schedule-lookahead');
EXCEPTION WHEN OTHERS THEN
  -- Job didn't exist yet — fine
  NULL;
END $$;

-- Reschedule with the hardcoded JWT pattern (matches migration 004's working
-- approach for poll-schedule). 8AM UTC = 3AM Eastern in winter / 4AM Eastern
-- in summer — well before any games tip off.
SELECT cron.schedule(
  'poll-schedule-lookahead',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://shijrazlzawjpobrpmnt.supabase.co/functions/v1/poll-schedule-lookahead',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoaWpyYXpsemF3anBvYnJwbW50Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM0MjY2MywiZXhwIjoyMDg2OTE4NjYzfQ.KW9ZTmlUsBphxZ2tQuoPFiu5wjDa8Oi_imXC5-CoM4g", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
