-- DFS / fantasy integration fixes (2026-09-04 audit)
--
-- 1. follows.fantasy_source — persist the platform selected in ImportRosterSheet.
--    Migration 088 only added `source` ('fantasy' | NULL). Marketing copy claimed
--    a `fantasy_source` column that never existed, so the platform chip was
--    cosmetic and discarded on save.
-- 2. UNIQUE (user_id, entity_type, entity_id) — ImportRosterSheet upserts with
--    onConflict: "user_id,entity_type,entity_id" but no matching constraint
--    existed, so every roster import failed at Postgres.
-- 3. Season-long fantasy providers (Sleeper, Yahoo Fantasy, ESPN Fantasy) in
--    streaming_providers so deep-link metadata exists. category = 'fantasy'
--    (not sportsbook / dfs_pickem). No live API — Tier C connect + paste only.

-- ── 1. fantasy_source column ─────────────────────────────────────────────────
ALTER TABLE public.follows
  ADD COLUMN IF NOT EXISTS fantasy_source TEXT;

COMMENT ON COLUMN public.follows.fantasy_source IS
  'Fantasy/DFS platform key when source=fantasy: prizepicks, underdog, sleeper, espn_fantasy, yahoo_fantasy, draftkings_dfs, other.';

CREATE INDEX IF NOT EXISTS idx_follows_fantasy_source
  ON public.follows(user_id, fantasy_source)
  WHERE fantasy_source IS NOT NULL;

-- ── 2. Dedup + unique constraint for roster upsert ───────────────────────────
-- Keep the oldest row when duplicates exist.
DELETE FROM public.follows a
USING public.follows b
WHERE a.id > b.id
  AND a.user_id = b.user_id
  AND a.entity_type IS NOT DISTINCT FROM b.entity_type
  AND a.entity_id IS NOT DISTINCT FROM b.entity_id
  AND a.entity_type IS NOT NULL
  AND a.entity_id IS NOT NULL;

ALTER TABLE public.follows
  DROP CONSTRAINT IF EXISTS follows_user_entity_unique;

ALTER TABLE public.follows
  ADD CONSTRAINT follows_user_entity_unique
  UNIQUE (user_id, entity_type, entity_id);

-- ── 3. Season-long fantasy providers (deep-link metadata only) ───────────────
INSERT INTO public.streaming_providers (
  key, name, provider_type, ios_scheme, ios_app_store_url,
  android_package, web_url, active, universal_link, fallback_store_url,
  auth_mode, category
) VALUES
(
  'sleeper',
  'Sleeper',
  'fantasy',
  'sleeper://',
  'https://apps.apple.com/us/app/sleeper-fantasy-sports/id1097157041',
  'com.sleeper.app',
  'https://sleeper.com',
  true,
  'https://sleeper.com',
  'https://apps.apple.com/us/app/sleeper-fantasy-sports/id1097157041',
  'deep_link_only',
  'fantasy'
),
(
  'yahoo_fantasy',
  'Yahoo Fantasy',
  'fantasy',
  'yahoosports://',
  'https://apps.apple.com/us/app/yahoo-fantasy-sports-and-daily/id331804375',
  'com.yahoo.mobile.client.android.sportacular',
  'https://sports.yahoo.com/fantasy/',
  true,
  'https://sports.yahoo.com/fantasy/',
  'https://apps.apple.com/us/app/yahoo-fantasy-sports-and-daily/id331804375',
  'deep_link_only',
  'fantasy'
),
(
  'espn_fantasy',
  'ESPN Fantasy',
  'fantasy',
  'sportscenter://',
  'https://apps.apple.com/us/app/espn-fantasy-sports/id317469184',
  'com.espn.score_center',
  'https://fantasy.espn.com',
  true,
  'https://fantasy.espn.com',
  'https://apps.apple.com/us/app/espn-fantasy-sports/id317469184',
  'deep_link_only',
  'fantasy'
)
ON CONFLICT (key) DO UPDATE SET
  name               = EXCLUDED.name,
  provider_type      = EXCLUDED.provider_type,
  ios_scheme         = EXCLUDED.ios_scheme,
  ios_app_store_url  = EXCLUDED.ios_app_store_url,
  android_package    = EXCLUDED.android_package,
  web_url            = EXCLUDED.web_url,
  active             = EXCLUDED.active,
  universal_link     = EXCLUDED.universal_link,
  fallback_store_url = EXCLUDED.fallback_store_url,
  auth_mode          = EXCLUDED.auth_mode,
  category           = EXCLUDED.category;

-- ── 4. sportsbook_restrictions for PrizePicks / Underdog ─────────────────────
-- useSportsbookGeo is fail-closed: a missing row means the CTA always reads
-- "Not available in your region". Migration 058 only seeded DK/FD/MGM/Caesars/
-- PointsBet. Pick'em legality is broader than sportsbook betting in many
-- states, but it is NOT nationwide and it is product-specific. Age minimums
-- (18/19/21) are NOT encoded here — this table is state-only.
--
-- PrizePicks: Player Picks footprint (the product NORMA deep-links to).
-- Official: https://www.prizepicks.com/help-center/where-can-i-play
--           https://www.prizepicks.com/help-center/eligibility
-- Cross-check (2026-09): BettingUSA PrizePicks review Player Picks list.
-- 36 states + DC. Age notes (not enforced here): 19+ AL/CO; 21+ AZ/IL/MA/VA.
-- Legality changes — re-verify against the PrizePicks help center before
-- expanding this list. Do not add Team Picks / Culture Picks-only states.
--
-- Underdog: states with classic Pick'em OR Champions (peer-to-peer pick'em).
-- Exclude drafts-only (MD, MI, NJ, NY, OH, PA, DC) and fully unavailable
-- (CT, HI, ID, IA, LA, ME, MT, NV, WA). Opening the picks board in a
-- drafts-only state would send the user to a product they cannot use.
-- Source: OddsAssist Underdog states table (updated 2026-08-31)
--   https://oddsassist.com/dfs/underdog-states/
-- Cross-check: TheGameHaus Underdog legal-states Pick'em + Champions lists.
-- Re-verify before expanding. Prediction-market-only states are excluded.

INSERT INTO public.sportsbook_restrictions (sportsbook_key, allowed_states) VALUES
  (
    'prizepicks',
    ARRAY[
      'AK','AL','AR','AZ','CA','CO','DC','DE','FL','GA',
      'IL','IN','KS','KY','MA','ME','MN','MO','NC','ND',
      'NE','NH','NM','NY','OK','OR','RI','SC','SD','TN',
      'TX','UT','VA','VT','WI','WV','WY'
    ]
  ),
  (
    'underdog',
    ARRAY[
      'AK','AL','AR','AZ','CA','CO','DE','FL','GA','IL',
      'IN','KS','KY','MA','MN','MO','MS','NC','ND','NE',
      'NH','NM','OK','OR','RI','SC','SD','TN','TX','UT',
      'VA','VT','WI','WV','WY'
    ]
  )
ON CONFLICT (sportsbook_key) DO UPDATE SET
  allowed_states = EXCLUDED.allowed_states,
  updated_at     = NOW();
