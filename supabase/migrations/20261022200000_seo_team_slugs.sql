-- Spec A (GROWTH-IMPL-2026-10-22): programmatic game/team SEO pages.
-- 1. teams.slug: URL slug, unique per sport. Duplicate team names (espn-/sdio-
--    pairs) keep the base slug on the row with the most games; others get -N.
-- 2. broadcast_streaming_map: hand-maintained broadcast token -> streaming
--    services. Public read. Only entries we know are true; empty is fine.
-- 3. web_events: anonymous web analytics (seo_cta_click, referral_link_open);
--    app_events.user_id is NOT NULL so anon web events cannot go there.
-- Idempotent.

CREATE OR REPLACE FUNCTION public.norma_slugify(v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(both '-' from regexp_replace(
    lower(translate(coalesce(v, ''), '&''’.', 'a   ')), '[^a-z0-9]+', '-', 'g'))
$$;

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS slug text;

WITH ranked AS (
  SELECT t.id, public.norma_slugify(t.name) AS base,
         row_number() OVER (
           PARTITION BY t.sport, public.norma_slugify(t.name)
           ORDER BY (SELECT count(*) FROM public.games g
                     WHERE g.home_team_id = t.id OR g.away_team_id = t.id) DESC, t.id
         ) AS rn
  FROM public.teams t
)
UPDATE public.teams t
SET slug = CASE WHEN r.rn = 1 THEN r.base ELSE r.base || '-' || r.rn END
FROM ranked r
WHERE r.id = t.id AND t.slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS teams_sport_slug_key ON public.teams (sport, slug);

CREATE OR REPLACE FUNCTION public.teams_set_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE base text; candidate text; n int := 1;
BEGIN
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN RETURN NEW; END IF;
  base := public.norma_slugify(NEW.name);
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.teams WHERE sport = NEW.sport AND slug = candidate AND id <> NEW.id) LOOP
    n := n + 1; candidate := base || '-' || n;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS teams_set_slug ON public.teams;
CREATE TRIGGER teams_set_slug BEFORE INSERT OR UPDATE OF name ON public.teams
  FOR EACH ROW WHEN (NEW.slug IS NULL OR NEW.slug = '') EXECUTE FUNCTION public.teams_set_slug();

CREATE TABLE IF NOT EXISTS public.broadcast_streaming_map (
  broadcast_token text PRIMARY KEY,
  services        text[] NOT NULL DEFAULT '{}',
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.broadcast_streaming_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "broadcast_streaming_map_select" ON public.broadcast_streaming_map;
CREATE POLICY "broadcast_streaming_map_select" ON public.broadcast_streaming_map
  FOR SELECT TO anon, authenticated USING (true);

-- Streaming-only broadcasters stream on themselves. Other tokens are added by hand.
INSERT INTO public.broadcast_streaming_map (broadcast_token, services) VALUES
  ('Prime Video', ARRAY['Prime Video']),
  ('Peacock', ARRAY['Peacock']),
  ('Netflix', ARRAY['Netflix']),
  ('ESPN+', ARRAY['ESPN+']),
  ('Paramount+', ARRAY['Paramount+']),
  ('Apple TV', ARRAY['Apple TV']),
  ('NBA League Pass', ARRAY['NBA League Pass']),
  ('MLB.TV', ARRAY['MLB.TV']),
  ('NFL+', ARRAY['NFL+'])
ON CONFLICT (broadcast_token) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.web_events (
  id          bigserial PRIMARY KEY,
  event_name  text NOT NULL,
  properties  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.web_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS web_events_name_created_idx ON public.web_events (event_name, created_at DESC);
