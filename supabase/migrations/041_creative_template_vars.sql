-- Migration 041: Creative template variable interpolation for personalized sponsor copy
--
-- Adds support for template variables like {user_first_name}, {payout_amount}, {team_name}
-- in creatives.sponsor_text. Interpolation happens in evaluate-alerts Stage 4 before
-- writing to alerts.sponsor_text. The raw context is stored for audit.

-- ================================================================
-- 1. Add personalization columns to creatives
-- ================================================================

-- Advertiser opt-in flag. When false, sponsor_text is treated as static copy
-- and no interpolation is attempted (backward compatible).
ALTER TABLE public.creatives
  ADD COLUMN supports_personalization BOOLEAN DEFAULT false;

-- Documents which template variables this creative uses.
-- Example: {"user_first_name": true, "payout_amount": true}
-- Used for validation/preview in campaign management, NOT for runtime interpolation
-- (runtime discovers variables by parsing the template).
ALTER TABLE public.creatives
  ADD COLUMN personalization_vars JSONB DEFAULT '{}';

-- ================================================================
-- 2. Add personalization context to alerts (audit trail)
-- ================================================================

-- Stores the resolved variable values at the time of interpolation.
-- Example: {"user_first_name": "Dave", "payout_amount": "$50.00", "team_name": "Duke Blue Devils"}
-- NULL when the creative has supports_personalization = false or auction returned no sponsor.
ALTER TABLE public.alerts
  ADD COLUMN personalization_context JSONB DEFAULT NULL;

-- ================================================================
-- 3. Indexes
-- ================================================================

-- Partial index: only creatives that use personalization (for campaign management queries)
CREATE INDEX idx_creatives_personalization
  ON public.creatives(campaign_id)
  WHERE supports_personalization = true;

-- GIN index on personalization_vars for JSONB containment queries
-- (e.g., "find all creatives that use {payout_amount}")
CREATE INDEX idx_creatives_personalization_vars
  ON public.creatives USING GIN (personalization_vars)
  WHERE supports_personalization = true;

-- ================================================================
-- 4. Validation function: check that sponsor_text only uses known variables
-- ================================================================

-- Known variable names that the interpolation engine supports.
-- This function is called by the campaign-api Edge Function when
-- an advertiser saves a creative with supports_personalization = true.
CREATE OR REPLACE FUNCTION public.validate_template_vars(
  p_sponsor_text TEXT,
  OUT is_valid BOOLEAN,
  OUT unknown_vars TEXT[]
)
RETURNS RECORD AS $$
DECLARE
  known_vars TEXT[] := ARRAY[
    'user_first_name',
    'team_name',
    'team_abbr',
    'payout_amount',
    'platform',
    'market_title'
  ];
  found_var TEXT;
  found_vars TEXT[];
BEGIN
  is_valid := true;
  unknown_vars := '{}';
  found_vars := '{}';

  -- Extract all {variable_name} patterns from the template
  FOR found_var IN
    SELECT (regexp_matches(p_sponsor_text, '\{([a-z_]+)\}', 'g'))[1]
  LOOP
    found_vars := array_append(found_vars, found_var);
    IF NOT found_var = ANY(known_vars) THEN
      is_valid := false;
      unknown_vars := array_append(unknown_vars, found_var);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.validate_template_vars IS
  'Validates that a sponsor_text template only uses known variable names. '
  'Returns is_valid=false and the list of unknown vars if any are found.';
