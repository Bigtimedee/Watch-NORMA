-- Phase 1 game-level deep links (streaming-deeplink-research.md §6).
--
-- 1. game_watch_links: curated/scraped per-game provider URLs keyed by ESPN
--    event id. Public read (anon + authenticated), writes service_role only.
-- 2. streaming_providers.app_universal_link: an https link that opens the
--    provider's iOS app (AASA-claimed) without requiring a custom scheme.
--    Distinct from universal_link, which migration 036 NULLed for
--    subscriber-only web pages.
-- 3. deep_link_events.link_level: which resolution level a tap used.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.game_watch_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  espn_event_id text NOT NULL,
  provider_key  text NOT NULL,
  url           text NOT NULL CHECK (url ~ '^https://'),
  source        text NOT NULL DEFAULT 'curated'
                CHECK (source IN ('curated', 'scraped', 'partner_feed')),
  verified_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (espn_event_id, provider_key)
);

ALTER TABLE public.game_watch_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "game_watch_links_select" ON public.game_watch_links;
CREATE POLICY "game_watch_links_select"
  ON public.game_watch_links
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON TABLE public.game_watch_links FROM PUBLIC;
REVOKE ALL ON TABLE public.game_watch_links FROM anon, authenticated;
GRANT SELECT ON TABLE public.game_watch_links TO anon, authenticated;
GRANT ALL ON TABLE public.game_watch_links TO service_role;

COMMENT ON TABLE public.game_watch_links IS
  'Per-game streaming deep links keyed by ESPN event id. RLS on; '
  'anon+authenticated SELECT only. Writes are service_role / SQL.';

ALTER TABLE public.streaming_providers
  ADD COLUMN IF NOT EXISTS app_universal_link text;

ALTER TABLE public.deep_link_events
  ADD COLUMN IF NOT EXISTS link_level text;

ALTER TABLE public.deep_link_events
  DROP CONSTRAINT IF EXISTS deep_link_events_link_level_check;
ALTER TABLE public.deep_link_events
  ADD CONSTRAINT deep_link_events_link_level_check
  CHECK (link_level IS NULL OR link_level IN
    ('stored_game', 'derived_game', 'app_universal', 'scheme', 'app_store', 'none'));
