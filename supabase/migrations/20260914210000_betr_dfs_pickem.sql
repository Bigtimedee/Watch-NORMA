-- Betr (Betr Picks) as a dfs_pickem provider — Phase A
--
-- Canonical key: `betr` (NOT betrivers, NOT betr_picks).
-- Category: dfs_pickem — same bucket as PrizePicks / Underdog (migration 092).
-- provider_type: sportsbook (existing pick'em discriminator; category is the split).
-- auth_mode: deep_link_only — no OAuth / credentials.
--
-- Native ios_scheme is NULL. Do not invent `betr://`. v1 is OneLink / store first.
-- See docs/betr-integration-plan.md § Phase A.
--
-- ON CONFLICT (key) DO UPDATE so this migration is safe to re-run.
-- Do not edit 092_prizepicks_underdog_dfs_pickem.sql or
-- 20260904183000_dfs_fantasy_integration_fixes.sql.

INSERT INTO public.streaming_providers (
  key, name, provider_type, ios_scheme, ios_app_store_url,
  android_package, web_url, active, universal_link, fallback_store_url,
  auth_mode, category
) VALUES
(
  'betr',
  'Betr',
  'sportsbook',
  NULL,
  'https://apps.apple.com/us/app/betr-picks-daily-fantasy/id1635215598',
  'app.instabet.betr',
  'https://www.betr.app/picks',
  true,
  'https://betr.onelink.me/VZxy/betrapp',
  'https://apps.apple.com/us/app/betr-picks-daily-fantasy/id1635215598',
  'deep_link_only',
  'dfs_pickem'
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

-- follows.fantasy_source already exists (20260904183000). Document betr as a
-- valid platform key so ImportRosterSheet's picker value is not a surprise.
COMMENT ON COLUMN public.follows.fantasy_source IS
  'Fantasy/DFS platform key when source=fantasy: prizepicks, underdog, betr, sleeper, espn_fantasy, yahoo_fantasy, draftkings_dfs, other.';

-- ── sportsbook_restrictions for Betr Picks ───────────────────────────────────
-- useSportsbookGeo is fail-closed: a missing row means every Betr CTA reads
-- "Not available in your region". Seed Picks = Yes states only — not Arcade,
-- Social Sports (SSBK), or Social Casino (those are later keys if ever added).
--
-- Primary source (product matrix, retrieved 2026-09-08, re-checked 2026-09-14):
--   https://help.betr.app/en/articles/9461963-which-states-allow-betr-picks
--   Columns: Picks / Arcade / Social Sports / Social Casino.
--   Picks = Yes is 33 states + DC, including TN.
--   Asterisk = Group Play (peer-to-peer) only. Same policy as Underdog
--   "classic Pick'em OR Champions": peer-to-peer-only states stay eligible.
--
-- Cross-check — Play Store + App Store "Where To Play"
--   Play: https://play.google.com/store/apps/details?id=app.instabet.betr
--         (updated 2026-09-04) — "33 states & DC" enumerated as:
--     AL AK AR AZ CA CO DC DE FL GA IL IN KS KY MA MN
--     NE NM NH NC ND OK OR RI SC SD TX UT VT VA WV WI WY
--   That list is 32 states + DC (marketing count is off by one) and OMITS TN.
--   App Store id 1635215598: https://apps.apple.com/us/app/betr-picks-daily-fantasy/id1635215598
--
-- TN discrepancy: help-center matrix lists TN as Picks = Yes; Play/App Store
-- "Where To Play" omits TN. Phase A includes TN. Fail-closed (dropping TN)
-- is worse than advertising a help-center-legal state — users in TN would
-- otherwise never see a Betr CTA. Re-verify in-app from a TN account before
-- treating TN as final; drop TN in a follow-up migration if Betr rejects it.
--
-- Do not seed (Picks = No on the help-center matrix):
--   CT HI IA ID LA MD ME MI MO MS MT NJ NV NY OH PA WA
-- Several of those still have Arcade or Social Sports — irrelevant for `betr`.
--
-- Age notes (help-center identity article, not encoded here — same as PP/UD):
--   18+ general; 19+ AL & CO; 21+ AZ, MA, VA.
-- College-sport subset is narrower (help.betr.app article 9828611). This table
-- is state-only; do not encode per-sport blocks in v1.
--
-- Do not copy PrizePicks / Underdog arrays. Betr has no NY; TN is disputed
-- across sources and is included here per the help-center Picks column.

INSERT INTO public.sportsbook_restrictions (sportsbook_key, allowed_states) VALUES
  (
    'betr',
    ARRAY[
      'AK','AL','AR','AZ','CA','CO','DC','DE','FL','GA',
      'IL','IN','KS','KY','MA','MN','NC','ND','NE','NH',
      'NM','OK','OR','RI','SC','SD','TN','TX','UT','VA',
      'VT','WI','WV','WY'
    ]
  )
ON CONFLICT (sportsbook_key) DO UPDATE SET
  allowed_states = EXCLUDED.allowed_states,
  updated_at     = NOW();
