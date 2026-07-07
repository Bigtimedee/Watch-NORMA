-- share_events: tracks when users share a moment card so K-factor is measurable.
-- source: 'alert' (from AlertCard share icon) or 'game' (from game detail ScoreHeader).

CREATE TABLE public.share_events (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source      TEXT   NOT NULL CHECK (source IN ('alert', 'game')),
  alert_type  TEXT,
  game_id     TEXT   REFERENCES public.games(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_share_events_user   ON public.share_events(user_id, created_at DESC);
CREATE INDEX idx_share_events_source ON public.share_events(source, created_at DESC);

ALTER TABLE public.share_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own share events"
  ON public.share_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role reads all"
  ON public.share_events FOR SELECT
  USING (auth.jwt()->>'role' = 'service_role');
