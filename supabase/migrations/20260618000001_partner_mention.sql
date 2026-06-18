-- =============================================================================
-- NORMA SM-02: Partner-Amplifiable Social Content
-- Adds partner_mention column to content_calendar so posts with @ESPN,
-- @ESPNPlus, or @DraftKings mentions can be flagged and surfaced in the CMO
-- dashboard with a "Partner Amplifiable" badge.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add partner_mention column to content_calendar
--    NULL = no partner mention; non-NULL = the partner handle string(s)
-- ---------------------------------------------------------------------------
ALTER TABLE public.content_calendar
  ADD COLUMN IF NOT EXISTS partner_mention TEXT DEFAULT NULL;

COMMENT ON COLUMN public.content_calendar.partner_mention IS
  'Partner handle(s) included in the post body, e.g. "@ESPN" or "@DraftKings". '
  'NULL means no partner mention. Set by cmo-generate for alert_called_it posts.';

-- Index so the CMO dashboard can efficiently filter partner-amplifiable posts
CREATE INDEX IF NOT EXISTS idx_content_calendar_partner_mention
  ON public.content_calendar (partner_mention)
  WHERE partner_mention IS NOT NULL;
