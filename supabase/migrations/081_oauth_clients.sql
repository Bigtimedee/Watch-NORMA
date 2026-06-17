-- Migration 081: OAuth 2.0 Client Credentials tables
-- Machine-to-machine auth for agentic buyers (AI agents, DSPs).
-- Token endpoint: POST /api/auth/token (client_credentials grant, RS256 JWT).

CREATE TABLE public.oauth_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  client_secret_hash TEXT NOT NULL,  -- scrypt hash, never plaintext
  advertiser_id BIGINT NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  CONSTRAINT valid_scopes CHECK (
    scopes <@ ARRAY['campaigns:read','campaigns:write','reporting:read','inventory:read']
  )
);

CREATE INDEX idx_oauth_clients_client_id ON public.oauth_clients(client_id);
CREATE INDEX idx_oauth_clients_advertiser ON public.oauth_clients(advertiser_id);

-- Stateful token store for revocation support.
-- JWTs are short-lived (1hr); this table is only consulted for explicit revocation checks.
CREATE TABLE public.oauth_access_tokens (
  jti UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  advertiser_id BIGINT NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
  scopes TEXT[] NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_oauth_tokens_client ON public.oauth_access_tokens(client_id);
CREATE INDEX idx_oauth_tokens_expires ON public.oauth_access_tokens(expires_at);

ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_access_tokens ENABLE ROW LEVEL SECURITY;

-- Advertisers manage their own OAuth clients
CREATE POLICY "Advertisers manage own oauth clients" ON public.oauth_clients
  FOR ALL USING (
    advertiser_id IN (
      SELECT id FROM public.advertisers WHERE auth_user_id = auth.uid()
    )
  );

-- Advertisers see their own token records
CREATE POLICY "Advertisers read own tokens" ON public.oauth_access_tokens
  FOR SELECT USING (
    advertiser_id IN (
      SELECT id FROM public.advertisers WHERE auth_user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oauth_clients TO authenticated;
GRANT SELECT ON public.oauth_access_tokens TO authenticated;
-- Service role used by token endpoint
GRANT ALL ON public.oauth_clients TO service_role;
GRANT ALL ON public.oauth_access_tokens TO service_role;

-- Clean up expired tokens daily (pg_cron)
SELECT cron.schedule(
  'cleanup-expired-oauth-tokens',
  '0 4 * * *',
  $$DELETE FROM public.oauth_access_tokens WHERE expires_at < now() - INTERVAL '1 day'$$
);
