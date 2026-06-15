-- Migration 073: intent_moments table (P2-01)
--
-- The unit of inventory for NORMA's intent marketplace. Every qualifying
-- game moment is persisted here — game-level, aggregate, no user identity —
-- whether or not an ad fills it. Foundation for supply forecasting (P2-04),
-- per-category floor pricing (P2-05), attribution (P2-03), and the
-- programmatic API (P2-09).
--
-- Written by evaluate-alerts AFTER delivery so it never delays notifications.

CREATE TABLE IF NOT EXISTS public.intent_moments (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id              TEXT         NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  sport                TEXT         NOT NULL,
  moment_type          TEXT         NOT NULL,
  -- Prevents double-counting if evaluate-alerts fires for the same game state.
  -- Format: game_id:moment_type:period:margin_bucket
  dedup_key            TEXT         NOT NULL UNIQUE,
  fired_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  intent_score         NUMERIC(4,3) NOT NULL CHECK (intent_score >= 0 AND intent_score <= 1),
  eligible_user_count  INTEGER      NOT NULL DEFAULT 0,
  -- Aggregate game state at fire time — no user identity
  game_context         JSONB        NOT NULL DEFAULT '{}',
  -- Key game-level signals snapshot (margin, clock, period, flags)
  signals_snapshot     JSONB        NOT NULL DEFAULT '{}',
  auction_outcome      TEXT         NOT NULL DEFAULT 'unfilled'
                         CHECK (auction_outcome IN ('filled', 'unfilled', 'ineligible')),
  -- Non-null only when auction_outcome = 'filled'
  clearing_price_cents INTEGER,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Supply forecasting: look up historical moments by sport + type over time
CREATE INDEX idx_intent_moments_sport_type_time
  ON public.intent_moments(sport, moment_type, fired_at DESC);

-- Live dashboard (P2-02): rolling time-window queries
CREATE INDEX idx_intent_moments_fired_at
  ON public.intent_moments(fired_at DESC);

-- Per-game lookups
CREATE INDEX idx_intent_moments_game
  ON public.intent_moments(game_id, fired_at DESC);

-- Auction yield analysis: fill rate by outcome
CREATE INDEX idx_intent_moments_auction_outcome
  ON public.intent_moments(auction_outcome, fired_at DESC);

-- RLS: service_role writes (evaluate-alerts); authenticated reads (aggregate, no PII)
ALTER TABLE public.intent_moments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read intent moments"
  ON public.intent_moments FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.intent_moments IS
  'One row per qualifying game moment. The tradeable unit of NORMA''s intent marketplace. '
  'No user identity stored — game-level/aggregate only. '
  'Written by evaluate-alerts after delivery (observational — never alters alert behavior).';

COMMENT ON COLUMN public.intent_moments.intent_score IS
  'Normalized [0,1] transform of alert_score + game-state premiums. '
  'Computed by computeIntentScore() in _shared/alert-scoring.ts. '
  'Deterministic: same inputs always produce the same output.';

COMMENT ON COLUMN public.intent_moments.dedup_key IS
  'Composite key: game_id:moment_type:period:margin_bucket. '
  'Prevents duplicate rows if evaluate-alerts runs twice for the same game state.';

COMMENT ON COLUMN public.intent_moments.auction_outcome IS
  'filled = at least one user received a sponsored alert in this invocation; '
  'unfilled = auction ran but no bid cleared the floor; '
  'ineligible = no eligible ad demand for this moment type.';
