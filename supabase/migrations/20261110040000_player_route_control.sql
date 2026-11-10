-- Remote kill switch for the optional StrymTV player route.
-- One public row. No stream URLs, cohort member lists, or account identifiers.
-- Default is disabled: killed = true and strymtv_enabled = false.
--
-- Reads: authenticated SELECT of that row only.
-- Writes: service_role after the web admin check (app_metadata.role = admin).
-- authenticated and anon have no insert, update, or delete grant and no write policy.
--
-- Idempotent. Re-running does not clear an admin's later killed=false, because
-- the seed uses ON CONFLICT DO NOTHING.
--
-- Rollback (manual, only if this table must be removed):
--   DROP POLICY IF EXISTS player_route_control_read ON public.player_route_control;
--   DROP TABLE IF EXISTS public.player_route_control;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261110040000';
-- Leaving the table in place is the safe rollback of a bad client: the default
-- row keeps StrymTV off. Do not delete the row to "turn the feature on".

CREATE TABLE IF NOT EXISTS public.player_route_control (
  id SMALLINT PRIMARY KEY,
  schema_version SMALLINT NOT NULL DEFAULT 1,
  killed BOOLEAN NOT NULL DEFAULT true,
  strymtv_enabled BOOLEAN NOT NULL DEFAULT false,
  cohort_allowlist TEXT[] NOT NULL DEFAULT '{}',
  ttl_seconds INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT player_route_control_singleton CHECK (id = 1),
  CONSTRAINT player_route_control_schema CHECK (schema_version = 1),
  CONSTRAINT player_route_control_ttl CHECK (ttl_seconds BETWEEN 15 AND 900),
  CONSTRAINT player_route_control_cohort_size CHECK (cardinality(cohort_allowlist) <= 20)
);

COMMENT ON TABLE public.player_route_control IS
  'Optional StrymTV kill switch. killed=true disables the optional action for every client. '
  'No stream URLs or user identifiers. Writes are service_role after an admin session check.';

COMMENT ON COLUMN public.player_route_control.killed IS
  'Server kill. When true, clients must hide StrymTV even if a local opt-in or cached allow exists.';

COMMENT ON COLUMN public.player_route_control.strymtv_enabled IS
  'Separate from the kill flag. Default false. This migration does not enable playback.';

COMMENT ON COLUMN public.player_route_control.cohort_allowlist IS
  'Optional non-secret cohort tokens. Empty admits nobody. Not a list of user ids.';

COMMENT ON COLUMN public.player_route_control.ttl_seconds IS
  'Server hint, 15 to 900 seconds. Clients trust a successful allow for at most 60 seconds.';

INSERT INTO public.player_route_control (id, schema_version, killed, strymtv_enabled, cohort_allowlist, ttl_seconds)
VALUES (1, 1, true, false, '{}', 60)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.player_route_control ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.player_route_control FROM PUBLIC;
REVOKE ALL ON TABLE public.player_route_control FROM anon;
REVOKE ALL ON TABLE public.player_route_control FROM authenticated;
GRANT SELECT ON TABLE public.player_route_control TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.player_route_control TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'player_route_control'
      AND policyname = 'player_route_control_read'
  ) THEN
    CREATE POLICY player_route_control_read
      ON public.player_route_control
      FOR SELECT
      TO authenticated
      USING (id = 1);
  END IF;
END $$;
