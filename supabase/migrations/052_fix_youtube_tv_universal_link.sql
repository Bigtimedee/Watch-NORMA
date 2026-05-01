-- Migration 052: Fix YouTube TV deep link
--
-- Root cause: ios_scheme = 'youtube-tv://' is NOT a registered iOS URL scheme
-- for the YouTube TV app. Linking.openURL throws, universal_link is NULL
-- (cleared by migrations 036 and 039), so the fallback lands on the App Store.
-- This forces users to tap "Open" a second time even though the app is installed.
--
-- Fix: Set universal_link = 'https://tv.youtube.com', which iOS routes directly
-- to the installed YouTube TV app via Universal Links. If the app is not
-- installed, iOS opens the URL in Safari instead of the App Store.
-- Also null out ios_scheme since 'youtube-tv://' does not work.

UPDATE public.streaming_providers
SET
  universal_link = 'https://tv.youtube.com',
  ios_scheme     = NULL
WHERE key = 'youtube_tv';
