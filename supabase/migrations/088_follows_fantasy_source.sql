-- FF-01: Add source column to follows table for fantasy roster tracking
-- This is additive — existing rows are unaffected (source defaults to NULL)

ALTER TABLE public.follows ADD COLUMN IF NOT EXISTS source TEXT;
  -- Values: 'fantasy' | NULL (NULL = organic follow, not from roster import)
  -- Future values: 'manual' | 'import' | etc.

-- Index for querying all fantasy follows for a user
CREATE INDEX IF NOT EXISTS idx_follows_source ON public.follows(user_id, source)
  WHERE source IS NOT NULL;

COMMENT ON COLUMN public.follows.source IS
  'Origin of this follow. fantasy = imported from a fantasy sports roster. NULL = organic.';
