-- Migration 085: Monthly impression guarantee for direct deal campaigns
-- Direct deals bypass the Vickrey auction (priority_tier > 0).
-- This column stores the committed monthly impression volume.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS monthly_impression_guarantee INT;

COMMENT ON COLUMN public.campaigns.monthly_impression_guarantee IS
  'For direct deal campaigns (priority_tier > 0): committed impressions per 30-day period. '
  'NULL = standard auction campaign. Used for pacing tracking in /admin/campaigns/direct-deals.';
