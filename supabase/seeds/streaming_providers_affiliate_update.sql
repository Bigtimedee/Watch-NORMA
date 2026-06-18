-- Streaming provider affiliate tag update
-- Run this after enrolling in each affiliate program to replace placeholder tags.
--
-- ESPN+ Affiliate Program:
--   Enroll at: https://affiliate.disney.com (Disney Affiliate Program)
--   Replace NORMA_ESPN_TAG with the tag provided at enrollment (usually a numeric or alphanumeric code)
--
-- Amazon Associates (Prime Video):
--   Enroll at: https://affiliate-program.amazon.com
--   Tracking ID format is typically "yourname-20" (country-specific suffix)
--   Replace norma-20 with your actual tracking ID
--
-- YouTube TV: No public affiliate program. Leave NULL.
-- Peacock: No public affiliate program. Leave NULL.

-- Step 1: Update ESPN+ tag
UPDATE public.streaming_providers
SET affiliate_tag = 'REPLACE_WITH_ESPNPLUS_TAG'
WHERE key = 'espn_plus';

-- Step 2: Update Amazon Associates tag for Prime Video
UPDATE public.streaming_providers
SET affiliate_tag = 'REPLACE_WITH_AMAZON_TAG'
WHERE key = 'prime_video';

-- Step 3: Verify (uncomment to check)
-- SELECT key, name, affiliate_tag FROM public.streaming_providers
-- WHERE affiliate_tag IS NOT NULL;
