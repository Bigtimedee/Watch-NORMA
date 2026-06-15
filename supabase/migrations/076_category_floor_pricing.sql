-- Migration 076: Per-category floor pricing & yield management (P2-05)
--
-- Extends floor_prices with sport-specific overrides and guardrails.
-- Floors now vary by (moment_type, sport), falling back to the global (sport IS NULL) row.
-- Adds a floor_yield_stats view for the admin panel: floor/clearing/fill by category.
-- No change to second-price Vickrey clearing logic.

-- 1. Add sport dimension and guardrail columns
ALTER TABLE public.floor_prices
  ADD COLUMN IF NOT EXISTS sport               TEXT,
  ADD COLUMN IF NOT EXISTS min_floor_cents     INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_floor_cents     INT NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS learned_floor_cents INT;

COMMENT ON COLUMN public.floor_prices.sport IS
  'Sport key (nba, ncaam, mlb, nfl, ncaaf). NULL = global fallback for all sports.';
COMMENT ON COLUMN public.floor_prices.min_floor_cents IS
  'Hard lower guardrail: optimizer cannot set floor below this value.';
COMMENT ON COLUMN public.floor_prices.max_floor_cents IS
  'Hard upper guardrail: optimizer cannot set floor above this value.';
COMMENT ON COLUMN public.floor_prices.learned_floor_cents IS
  'Floor learned from clearing-price history; blended 60/40 with base floor. '
  'Set by floor-price-optimizer. NULL = use base floor_cents only.';

-- 2. Replace single-column unique constraint with (moment_type, sport) composite.
--    COALESCE(sport, '') treats NULL as '' so global rows are distinct from sport rows.
ALTER TABLE public.floor_prices
  DROP CONSTRAINT IF EXISTS floor_prices_moment_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS floor_prices_type_sport_key
  ON public.floor_prices(moment_type, COALESCE(sport, ''));

-- 3. Add sport to floor_price_history for full audit trail
ALTER TABLE public.floor_price_history
  ADD COLUMN IF NOT EXISTS sport TEXT;

-- 4. Yield stats view: floor vs avg clearing vs fill rate per category — last 30 days
CREATE OR REPLACE VIEW public.floor_yield_stats AS
SELECT
  fp.id,
  fp.moment_type,
  COALESCE(fp.sport, 'all')                                                   AS sport,
  fp.floor_cents,
  fp.min_floor_cents,
  fp.max_floor_cents,
  fp.learned_floor_cents,
  fp.updated_at,
  COUNT(i.id)                                                                  AS total_impressions,
  COUNT(i.id) FILTER (WHERE i.clearing_price_cents > 0)                       AS filled_count,
  CASE
    WHEN COUNT(i.id) > 0
    THEN ROUND(
      COUNT(i.id) FILTER (WHERE i.clearing_price_cents > 0)::NUMERIC
      / COUNT(i.id) * 100, 1)
    ELSE 0
  END                                                                          AS fill_rate_pct,
  ROUND(
    AVG(i.clearing_price_cents) FILTER (WHERE i.clearing_price_cents > 0), 0
  )::INT                                                                       AS avg_clearing_cents,
  CASE
    WHEN fp.floor_cents > 0
     AND AVG(i.clearing_price_cents) FILTER (WHERE i.clearing_price_cents > 0) IS NOT NULL
    THEN ROUND(
      AVG(i.clearing_price_cents) FILTER (WHERE i.clearing_price_cents > 0)
      / fp.floor_cents, 2)
    ELSE NULL
  END                                                                          AS clearing_ratio
FROM  public.floor_prices fp
LEFT JOIN public.impressions i
  ON  i.moment_type = fp.moment_type
  AND i.delivered_at >= NOW() - INTERVAL '30 days'
GROUP BY
  fp.id, fp.moment_type, fp.sport, fp.floor_cents,
  fp.min_floor_cents, fp.max_floor_cents, fp.learned_floor_cents, fp.updated_at;

COMMENT ON VIEW public.floor_yield_stats IS
  'Admin yield panel: floor price vs observed clearing price vs fill rate '
  'per moment_type × sport, rolling 30-day window. Aggregate only — no user identity. '
  'Access restricted to admin role at the web layer.';
