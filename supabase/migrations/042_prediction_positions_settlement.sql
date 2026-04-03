-- Migration 042: Settlement columns for prediction_positions
--
-- Adds outcome and payout_amount to track the result of each position
-- after game close. Populated by the resolve-predictions Edge Function
-- (called by game-watcher-orchestrator before evaluate-alerts fires).

-- ================================================================
-- 1. Settlement columns
-- ================================================================

-- outcome: "yes" | "no" | "unknown"
--   "yes"     = position_side matched the market result (user won)
--   "no"      = position_side did NOT match the market result (user lost)
--   "unknown" = Kalshi API returned no result and inference failed
ALTER TABLE public.prediction_positions
  ADD COLUMN outcome TEXT DEFAULT NULL;

-- payout_amount: net dollar amount of the payout.
--   Positive = profit (e.g. +47.20 for a win on a $50 yes contract at $0.94)
--   Negative = loss  (e.g. -47.00 for a loss on a $47 yes contract)
--   NULL     = not yet settled or outcome = "unknown"
ALTER TABLE public.prediction_positions
  ADD COLUMN payout_amount NUMERIC DEFAULT NULL;

-- ================================================================
-- 2. Indexes
-- ================================================================

-- Partial index: fast lookup of unsettled positions for a game.
-- Used by resolve-predictions to find work to do.
CREATE INDEX idx_prediction_positions_unsettled
  ON public.prediction_positions(game_id)
  WHERE settled = false;
