# Streaming Affiliate Setup Guide

## Overview

When a NORMA user taps "Watch Now" on a streaming provider that has an affiliate tag configured, NORMA appends the tag to the universal link (web fallback) and logs the event in `streaming_affiliate_events`. If the user subsequently subscribes, the streaming service credits NORMA with a referral commission.

This is a near-zero-cost revenue channel — the deep link infrastructure already exists. The only requirement is enrolling in each provider's affiliate program and updating the affiliate tag in the database.

---

## Step 1: Enroll in ESPN+ Affiliate Program

**Program:** Disney Affiliate Program (covers ESPN+, Disney+, Hulu)

1. Go to `https://affiliate.disney.com`
2. Apply under the "Entertainment / Sports" category
3. Use `getnorma.app` as the website URL
4. In the application, describe NORMA: "Sports alert mobile app that routes users to streaming providers when games are live"
5. Once approved, you'll receive an affiliate tag (typically a numeric code)
6. Update the database:
   ```sql
   UPDATE public.streaming_providers
   SET affiliate_tag = 'YOUR_ACTUAL_TAG'
   WHERE key = 'espn_plus';
   ```

**Commission rate:** Approximately $5–$10 per new ESPN+ subscription. Disney's program is managed through Commission Junction (CJ Affiliate) or Impact.

---

## Step 2: Enroll in Amazon Associates (Prime Video)

**Program:** Amazon Associates

1. Go to `https://affiliate-program.amazon.com`
2. Sign in with your Amazon account (`dtmaloney@gmail.com` or a business account)
3. Under "Website and Mobile App list," add `getnorma.app`
4. Your tracking ID will be in the format `norma-20` (or similar)
5. Update the database:
   ```sql
   UPDATE public.streaming_providers
   SET affiliate_tag = 'norma-20'
   WHERE key = 'prime_video';
   ```

**Commission rate:** Amazon Associates pays a flat referral fee for Prime memberships — typically $3–$10 per signup.

---

## Step 3: Run the Seeds SQL

After getting your real tags, update `supabase/seeds/streaming_providers_affiliate_update.sql` with the actual tags and run it in the Supabase SQL editor.

---

## How Tags Are Appended

- **ESPN+**: Tag appended as `?ref={tag}` to the universal link
- **Prime Video**: Tag appended as `?tag={tag}` (Amazon Associates convention)
- Tags are **not** appended to `ios_scheme` or `android_deep_link` — affiliate tracking only applies to web fallback (universal_link)

Example URL with tag:
```
https://plus.espn.com/watch?ref=norma12345
https://www.amazon.com/gp/video/homepage?tag=norma-20
```

---

## Tracking Conversions

- **Tap events**: Automatically logged to `streaming_affiliate_events` when a user with an affiliated provider triggers the web fallback
- **Subscription confirmations**: Require a server-to-server callback from the streaming provider. This is a future upgrade available once a formal partnership is in place
- **Dashboard**: View at `/admin/revenue/affiliates` — shows taps, confirmed subscriptions, and estimated commissions

---

## Checking Current Status

```sql
SELECT key, name, affiliate_tag
FROM public.streaming_providers
WHERE affiliate_tag IS NOT NULL;
```

Tags containing "PLACEHOLDER" or "TAG" in all-caps are placeholders — replace before going live.
