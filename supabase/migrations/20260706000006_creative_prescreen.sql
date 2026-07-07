-- creative_prescreen: adds AI pre-screening columns to creatives.
-- prescreen_status tracks where a creative is in the AI review pipeline.
-- prescreen_reasons stores the reasons when a creative is flagged.
-- These columns are separate from status (pending|approved|rejected) —
-- a creative with prescreen_status='pass' still needs a human click to
-- set status='approved'. AI never auto-approves into the live auction.

ALTER TABLE public.creatives
  ADD COLUMN IF NOT EXISTS prescreen_status TEXT DEFAULT 'pending'
    CHECK (prescreen_status IN ('pending', 'pass', 'flag', 'error')),
  ADD COLUMN IF NOT EXISTS prescreen_reasons JSONB,
  ADD COLUMN IF NOT EXISTS prescreen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_creatives_prescreen
  ON public.creatives(prescreen_status, campaign_id);
