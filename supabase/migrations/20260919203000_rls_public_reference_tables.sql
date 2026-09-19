-- RLS for public-schema tables that shipped without it.
-- Closes Supabase advisor rls_disabled_in_public on sportsbook_restrictions
-- (CRITICAL) and the same finding on partners / partner_referral_codes.
--
-- Idempotent: safe if the matching emergency prod SQL already ran.
-- service_role keeps BYPASSRLS (do not FORCE ROW LEVEL SECURITY).
--
-- After apply, expect relrowsecurity = true:
--   SELECT c.relname, c.relrowsecurity
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public'
--     AND c.relname IN (
--       'sportsbook_restrictions',
--       'partners',
--       'partner_referral_codes'
--     );

-- ---------------------------------------------------------------------------
-- 1. sportsbook_restrictions — public geo allowlist (read-only for clients)
--    Client: hooks/useSportsbookGeo.ts SELECT allowed_states via user JWT.
--    Auction path uses advertisers.allowed_jurisdictions (service_role).
-- ---------------------------------------------------------------------------
ALTER TABLE public.sportsbook_restrictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sportsbook_restrictions_select" ON public.sportsbook_restrictions;
CREATE POLICY "sportsbook_restrictions_select"
  ON public.sportsbook_restrictions
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON TABLE public.sportsbook_restrictions FROM PUBLIC;
REVOKE ALL ON TABLE public.sportsbook_restrictions FROM anon, authenticated;
GRANT SELECT ON TABLE public.sportsbook_restrictions TO anon, authenticated;
GRANT ALL ON TABLE public.sportsbook_restrictions TO service_role;

COMMENT ON TABLE public.sportsbook_restrictions IS
  'Geo allowlist of US states per sportsbook/pick''em key. RLS on; '
  'anon+authenticated SELECT only. Writes are service_role / SQL.';

-- ---------------------------------------------------------------------------
-- 2. partners — BD CRM (bd_contact_email, notes). No client policies.
--    Admin /admin/partners must use the service-role client after requireAdmin().
--    Landing page does not read this table (provider_registry + referral codes).
-- ---------------------------------------------------------------------------
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partners_select" ON public.partners;
DROP POLICY IF EXISTS "partners_insert" ON public.partners;
DROP POLICY IF EXISTS "partners_update" ON public.partners;
DROP POLICY IF EXISTS "partners_delete" ON public.partners;
DROP POLICY IF EXISTS "partners_all" ON public.partners;

REVOKE ALL ON TABLE public.partners FROM PUBLIC;
REVOKE ALL ON TABLE public.partners FROM anon, authenticated;
GRANT ALL ON TABLE public.partners TO service_role;

COMMENT ON TABLE public.partners IS
  'BD pipeline CRM. Contains bd_contact_email and notes. RLS on with no '
  'anon/authenticated policies; service_role bypasses RLS.';

-- ---------------------------------------------------------------------------
-- 3. partner_referral_codes — public attribution codes; no client writes.
--    Landing page and admin reads use service_role. SELECT kept for anon+
--    authenticated so a user-JWT reader is not fail-closed; codes are already
--    embedded in public App Store URLs. Clicks increment via SECURITY DEFINER
--    increment_partner_clicks (owner bypasses RLS; not FORCE).
-- ---------------------------------------------------------------------------
ALTER TABLE public.partner_referral_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_referral_codes_select" ON public.partner_referral_codes;
CREATE POLICY "partner_referral_codes_select"
  ON public.partner_referral_codes
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON TABLE public.partner_referral_codes FROM PUBLIC;
REVOKE ALL ON TABLE public.partner_referral_codes FROM anon, authenticated;
GRANT SELECT ON TABLE public.partner_referral_codes TO anon, authenticated;
GRANT ALL ON TABLE public.partner_referral_codes TO service_role;

COMMENT ON TABLE public.partner_referral_codes IS
  'Static co-marketing referral codes. RLS on; anon+authenticated SELECT only. '
  'Click increments go through increment_partner_clicks (SECURITY DEFINER).';
