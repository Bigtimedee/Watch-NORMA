-- 089_campaign_webhook.sql
-- Adds webhook_url to campaigns table.
-- This URL is fired by the billing engine when a campaign's daily spend
-- reaches 80% of its daily_budget_cents, giving advertisers a real-time
-- signal to adjust bids, pause creative variants, or top up their wallet.
-- The 80% threshold payload and firing logic live in the billing engine
-- (see TODO comment in supabase/functions/reporting-api/index.ts).

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS webhook_url TEXT;

COMMENT ON COLUMN public.campaigns.webhook_url IS
  'HTTPS endpoint called by the billing engine when daily spend reaches 80% of daily_budget_cents. '
  'Payload: {"event":"budget_threshold","threshold_pct":80,"campaign_id":...,"spend_cents":...,"budget_cents":...,"timestamp":"..."}';
