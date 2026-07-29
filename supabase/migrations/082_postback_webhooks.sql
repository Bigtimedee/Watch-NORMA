-- Migration 082: Conversion postback + outbound webhook system

-- ─── Click tracking ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ad_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  impression_id BIGINT REFERENCES public.impressions(id) ON DELETE CASCADE,
  campaign_id BIGINT NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  creative_id BIGINT REFERENCES public.creatives(id) ON DELETE SET NULL,
  moment_type TEXT,
  clicked_at TIMESTAMPTZ DEFAULT now(),
  postback_received_at TIMESTAMPTZ,
  converted BOOLEAN DEFAULT false,
  idempotency_key TEXT
);

CREATE INDEX IF NOT EXISTS idx_ad_clicks_campaign ON public.ad_clicks(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_clicks_impression ON public.ad_clicks(impression_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_clicks_idempotency ON public.ad_clicks(idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.ad_clicks ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='ad_clicks'
      AND policyname='Advertisers read own clicks'
  ) THEN
    CREATE POLICY "Advertisers read own clicks" ON public.ad_clicks
      FOR SELECT USING (
        campaign_id IN (
          SELECT c.id FROM public.campaigns c
          JOIN public.advertisers a ON a.id = c.advertiser_id
          WHERE a.auth_user_id = auth.uid()
        )
      );
  END IF;
END;
$$;

GRANT ALL ON public.ad_clicks TO service_role;
GRANT SELECT ON public.ad_clicks TO authenticated;

-- ─── Webhook endpoints ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id BIGINT NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL,
  secret TEXT NOT NULL,  -- plaintext HMAC secret (not a password; used for signing only)
  is_active BOOLEAN DEFAULT true,
  batch_impressions BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_delivered_at TIMESTAMPTZ,
  failure_count INT DEFAULT 0,
  CONSTRAINT valid_events CHECK (
    events <@ ARRAY[
      'impression.served', 'click.recorded', 'conversion.recorded',
      'campaign.budget_50pct', 'campaign.budget_90pct',
      'campaign.ended', 'campaign.bid_adjusted'
    ]
  )
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_advertiser ON public.webhook_endpoints(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_active ON public.webhook_endpoints(is_active) WHERE is_active = true;

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='webhook_endpoints'
      AND policyname='Advertisers manage own webhooks'
  ) THEN
    CREATE POLICY "Advertisers manage own webhooks" ON public.webhook_endpoints
      FOR ALL USING (
        advertiser_id IN (
          SELECT id FROM public.advertisers WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END;
$$;

GRANT ALL ON public.webhook_endpoints TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_endpoints TO authenticated;

-- ─── Webhook delivery log ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhook_delivery_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  endpoint_id UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  attempt INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL,  -- delivered | failed | timeout
  response_status INT,
  duration_ms INT,
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_log_endpoint ON public.webhook_delivery_log(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_log_next_retry ON public.webhook_delivery_log(next_retry_at)
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;

ALTER TABLE public.webhook_delivery_log ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='webhook_delivery_log'
      AND policyname='Advertisers read own delivery logs'
  ) THEN
    CREATE POLICY "Advertisers read own delivery logs" ON public.webhook_delivery_log
      FOR SELECT USING (
        endpoint_id IN (
          SELECT w.id FROM public.webhook_endpoints w
          JOIN public.advertisers a ON a.id = w.advertiser_id
          WHERE a.auth_user_id = auth.uid()
        )
      );
  END IF;
END;
$$;

GRANT ALL ON public.webhook_delivery_log TO service_role;
GRANT SELECT ON public.webhook_delivery_log TO authenticated;
