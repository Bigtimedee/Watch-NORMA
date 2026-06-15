-- Migration 077: Demand categories for campaigns (P2-06)
--
-- Adds demand_type to campaigns: sportsbook | streaming | commerce.
-- Each category has its own CTA action type and is auction-eligible independently.
-- Non-sportsbook campaigns are not subject to geo-filter (streaming/commerce are legal everywhere).
-- No change to second-price Vickrey clearing logic.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS demand_type TEXT NOT NULL DEFAULT 'sportsbook'
    CHECK (demand_type IN ('sportsbook', 'streaming', 'commerce'));

COMMENT ON COLUMN public.campaigns.demand_type IS
  'Demand category: sportsbook (bet now), streaming (watch now), commerce (shop now). '
  'Controls CTA action rendered on the alert card and which conversion types are tracked. '
  'Only sportsbook campaigns are subject to geo-filter; streaming and commerce are unrestricted.';

-- Backfill existing campaigns as sportsbook (they were all sportsbook before this migration)
UPDATE public.campaigns SET demand_type = 'sportsbook' WHERE demand_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_demand_type ON public.campaigns(demand_type);
