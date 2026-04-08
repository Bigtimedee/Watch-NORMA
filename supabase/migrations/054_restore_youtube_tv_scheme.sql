-- Migration 054: Restore the original working YouTube TV iOS scheme
--
-- Root cause of the regression:
--   Migration 052 incorrectly asserted that ios_scheme = 'youtube-tv://' was
--   NOT a registered URL scheme for the YouTube TV app and replaced it with
--   universal_link = 'https://tv.youtube.com'. That caused every tap to open
--   Safari (Linking.openURL with HTTPS never triggers Universal Links
--   programmatically), landing users on the YouTube TV sign-up page.
--
--   Migration 053 attempted to fix 052 by switching to ios_scheme =
--   'vnd.youtube.yttv://', which is also not a registered scheme, so
--   Linking.openURL threw and the fallback chain ended at the App Store
--   "Open" button — one extra tap.
--
-- Correct state (confirmed from git history and app.json):
--   • 'youtube-tv://' IS registered by the YouTube TV app
--     (com.google.ios.youtubeunplugged) on iOS.
--   • 'youtube-tv' is present in app.json's ios.infoPlist.LSApplicationQueriesSchemes,
--     which is required for Linking.canOpenURL to work AND confirms the scheme
--     was verified working against the installed app prior to v1.2.0.
--   • The original seed (migration 002) set ios_scheme = 'youtube-tv://', and
--     the app successfully opened YouTube TV directly (no extra tap) in all
--     releases before migrations 052 and 053 were applied.
--
-- Fix:
--   Restore ios_scheme = 'youtube-tv://' and clear universal_link.
--   Linking.openURL('youtube-tv://') will open the YouTube TV app if
--   installed. If not installed, it throws and the fallback chain proceeds
--   to the App Store (Step 3) — same single-tap-extra as before 052.

UPDATE public.streaming_providers
SET
  ios_scheme     = 'youtube-tv://',
  universal_link = NULL
WHERE key = 'youtube_tv';
