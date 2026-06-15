-- Migration 075: Add confidence band and basis columns to supply_forecasts (P2-04)
--
-- Enables the /inventory page to show low/high projection bands instead of
-- a single point estimate. basis_note documents the data source so buyers
-- understand the projection methodology. All columns nullable for backward compat.

ALTER TABLE public.supply_forecasts
  ADD COLUMN IF NOT EXISTS predicted_moments_low  INTEGER,
  ADD COLUMN IF NOT EXISTS predicted_moments_high INTEGER,
  ADD COLUMN IF NOT EXISTS basis_note             TEXT;

COMMENT ON COLUMN public.supply_forecasts.predicted_moments_low IS
  'Lower bound of 80% confidence interval for predicted_moments. '
  'Computed from Wald interval on historical intent_moments rates. '
  'Null for sports with insufficient history (<10 comparable games).';

COMMENT ON COLUMN public.supply_forecasts.predicted_moments_high IS
  'Upper bound of 80% confidence interval for predicted_moments. '
  'Null for sports with insufficient history (<10 comparable games).';

COMMENT ON COLUMN public.supply_forecasts.basis_note IS
  'Human-readable description of the data source for this forecast. '
  'e.g. "Based on 42 games (last 30 days)" or "Statistical projection (insufficient history: 3 games)". '
  'Always display this on any UI or API that surfaces forecast numbers.';
