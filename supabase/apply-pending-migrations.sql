-- ============================================================
-- NORMA — Apply pending production migrations
-- Run this in the Supabase dashboard SQL editor:
--   supabase.com → your project → SQL Editor → New query → paste → Run
--
-- This script is IDEMPOTENT: safe to run even if some parts
-- already exist. All tables/indexes use IF NOT EXISTS.
-- ============================================================

-- ─── Migration 079: API keys table ─────────────────────────

CREATE TABLE IF NOT EXISTS public.api_keys (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  advertiser_id BIGINT NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
  key_hash      TEXT   NOT NULL UNIQUE,
  key_prefix    TEXT   NOT NULL,
  label         TEXT,
  scopes        TEXT[] NOT NULL DEFAULT ARRAY['inventory:read', 'bid:write'],
  rate_limit_per_minute INT NOT NULL DEFAULT 50,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash       ON public.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_advertiser ON public.api_keys(advertiser_id);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'api_keys' AND policyname = 'Advertisers read own api keys'
  ) THEN
    CREATE POLICY "Advertisers read own api keys"
      ON public.api_keys FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.advertisers a
          WHERE a.id = api_keys.advertiser_id AND a.auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ─── Migration 081: OAuth 2.0 client credentials ───────────

CREATE TABLE IF NOT EXISTS public.oauth_clients (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  client_secret_hash TEXT NOT NULL,
  advertiser_id      BIGINT NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  scopes             TEXT[] NOT NULL DEFAULT '{}',
  is_active          BOOLEAN DEFAULT true,
  created_at         TIMESTAMPTZ DEFAULT now(),
  last_used_at       TIMESTAMPTZ,
  CONSTRAINT valid_scopes CHECK (
    scopes <@ ARRAY['campaigns:read','campaigns:write','reporting:read','inventory:read']
  )
);

CREATE INDEX IF NOT EXISTS idx_oauth_clients_client_id  ON public.oauth_clients(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_clients_advertiser ON public.oauth_clients(advertiser_id);

CREATE TABLE IF NOT EXISTS public.oauth_access_tokens (
  jti           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     TEXT NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  advertiser_id BIGINT NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
  scopes        TEXT[] NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked       BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_client  ON public.oauth_access_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires ON public.oauth_access_tokens(expires_at);

ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_access_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'oauth_clients' AND policyname = 'Advertisers manage own oauth clients'
  ) THEN
    CREATE POLICY "Advertisers manage own oauth clients" ON public.oauth_clients
      FOR ALL USING (
        advertiser_id IN (
          SELECT id FROM public.advertisers WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'oauth_access_tokens' AND policyname = 'Advertisers read own tokens'
  ) THEN
    CREATE POLICY "Advertisers read own tokens" ON public.oauth_access_tokens
      FOR SELECT USING (
        advertiser_id IN (
          SELECT id FROM public.advertisers WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_clients TO authenticated;
GRANT SELECT ON public.oauth_access_tokens TO authenticated;
GRANT ALL ON public.oauth_clients TO service_role;
GRANT ALL ON public.oauth_access_tokens TO service_role;

-- Schedule token cleanup if not already scheduled
SELECT CASE
  WHEN NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-oauth-tokens')
  THEN cron.schedule(
    'cleanup-expired-oauth-tokens',
    '0 4 * * *',
    $$DELETE FROM public.oauth_access_tokens WHERE expires_at < now() - INTERVAL '1 day'$$
  )
  ELSE NULL
END;
