-- Gmail pub/sub watch state for email wager ingestion
-- NOTE: The gmail_watch_state table was first created in migration 035_email_wager_ingest.sql
-- with columns: id, history_id, expiration_ms, renewed_at, updated_at.
-- This migration is a safety idempotent pass that ensures the table and singleton row exist,
-- matching what ingest-email-wagers expects.
CREATE TABLE IF NOT EXISTS public.gmail_watch_state (
  id             INTEGER PRIMARY KEY DEFAULT 1,
  history_id     TEXT,
  expiration_ms  BIGINT,
  renewed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gmail_watch_state_singleton CHECK (id = 1)
);

-- Seed the singleton row if it doesn't exist
INSERT INTO public.gmail_watch_state (id, history_id)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;

-- RLS: only service role can access (idempotent)
ALTER TABLE public.gmail_watch_state ENABLE ROW LEVEL SECURITY;
