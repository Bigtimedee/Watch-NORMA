-- NORMA Social Media — Tables & Storage
-- Migration 028: social_accounts, social_posts, and social-images storage bucket

-- ---------------------------------------------------------------------------
-- social_accounts: one row per platform, holds OAuth credentials + metadata
-- ---------------------------------------------------------------------------
CREATE TABLE public.social_accounts (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  platform          TEXT NOT NULL UNIQUE,        -- x | instagram | facebook | tiktok | reddit
  account_id        TEXT,                         -- platform's user/page ID
  account_name      TEXT,                         -- @handle or page name (for logging)
  access_token      TEXT NOT NULL,
  refresh_token     TEXT,
  token_expires_at  TIMESTAMPTZ,
  is_active         BOOLEAN DEFAULT true,
  metadata          JSONB DEFAULT '{}',           -- platform-specific extras (e.g., ig_user_id, page_id)
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Service role only — no RLS exposure to app users
-- (Edge Functions run with service role key and bypass RLS)

-- ---------------------------------------------------------------------------
-- social_posts: generated + published content, one row per platform per day
-- ---------------------------------------------------------------------------
CREATE TABLE public.social_posts (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  platform           TEXT NOT NULL,               -- x | instagram | facebook | tiktok | reddit
  status             TEXT NOT NULL DEFAULT 'pending',
    -- pending | generated | published | failed | skipped
  post_type          TEXT NOT NULL,               -- game_preview | norma_knew | recap | app_promo
  scenario           TEXT,                        -- dinner | gym | grocery_store | wedding_reception | ...
  character_angle    TEXT,                        -- hero | jealous_partner | late_friend
  content_text       TEXT,
  image_prompt       TEXT,
  image_url          TEXT,                        -- public Supabase Storage URL
  game_id            TEXT REFERENCES public.games(id) ON DELETE SET NULL,
  scheduled_for      TIMESTAMPTZ,
  platform_post_id   TEXT,                        -- returned by platform API on publish
  error_detail       TEXT,
  generated_at       TIMESTAMPTZ,
  published_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_social_posts_status   ON public.social_posts(status, scheduled_for);
CREATE INDEX idx_social_posts_platform ON public.social_posts(platform, status);
CREATE INDEX idx_social_posts_game     ON public.social_posts(game_id) WHERE game_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Supabase Storage bucket for generated images (public, served via CDN)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('social-images', 'social-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow service role to upload (Edge Functions run as service role, which bypasses RLS,
-- but explicit policies make intent clear and handle future anon uploads if needed)
CREATE POLICY "Service role can upload social images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'social-images');

-- Public CDN read access so image_url works without auth
CREATE POLICY "Public can read social images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'social-images');
