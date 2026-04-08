-- Migration 053: Fix YouTube TV deep link — remove broken universal_link, set iOS scheme
--
-- Root cause: Migration 052 set universal_link = 'https://tv.youtube.com'.
-- On iOS, Linking.openURL() with an HTTPS URL ALWAYS opens Safari — Universal
-- Links only activate from user-initiated taps in a browser/email context, never
-- from programmatic Linking.openURL calls. So migration 052 sent every "Watch on
-- YouTube TV" tap to the Safari signup page.
--
-- Fix:
--   1. Null out universal_link (HTTPS never launches the app programmatically).
--   2. Set ios_scheme = 'vnd.youtube.yttv://' — the iOS custom URL scheme registered
--      by the YouTube TV app (com.google.ios.youtubeunplugged). This is the scheme
--      that Linking.openURL can use to open the installed app directly.
--
-- Fallback behavior after this migration:
--   Step 1: Linking.openURL('vnd.youtube.yttv://') — opens YouTube TV app if installed.
--           If the app is not installed or the scheme is wrong, openURL throws and
--           execution falls through to Step 3.
--   Step 2: universal_link = NULL — skipped.
--   Step 3: fallback_store_url (App Store) — user taps "Open" if app is installed.
--           This is the same one-tap-extra experience that existed before migration 052,
--           which is strictly better than being routed to a Safari signup page.

UPDATE public.streaming_providers
SET
  ios_scheme     = 'vnd.youtube.yttv://',
  universal_link = NULL
WHERE key = 'youtube_tv';
