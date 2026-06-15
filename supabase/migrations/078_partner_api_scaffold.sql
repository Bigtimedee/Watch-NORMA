-- Migration 078: Partner-API readiness scaffold (P2-08)
--
-- Adds verification_source to conversions. Default is 'inferred' for all existing
-- and new conversions. Only 'partner_api' is allowed as the verified source, and only
-- when a real signed partner callback arrives via a live ConversionIngestor adapter.
-- No existing conversion is retroactively verified. Interface is disabled by default.

ALTER TABLE public.conversions
  ADD COLUMN IF NOT EXISTS verification_source TEXT NOT NULL DEFAULT 'inferred'
    CHECK (verification_source IN ('inferred', 'partner_api'));

COMMENT ON COLUMN public.conversions.verification_source IS
  'How this conversion was verified. inferred = NORMA observed an external app/site open '
  '(no partner data feed). partner_api = signed server-to-server callback from a sportsbook '
  'or commerce partner. Only partner_api counts as verified; inferred is the honest default. '
  'Cannot be set to partner_api without a live signed callback — enforced at the application layer. '
  'Status: interface defined; no live partners as of 2026. Requires BD partnership to activate.';
