# Live Moments + Today's Games (growth plan, 2026-11-07)

Dave, 2026-11-07: "Implement NORMA's growth plan starting now." This doc covers the
first content pillars of the plan as shipped in code. Both formats are **additive**: the
existing 3 scheduled posts/day (9a/1p/7p CT, `cmo-generate` -> `cmo-publish`) are unchanged.

## What each platform receives

| Format | X (@watchNORMA) | Instagram Reels | Facebook Page | TikTok |
|---|---|---|---|---|
| Scheduled posts (9a/1p/7p CT) | Video post (video-only rule, 2026-10-18) | Same video, cross-posted | Same video, cross-posted | Same video, cross-posted |
| Live Moments | **Text-only** tweet: moment, score, clock, channel, streams, game-page link | Nothing yet (cross-post requires a video) | Nothing yet | Nothing yet |
| Today's Games | **Text-only** tweet: top games with ET + CT start and channel, `/schedule/<sport>/today` link | Nothing yet | Nothing yet | Nothing yet |

Why X-only: IG Reels, the FB Page video endpoint and TikTok Direct Post all take a video,
and there is no real-time video for a live moment. Rows still carry ready-made,
guard-checked per-platform captions (`content_calendar.platform_captions`), so when a real
video is attached to a row, the existing cross-post sweep posts it with the utility caption.
No AI-generated images or video are used anywhere (hard rule 21).

## Live Moments

- Producer: `supabase/functions/cmo-live-moments` (`{"mode":"live"}`), pg_cron `cmo-live-moments`
  every minute, gated in SQL so it only fires while an NFL/NCAAF/NBA/NCAAM game is in
  progress in its final regulation period or OT.
- Detection is **game-level** and reuses the evaluate-alerts must-notify rules
  (`checkMustNotify` with no user wagers):
  - `overtime`: OT starts (or any OT period is seen, covering college OT with no clock).
  - `two_minute`: football, Q4, 2:00 or less, one-score game (margin 8 or less).
  - `close_finish`: basketball, final regulation period or OT, under 2:00, margin 3 or less.
- Nationally relevant games only: every NFL and NBA game; NCAAF/NCAAM only with an AP
  top-25 team (`games.home_rank` / `away_rank`) or a national network in `games.broadcast`
  (ABC, CBS, NBC, FOX, ESPN, ESPN2, FS1, TNT, TBS, truTV, Peacock, Prime Video, Netflix,
  NFL Network; ESPN+ alone does not count).
- Copy: moment + score + clock, `Watch: <channel>` from `games.broadcast`, `Stream: <names>`
  only when `game_watch_links` has rows for the game (never guessed), and the getnorma.app
  game page with `utm_source=<x|instagram|facebook|tiktok>&utm_campaign=live_moment&utm_content=<moment>`.
  No game page (missing team slug or broadcast) means no post.
- Idempotent: `social_live_moments.moment_key` is UNIQUE (`live_moment:<game_id>:<type>`).
  The ledger row is written before the calendar row, so a game posts each moment type once.
- Rate caps (`_shared/social-formats.ts`, `LIVE_MOMENT_HOURLY_CAP`): 3 per rolling hour on X,
  1 per hour on IG, FB and TikTok. When more moments fire than the cap allows, overtime
  wins, then NFL > NCAAF > NBA > NCAAM, then the closest score. A moment that misses the cap
  is recorded `rate_capped` and never posted later.
- Freshness: a Live Moment X row older than 20 minutes is held as stale instead of tweeted
  (rule 6). Cross-posts of Live Moments also stop after 20 minutes.
- Daily ceiling: Live Moments have their own 24/day X ceiling, separate from the 10/day
  ceiling for everything else, so game days never starve the scheduled slots.

## Today's Games

- `{"mode":"todays_games"}`, pg_cron `cmo-todays-games` at 13:30 UTC (7:30 CT in winter,
  8:30 CT in summer). One post per ET day (`todays_games:<ET date>`).
- Headline sport by ET weekday: Sun/Mon NFL, Thu NFL, Sat NCAAF, other nights NBA then
  NCAAM (falls through to the next sport with games).
- Lists the top games (national TV, ranked teams, prime time) that fit in 270 characters,
  in start order: `BUF @ KC 4:25p ET/3:25p CT, CBS`, then
  `getnorma.app/schedule/<sport>/today?utm_source=x&utm_campaign=todays_games`.

## Platform-split creative guard

`_shared/social-copy-guard.ts` (tested in `social-copy-guard_test.ts`):

- **Instagram, Facebook, TikTok**: block betting vocabulary (bet, wager, odds, spread,
  parlay, sportsbook, moneyline, props, over/under, cover, payout, cash out, DFS, pick'em,
  prediction markets) and sportsbook / DFS / prediction-market brand names. TikTok bans
  gambling promotion; Meta restricts it.
- **X**: betting vocabulary is allowed (the audience includes bettors), but picks, tips and
  guarantee language are blocked: "guaranteed", "lock" (not "lock screen"), "risk-free",
  "sure thing", "can't lose", "best bet", "free/our/my picks", "pick of the day",
  "betting tips", "take the over".
- Enforcement points:
  - `cmo-publish` holds any X row with advice language as `paused` (`advice_language: ...`).
    This applies to every X row, including the scheduled posts.
  - The IG/FB/TikTok cross-post uses `platform_captions[<ig|fb|tiktok>]` when present, else
    the X body, and records `betting_terms_blocked: ...` instead of posting when the caption
    fails the guard. An X body that mentions betting therefore no longer cross-posts unless
    a utility caption is supplied.
  - `cmo-live-moments` only writes captions that pass.

## Operations

- Dry run: `POST /functions/v1/cmo-live-moments {"mode":"live","dry_run":true}` (or
  `"todays_games"`, optionally `"as_of":"<ISO>"`) returns what would be queued, the copy,
  per-platform captions and any guard blocks. No writes, no publish.
- Kill switch for X text-only: set the Edge Function secret `SOCIAL_X_TEXT_FORMATS=none`
  (cmo-publish then holds these rows as `empty_media`, the strict video-only rule).
  To stop producing rows at all, unschedule the two cron jobs.
- No new secrets are needed: X uses the existing `X_*` secrets via `cmo-publish`.
