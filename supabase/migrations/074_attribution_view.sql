-- Migration 074: Attribution window and conversion metadata (P2-03)
--
-- Defines the closed-loop attribution model for the intent marketplace.
-- All conversions are currently inferred (no sportsbook callback exists).
-- See reporting-api "attribution" report type for measurement methodology.

-- Attribution helper: per-campaign conversion counts within a time window.
-- Called by reporting-api; avoids exposing user_id to advertisers.
CREATE OR REPLACE FUNCTION public.get_attribution_metrics(
  p_campaign_id    BIGINT,
  p_window_minutes INTEGER DEFAULT 30
)
RETURNS TABLE (
  conversion_type  TEXT,
  count            BIGINT,
  is_inferred      BOOLEAN,
  avg_window_ms    NUMERIC
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT
    c.conversion_type,
    COUNT(*)                                                    AS count,
    -- inferred = we opened an external app/site but cannot confirm the downstream action
    c.conversion_type IN ('sportsbook_open', 'stream_open', 'commerce_open', 'wager_placed')
                                                                AS is_inferred,
    AVG(c.attribution_window_ms)                                AS avg_window_ms
  FROM public.conversions c
  JOIN public.impressions i ON i.id = c.impression_id
  WHERE i.campaign_id = p_campaign_id
    AND (
      p_window_minutes IS NULL
      OR c.attribution_window_ms <= (p_window_minutes::NUMERIC * 60 * 1000)
    )
  GROUP BY c.conversion_type
$$;

COMMENT ON FUNCTION public.get_attribution_metrics IS
  'Aggregate conversion metrics within an attribution window. '
  'Returns per-type counts with is_inferred flag — sportsbook_open/stream_open/commerce_open '
  'are inferred (external app opened; downstream action unverifiable without partner callback). '
  'cta_tap and app_return are app-verified (action occurred inside NORMA). '
  'p_window_minutes defaults to 30 (industry-standard direct-response window).';

-- Attribution window documentation view (informational, never exposes user_id)
CREATE OR REPLACE VIEW public.attribution_methodology AS
SELECT
  conversion_type,
  CASE
    WHEN conversion_type IN ('cta_tap', 'app_return') THEN 'app_verified'
    ELSE 'inferred'
  END                           AS verification_status,
  CASE
    WHEN conversion_type = 'cta_tap'        THEN 'User tapped the CTA button inside NORMA'
    WHEN conversion_type = 'app_return'     THEN 'User returned to NORMA within window'
    WHEN conversion_type = 'sportsbook_open'THEN 'Sportsbook app/site opened — wager NOT confirmed (no partner callback)'
    WHEN conversion_type = 'stream_open'    THEN 'Streaming app/site opened — watch NOT confirmed'
    WHEN conversion_type = 'commerce_open'  THEN 'Commerce site opened — purchase NOT confirmed'
    WHEN conversion_type = 'wager_placed'   THEN 'Wager recorded via email parse — inferred, not direct sportsbook data'
    ELSE 'Unknown conversion type'
  END                           AS methodology_note
FROM (VALUES
  ('cta_tap'), ('app_return'), ('sportsbook_open'),
  ('stream_open'), ('commerce_open'), ('wager_placed')
) AS t(conversion_type);

COMMENT ON VIEW public.attribution_methodology IS
  'Documents the verification status and methodology for each conversion type. '
  'Inferred conversions open an external destination but cannot confirm the downstream action. '
  'Verified conversions occur inside NORMA. '
  'Upgrading inferred → verified requires a partner server-to-server callback (P2-08).';
