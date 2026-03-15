-- Fix subscriber-only universal_link values for all streaming/tv providers.
-- These web URLs require an authenticated browser session; opening them from a
-- cold mobile context (no Google/service session) redirects unauthenticated
-- users to the free-trial or sign-in page instead of the service itself.
-- The deep-link fallback chain will now go: native scheme → App Store.

UPDATE public.streaming_providers
SET universal_link = NULL
WHERE provider_type IN ('streaming', 'tv');

-- ── Fix youtube_tv provider_type mismatch ──────────────────────────────────
-- seed.sql incorrectly inserted a youtube_tv connection row with
-- provider_type='streaming'; the catalog defines it as provider_type='tv'.
-- This produces a phantom disconnect for any user who has both rows.
-- Step 1: Delete the duplicate 'streaming' row where the same user already
--         has a 'tv' row for youtube_tv (keep the 'tv' one).
DELETE FROM public.connections c_streaming
WHERE c_streaming.provider_key = 'youtube_tv'
  AND c_streaming.provider_type = 'streaming'
  AND EXISTS (
    SELECT 1
    FROM public.connections c_tv
    WHERE c_tv.user_id       = c_streaming.user_id
      AND c_tv.provider_key  = 'youtube_tv'
      AND c_tv.provider_type = 'tv'
  );

-- Step 2: Fix any remaining youtube_tv rows that are still typed 'streaming'
--         (users who have only the mistyped row, no 'tv' duplicate).
UPDATE public.connections
SET provider_type = 'tv'
WHERE provider_key   = 'youtube_tv'
  AND provider_type  = 'streaming';

-- ── Trigger: enforce provider_type consistency on connections ──────────────
-- Prevent future mismatches by validating that the provider_type stored in
-- connections matches the provider_type defined in the streaming_providers
-- catalog for that provider_key.

CREATE OR REPLACE FUNCTION public.fn_validate_connection_provider_type()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  catalog_type TEXT;
BEGIN
  SELECT provider_type INTO catalog_type
  FROM public.streaming_providers
  WHERE key = NEW.provider_key;

  IF catalog_type IS NOT NULL AND catalog_type <> NEW.provider_type THEN
    RAISE EXCEPTION
      'connections.provider_type (%) does not match streaming_providers.provider_type (%) for key %',
      NEW.provider_type, catalog_type, NEW.provider_key;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_connection_provider_type ON public.connections;

CREATE TRIGGER trg_validate_connection_provider_type
  BEFORE INSERT OR UPDATE ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_connection_provider_type();
