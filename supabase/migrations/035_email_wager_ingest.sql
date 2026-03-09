-- NORMA M3: Email Wager Ingest
-- Migration 032: Gmail Pub/Sub pipeline — user forwarding addresses,
--                watch-state tracking, processed-message dedup

-- ---------------------------------------------------------------------------
-- 1. User forwarding email (optional — user's alternate email for forwarding)
--    If null, we match by auth.users.email instead.
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS bet_forwarding_email TEXT DEFAULT NULL;

-- Index so the Edge Function can look up users by their forwarding address
CREATE INDEX IF NOT EXISTS idx_user_prefs_forwarding_email
  ON public.user_preferences (lower(bet_forwarding_email))
  WHERE bet_forwarding_email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Gmail watch state — singleton row tracking the Pub/Sub watch subscription
--    for the bets@getnorma.app inbox.
--    Watched via Gmail API watch(); renewed every 7 days by a cron job.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gmail_watch_state (
  id             INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- singleton
  history_id     TEXT    NOT NULL,        -- last processed Gmail historyId
  expiration_ms  BIGINT  NOT NULL,        -- watch expiration (Unix ms from Gmail)
  renewed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. Email imports — tracks processed Gmail message IDs to prevent double-import
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_imports (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gmail_message_id TEXT NOT NULL UNIQUE,
  from_address   TEXT NOT NULL,
  user_id        UUID  REFERENCES auth.users(id) ON DELETE SET NULL,
  sportsbook     TEXT,
  wagers_created INTEGER NOT NULL DEFAULT 0,
  parse_status   TEXT NOT NULL DEFAULT 'ok',
    -- Values: ok | no_user_found | parse_failed | no_wagers_found
  error_detail   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_imports_user
  ON public.email_imports (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- RLS: service role only (no client-side access needed)
ALTER TABLE public.email_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_watch_state ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. RPC: find a user_id by email address (used by ingest-email-wagers)
--    Looks up auth.users.email — only accessible to service role via SECURITY DEFINER
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_user_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(p_email)
  LIMIT 1;
  RETURN v_user_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Cron: renew Gmail watch subscription weekly (Gmail watch expires every 7 days)
--    The renewal Edge Function must be deployed separately (renew-gmail-watch).
--    This schedules it to run every Sunday at 2am UTC.
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'renew-gmail-watch',
  '0 2 * * 0',
  $$
    SELECT net.http_post(
      url     := current_setting('app.settings.supabase_url') || '/functions/v1/renew-gmail-watch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);
