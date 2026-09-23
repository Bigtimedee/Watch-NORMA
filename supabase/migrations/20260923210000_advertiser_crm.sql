-- Advertiser revenue CRM: prospective companies, their contacts, and outreach drafts.
-- Distinct from public.advertisers (paying accounts) and public.partners (BD orgs).
--
-- Access: RLS on, no anon/authenticated policies. Admin UI calls requireAdmin()
-- then createSupabaseAdmin() (service_role bypasses RLS). Do not FORCE RLS.
-- Idempotent: safe to re-run. No seed rows and no invented contact emails.

-- ---------------------------------------------------------------------------
-- Prospects (one row = one company contact in the revenue pipeline)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_prospects (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  socials JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_contact_on DATE,
  stage TEXT NOT NULL DEFAULT 'prospect',
  notes TEXT,
  advertiser_id BIGINT REFERENCES public.advertisers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_prospects_company_nonempty CHECK (char_length(btrim(company_name)) > 0),
  CONSTRAINT crm_prospects_contact_nonempty CHECK (char_length(btrim(contact_name)) > 0),
  CONSTRAINT crm_prospects_email_format CHECK (
    email IS NULL
    OR email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  CONSTRAINT crm_prospects_stage CHECK (
    stage IN ('prospect', 'contacted', 'qualified', 'won', 'lost')
  ),
  CONSTRAINT crm_prospects_socials_array CHECK (jsonb_typeof(socials) = 'array')
);

COMMENT ON TABLE public.crm_prospects IS
  'Prospective advertiser pipeline (company + contact). Not paying advertiser accounts. '
  'RLS on with no anon/authenticated policies; /admin/crm uses service_role after requireAdmin(). '
  'email is only what an admin entered. Never pattern-guessed.';

COMMENT ON COLUMN public.crm_prospects.socials IS
  'Flexible handles: JSON array of {"network","handle"} (x, linkedin, instagram, or other).';

COMMENT ON COLUMN public.crm_prospects.advertiser_id IS
  'Optional link once the prospect becomes a row in public.advertisers.';

COMMENT ON COLUMN public.crm_prospects.last_contact_on IS
  'Calendar date of the last logged touch (call, meeting, or outreach marked sent).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_prospects_email_lower
  ON public.crm_prospects (lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_prospects_last_contact
  ON public.crm_prospects (last_contact_on DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_crm_prospects_advertiser
  ON public.crm_prospects (advertiser_id)
  WHERE advertiser_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Outreach emails drafted or sent to a prospect
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_outreach_emails (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prospect_id BIGINT NOT NULL REFERENCES public.crm_prospects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  snippet TEXT,
  to_email TEXT,
  provider TEXT,
  drafted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  provider_message_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_outreach_status CHECK (status IN ('draft', 'sent', 'failed')),
  CONSTRAINT crm_outreach_subject_nonempty CHECK (char_length(btrim(subject)) > 0),
  CONSTRAINT crm_outreach_body_nonempty CHECK (char_length(btrim(body)) > 0),
  CONSTRAINT crm_outreach_sent_has_timestamp CHECK (status <> 'sent' OR sent_at IS NOT NULL),
  CONSTRAINT crm_outreach_provider CHECK (
    provider IS NULL OR provider IN ('resend', 'manual')
  ),
  CONSTRAINT crm_outreach_to_email_format CHECK (
    to_email IS NULL
    OR to_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  CONSTRAINT crm_outreach_resend_has_recipient CHECK (
    provider IS DISTINCT FROM 'resend' OR to_email IS NOT NULL
  )
);

COMMENT ON TABLE public.crm_outreach_emails IS
  'Drafted, manually marked-sent, or Resend-sent outreach for a CRM prospect. '
  'to_email is copied from crm_prospects.email at send time. No anon/authenticated access. '
  'Live send is an explicit admin action and requires RESEND_API_KEY on the web app.';

COMMENT ON COLUMN public.crm_outreach_emails.snippet IS
  'Short plain-text preview of body, stored at save time.';

COMMENT ON COLUMN public.crm_outreach_emails.provider_message_id IS
  'Resend message id when provider = resend. Null for manual mark-sent.';

CREATE INDEX IF NOT EXISTS idx_crm_outreach_prospect_drafted
  ON public.crm_outreach_emails (prospect_id, drafted_at DESC);

-- ---------------------------------------------------------------------------
-- RLS: deny the Data API. service_role keeps BYPASSRLS (no FORCE).
-- ---------------------------------------------------------------------------
ALTER TABLE public.crm_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_outreach_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_prospects_select" ON public.crm_prospects;
DROP POLICY IF EXISTS "crm_prospects_insert" ON public.crm_prospects;
DROP POLICY IF EXISTS "crm_prospects_update" ON public.crm_prospects;
DROP POLICY IF EXISTS "crm_prospects_delete" ON public.crm_prospects;
DROP POLICY IF EXISTS "crm_prospects_all" ON public.crm_prospects;
DROP POLICY IF EXISTS "crm_outreach_emails_select" ON public.crm_outreach_emails;
DROP POLICY IF EXISTS "crm_outreach_emails_insert" ON public.crm_outreach_emails;
DROP POLICY IF EXISTS "crm_outreach_emails_update" ON public.crm_outreach_emails;
DROP POLICY IF EXISTS "crm_outreach_emails_delete" ON public.crm_outreach_emails;
DROP POLICY IF EXISTS "crm_outreach_emails_all" ON public.crm_outreach_emails;

REVOKE ALL ON TABLE public.crm_prospects FROM PUBLIC;
REVOKE ALL ON TABLE public.crm_prospects FROM anon, authenticated;
GRANT ALL ON TABLE public.crm_prospects TO service_role;

REVOKE ALL ON TABLE public.crm_outreach_emails FROM PUBLIC;
REVOKE ALL ON TABLE public.crm_outreach_emails FROM anon, authenticated;
GRANT ALL ON TABLE public.crm_outreach_emails TO service_role;

GRANT USAGE, SELECT ON SEQUENCE public.crm_prospects_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.crm_outreach_emails_id_seq TO service_role;
