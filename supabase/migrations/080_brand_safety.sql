-- Migration 080: Brand safety controls for the demand engine (P2-10)
--
-- Adds brand_safety_status to campaigns for category-specific review state.
-- Adds editorial_separation_ack to creatives — advertiser acknowledges the
-- "Sponsored" label requirement before creative is approved.
-- No change to clearing logic — only eligibility and approval workflow.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS brand_safety_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (brand_safety_status IN ('pending', 'approved', 'flagged'));

COMMENT ON COLUMN public.campaigns.brand_safety_status IS
  'Brand-safety review state. pending = awaiting review (new campaigns). '
  'approved = cleared for auction eligibility. flagged = rejected for brand-safety reasons. '
  'streaming and commerce campaigns require brand_safety_status=approved before entering the auction. '
  'sportsbook campaigns are covered by existing geo-compliance + campaign approval workflow.';

ALTER TABLE public.creatives
  ADD COLUMN IF NOT EXISTS editorial_separation_ack BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.creatives.editorial_separation_ack IS
  'Advertiser has acknowledged that the creative will appear with a "Sponsored" label '
  'visually distinct from NORMA''s editorial alert copy. Required before creative approval '
  'for streaming and commerce demand types. Sportsbook creatives inherit this from the '
  'existing review flow.';

CREATE INDEX IF NOT EXISTS idx_campaigns_brand_safety ON public.campaigns(brand_safety_status);
