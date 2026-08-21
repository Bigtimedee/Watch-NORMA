# App surface audit — 2026-08-20

Three parallel agents audited the Alerts tab, the Watch/Connections tab, and
Settings + cross-cutting content against the shipped TestFlight build. Every
claim below cites `file:line` and was reported with evidence; the lead verified
each item marked **verified** independently.

Fixed items are in commits `7867c16` and `4fd828b`. This document records what
was **not** fixed, so it is not lost.

---

## Fixed (for reference)

| # | Defect | Commit |
|---|---|---|
| 1 | Settings → Privacy/Terms links 404 (`d10dave.github.io/norma/*`) — App Store review blocker | `4fd828b` |
| 2 | `NORMA_APP_STORE_URL` missing `/id`, 404, stamped into every shared moment | `4fd828b` |
| 3 | `football_*` + `email_wager_import` alert types unmapped → raw DB strings as badges | `4fd828b` |
| 4 | `alerts.sport` never set → every alert stamped `ncaam` | `4fd828b` |
| 5 | Preferences save dropped `ad_personalization_enabled` → silent re-opt-in | `4fd828b` |
| 6 | Invite link + 8 other refs used `norma-app.com` | `7867c16` |
| 7 | Referral reward promised NFL early access that nothing grants | `7867c16` |

---

## Not fixed — ranked by user impact

### A. Timezone is never collected, and it drives sportsbook geo-eligibility
**Compliance exposure. Highest priority.**

`profiles.timezone` defaults to `America/New_York` and **nothing in `app/`,
`hooks/` or `components/` ever writes it** — only `push_token` is written
(`app/_layout.tsx:168-171`), despite `migrations/058_geo_compliance.sql:5-7`
claiming it is "collected from device on first launch".

Consequences:
- `app/(tabs)/profile/index.tsx:302-310` shows a read-only "Timezone" row that
  is really a hardcoded default, with no control to change it.
- `hooks/useSportsbookGeo.ts:30-45` infers the user's **state** from that field;
  `lib/geo-compliance.ts:2` maps `America/New_York → "NY"`. Every user is
  therefore treated as located in New York. `_shared/auction-engine.ts:142-155`
  does the same server-side.
- A user in a state where a book is not licensed can be shown "Bet Now on
  DraftKings".
- Fail-open compounds it: `useSportsbookGeo.ts:54` leaves `eligible=true` when no
  restriction row exists, and `:63-65` swallows errors and sets `eligible=true`.

**Fix requires** collecting the device timezone on launch and deciding the
fail-closed policy. Not a code-only decision — it is a compliance choice.

### B. Quiet hours are evaluated in UTC
`evaluate-alerts/index.ts:490-503` builds `currentTime` from `new Date().getHours()`
on a UTC runtime and string-compares it against the user's local `quiet_hours_*`.
`morning-briefing/index.ts:293-306` has the same defect and admits it in a
comment. For an Eastern user, 23:00–08:00 actually silences roughly 19:00–04:00
local — **exactly the evening window the app exists to alert on** — while pushing
through at 3–8am. `components/PreferencesSheet.tsx:181` promises otherwise.

Secondary: the two fields are free text with no validation
(`PreferencesSheet.tsx:184-205`). "11pm" is accepted, then `split(":").map(Number)`
yields `NaN` and quiet hours silently never apply.

### C. "Push Notifications" off also kills the in-app Alerts feed
`evaluate-alerts/index.ts:206-209` filters candidates with
`.eq("notifications_enabled", true)` **before any alert row is written**, so with
the toggle off the Alerts tab stays permanently empty. This contradicts both the
toggle's label and `PreferencesSheet.tsx:181` ("In-app alerts still appear").
Either split push delivery from alert creation, or correct the copy.

### D. Watch tab claims carriage it cannot back
- `lib/deep-links.ts:316-319` unconditionally appends `youtube_tv, hulu_live,
  fubo, sling, directv_stream` to **every** broadcast string, so a regional-sports
  -network game shows "Watch on YouTube TV" with no data behind it.
  `migrations/037_add_mlb_tv_provider.sql:5-7` documents this exact failure but
  patched only the MLB case.
- Deep links are bare app schemes (`sportscenter://`), not per-game links;
  `openStreamingApp` even takes a `_gameTitle` it never uses
  (`lib/deep-links.ts:112-114`). Onboarding promises "one tap … no hunting"
  (`app/(auth)/welcome.tsx:32`).
- `"Broadcast TBD"` renders a pressable that does nothing
  (`components/WatchNowButton.tsx:35, 44-77`).
- When every fallback fails, the overlay still animates "Connecting to …" and
  fades out with no error (`hooks/useTapToStream.ts:96-120`).
- Blackout patterns contradict provider mapping: `"NBCS "` is classified as a
  blackout-prone RSN (`deep-links.ts:226`) while anything containing `"NBC"` maps
  to Peacock (`:291-293`).

### E. Email-wager confirmation alert can never be inserted
`ingest-email-wagers/index.ts:491-503` inserts `message` and `status` columns.
`alerts` has `body text not null` and `read boolean`
(`migrations/001_initial_schema.sql:101-113`); no migration adds the other two.
The insert always fails, and the error is discarded at `:493`, so the advertised
"forward your bet emails" flow silently produces nothing.

### F. "Favorite Teams" picker writes to a column no server code reads
`PreferencesSheet.tsx:73-76` saves `user_preferences.favorite_teams`. Alert
candidate generation (`evaluate-alerts/index.ts:147-161`) reads only the
`follows` table, wagers and prediction positions. Picking favourite teams has
zero effect on alerts, while the sheet says it drives them (`:109-112`).

### G. MLB alerts are labelled with basketball concepts
`_shared/alert-scoring.ts:194-202` branches only football vs basketball, so `mlb`
takes the basketball path: `is_overtime = period > 2` means any inning from the
3rd. `buildWhyNow` emits "Game in OT5" for the 7th inning (`:361, 397-399`).

### H. `alerts.why` is written but never displayed
`evaluate-alerts/index.ts:576-578` writes both `why` (hand-written per-sport
copy) and `explanation`; `AlertCard.tsx:184-207` prefers `explanation`, which is
always non-null. The sport-specific copy is dead for every generated alert.

### I. Pre-existing type failures, absent from CI
`evaluate-alerts` (`tournament_round`, `SignalVector`) and `intent-api`
(`keyRow` typed `never`) both fail `deno check` **at HEAD** — verified against the
unmodified file. Neither is in the CI Deno list, so neither has ever been caught.
`poll-*` were added to that list on 2026-08-20; these two should follow, after
the underlying type errors are resolved.

### J. Inconsistent App Store ID on the web
`web/src/app/partners/[partnerKey]/page.tsx:5` hardcodes `id6504228672`, which
disagrees with `id6759508383` used everywhere else and with `ascAppId` in
`eas.json`. Unverified which is intended.
