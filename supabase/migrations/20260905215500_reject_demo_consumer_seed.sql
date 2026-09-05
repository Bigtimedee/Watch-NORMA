-- Guardrail only. Does NOT delete or update existing games/alerts.
-- Prod was already purged of screenshot fixtures (2026-09-05).
--
-- Blocks INSERT/UPDATE of:
--   games.id ILIKE 'demo-%'
--   alerts.game_id ILIKE 'demo-%' OR alerts.title ILIKE '%DEMO SCREENSHOT%'
-- unless the session sets app.allow_demo_seed = '1' on a non-production DB.
-- Production project ref shijrazlzawjpobrpmnt must never set that GUC.
-- Also hide leftover demo rows from the consumer SELECT policies (service
-- role still bypasses RLS). Real ESPN ids (espn-ncaaf-401856660) are kept.

CREATE OR REPLACE FUNCTION public.reject_demo_consumer_seed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allow_seed text;
  app_env text;
BEGIN
  allow_seed := current_setting('app.allow_demo_seed', true);
  app_env := lower(coalesce(current_setting('app.environment', true), ''));

  IF TG_TABLE_NAME = 'games' THEN
    IF NEW.id IS NOT NULL AND NEW.id ILIKE 'demo-%' THEN
      IF allow_seed IS DISTINCT FROM '1' THEN
        RAISE EXCEPTION
          'Refusing demo game %: SET LOCAL app.allow_demo_seed = ''1'' is required and must only be used on a non-production database. Production (shijrazlzawjpobrpmnt) must never contain demo-%% games.',
          NEW.id
          USING ERRCODE = 'check_violation';
      END IF;
      IF app_env IN ('production', 'prod') THEN
        RAISE EXCEPTION
          'Refusing demo game %: app.environment=% is production.',
          NEW.id, app_env
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'alerts' THEN
    IF (NEW.game_id IS NOT NULL AND NEW.game_id ILIKE 'demo-%')
       OR (NEW.title IS NOT NULL AND NEW.title ILIKE '%DEMO SCREENSHOT%') THEN
      IF allow_seed IS DISTINCT FROM '1' THEN
        RAISE EXCEPTION
          'Refusing demo alert: SET LOCAL app.allow_demo_seed = ''1'' is required and must only be used on a non-production database.'
          USING ERRCODE = 'check_violation';
      END IF;
      IF app_env IN ('production', 'prod') THEN
        RAISE EXCEPTION
          'Refusing demo alert: app.environment=% is production.',
          app_env
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.reject_demo_consumer_seed() IS
  'Blocks demo-% games and DEMO SCREENSHOT alerts unless app.allow_demo_seed=1 on a non-prod DB. Does not delete rows.';

DROP TRIGGER IF EXISTS trg_reject_demo_games ON public.games;
CREATE TRIGGER trg_reject_demo_games
  BEFORE INSERT OR UPDATE ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_demo_consumer_seed();

DROP TRIGGER IF EXISTS trg_reject_demo_alerts ON public.alerts;
CREATE TRIGGER trg_reject_demo_alerts
  BEFORE INSERT OR UPDATE ON public.alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_demo_consumer_seed();

DROP POLICY IF EXISTS "Anyone reads games" ON public.games;
CREATE POLICY "Anyone reads games"
  ON public.games
  FOR SELECT
  USING (id NOT ILIKE 'demo-%');

DROP POLICY IF EXISTS "Users read own alerts" ON public.alerts;
CREATE POLICY "Users read own alerts"
  ON public.alerts
  FOR SELECT
  USING (
    auth.uid() = user_id
    AND (game_id IS NULL OR game_id NOT ILIKE 'demo-%')
    AND title NOT ILIKE '%DEMO SCREENSHOT%'
  );
