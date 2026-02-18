-- Fix streaming provider URLs: use direct watch/live pages, not marketing homepages
-- Also verify iOS schemes match current app bundle schemes

-- ESPN+ — sportscenter:// is correct for ESPN app
UPDATE streaming_providers SET
  web_url = 'https://plus.espn.com/watch'
WHERE key = 'espn_plus';

-- CBS Sports
UPDATE streaming_providers SET
  web_url = 'https://www.cbssports.com/live/'
WHERE key = 'cbs_sports';

-- Paramount+ — direct live TV page
UPDATE streaming_providers SET
  web_url = 'https://www.paramountplus.com/live-tv/'
WHERE key = 'paramount_plus';

-- TNT — use truTV/TNT unified app scheme
UPDATE streaming_providers SET
  web_url = 'https://www.tntdrama.com/watchtnt'
WHERE key = 'tnt_drama';

-- TBS
UPDATE streaming_providers SET
  web_url = 'https://www.tbs.com/watchtbs'
WHERE key = 'tbs';

-- truTV
UPDATE streaming_providers SET
  web_url = 'https://www.trutv.com/watchtrutv'
WHERE key = 'trutv';

-- Max (formerly HBO Max) — play.max.com is the direct player
UPDATE streaming_providers SET
  ios_scheme = 'hbomax://',
  web_url = 'https://play.max.com'
WHERE key = 'max';

-- Peacock — direct live TV page
UPDATE streaming_providers SET
  web_url = 'https://www.peacocktv.com/watch/live-tv'
WHERE key = 'peacock';

-- YouTube TV — live channel view
UPDATE streaming_providers SET
  web_url = 'https://tv.youtube.com/live'
WHERE key = 'youtube_tv';

-- Hulu + Live TV — direct live TV
UPDATE streaming_providers SET
  web_url = 'https://www.hulu.com/live-tv'
WHERE key = 'hulu_live';

-- Fubo — direct watch page
UPDATE streaming_providers SET
  web_url = 'https://www.fubo.tv/welcome'
WHERE key = 'fubo';

-- Sling TV — direct watch page
UPDATE streaming_providers SET
  web_url = 'https://watch.sling.com'
WHERE key = 'sling';

-- DIRECTV STREAM — direct watch page
UPDATE streaming_providers SET
  web_url = 'https://stream.directv.com/watchnow'
WHERE key = 'directv_stream';

-- Xfinity Stream — direct live TV
UPDATE streaming_providers SET
  web_url = 'https://www.xfinity.com/stream/live-tv'
WHERE key = 'xfinity';

-- Spectrum TV — direct live TV
UPDATE streaming_providers SET
  web_url = 'https://watch.spectrum.net/livetv'
WHERE key = 'spectrum';
