-- Migration 072: Add NFL and NCAAF to sport_key enum
--
-- Data layer only (P1-12). Football games can now be ingested via
-- poll-schedule and poll-boxscore. Alert evaluation is explicitly
-- disabled for football until sport-specific rules are implemented
-- (tracked in docs/09 roadmap).
--
-- Postgres requires enum values to be added with ADD VALUE, which is
-- non-transactional. Safe to run in production — additive only.

ALTER TYPE public.sport_key ADD VALUE IF NOT EXISTS 'ncaaf';
ALTER TYPE public.sport_key ADD VALUE IF NOT EXISTS 'nfl';

COMMENT ON TYPE public.sport_key IS
  'Supported sport keys. ncaaf/nfl are ingestion-only as of migration 072 — '
  'alert rules and odds are not yet implemented for football.';
