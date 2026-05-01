-- Migration 055: Deep link observability
-- Tracks streaming provider deep link outcomes to detect silent fallback failures

CREATE TABLE public.deep_link_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_key text NOT NULL,
  method      text NOT NULL CHECK (method IN ('native_scheme', 'universal_link', 'app_store', 'no_fallback')),
  success     boolean NOT NULL,
  fallback_triggered boolean NOT NULL DEFAULT false,
  url_scheme  text,      -- scheme+host only, e.g. 'https://apps.apple.com', never full URL
  platform    text CHECK (platform IN ('ios', 'android', 'web')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: users can only insert their own events, no reads needed from client
ALTER TABLE public.deep_link_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own deep link events"
  ON public.deep_link_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Index for dashboard queries
CREATE INDEX idx_deep_link_events_provider_method ON public.deep_link_events (provider_key, method, created_at DESC);
CREATE INDEX idx_deep_link_events_fallback ON public.deep_link_events (fallback_triggered, created_at DESC) WHERE fallback_triggered = true;

-- View: fallback rate by provider (last 7 days)
CREATE OR REPLACE VIEW public.deep_link_fallback_rates AS
SELECT
  provider_key,
  method,
  platform,
  COUNT(*) AS total_events,
  COUNT(*) FILTER (WHERE fallback_triggered) AS fallback_count,
  ROUND(COUNT(*) FILTER (WHERE fallback_triggered)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS fallback_rate_pct,
  MAX(created_at) AS last_event_at
FROM public.deep_link_events
WHERE created_at > now() - interval '7 days'
GROUP BY provider_key, method, platform
ORDER BY fallback_count DESC;

-- Grant read on view to authenticated users (for admin dashboard)
GRANT SELECT ON public.deep_link_fallback_rates TO authenticated;
