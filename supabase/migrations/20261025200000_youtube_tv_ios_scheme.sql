-- YouTube TV's iOS app registers youtubetv:// ; prod had youtube-tv:// which no
-- app handles, so every "Watch on YouTube TV" tap fell through to the App Store.
UPDATE public.streaming_providers
SET ios_scheme = 'youtubetv://', web_url = 'https://tv.youtube.com/'
WHERE key = 'youtube_tv';
