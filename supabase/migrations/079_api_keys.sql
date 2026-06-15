-- Migration 079: API keys for programmatic intent API (P2-09)
--
-- Server-to-server buyers authenticate with API keys scoped to their advertiser account.
-- Keys are hashed (SHA-256) before storage — raw key is shown once at issuance.
-- Rate limiting is enforced at the application layer (50 req/min per key by default).
-- Status: scaffolded — gated by INTENT_API_ENABLED Supabase secret.

CREATE TABLE IF NOT EXISTS public.api_keys (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  advertiser_id BIGINT NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
  key_hash      TEXT   NOT NULL UNIQUE,  -- SHA-256 of the raw key; raw key never stored
  key_prefix    TEXT   NOT NULL,         -- first 8 chars of raw key for display (e.g. "nrma_k1_")
  label         TEXT,                    -- human-readable name ("DSP integration", "prod key")
  scopes        TEXT[] NOT NULL DEFAULT ARRAY['inventory:read', 'bid:write'],
  rate_limit_per_minute INT NOT NULL DEFAULT 50,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash        ON public.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_advertiser  ON public.api_keys(advertiser_id);

COMMENT ON TABLE public.api_keys IS
  'API keys for programmatic buyers. Raw key shown once at issuance; '
  'only SHA-256 hash stored. Revoke by setting is_active=false or revoked_at. '
  'Rate limit enforced per key at the intent-api edge function.';

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Only service_role can write; authenticated users can read their own keys
CREATE POLICY "Advertisers read own api keys"
  ON public.api_keys FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.advertisers a
      WHERE a.id = api_keys.advertiser_id AND a.auth_user_id = auth.uid()
    )
  );
