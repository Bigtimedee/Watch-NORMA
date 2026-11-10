# StrymTV device proof of concept

This protocol has not been run. Nothing in the Watch-NORMA unit tests, including a green Jest run on Linux, is an iPhone or StrymTV result. `STRYMTV_ENCODING_GATE` in `lib/player-routes/encoding-gate.ts` stays `blocked` until a person records a trial that meets the pass line below and a later change sets a real contract. Do not edit that gate from a desktop test.

## What is already true in the repo

- Vendor public text documents `strymtv://player/VIDEO LINK`. That is the syntax, not an encoding or playback result.
- The development-only candidates live in `lib/player-routes/encoding-harness.ts`: `raw-nested`, `percent-encoded`, and `reserved-encoded`. Each is marked `deviceVerified: false`. Production handoff does not import that file.
- App and component code must not import the harness. `lib/player-routes/__tests__/boundaries.test.ts` fails if they do.
- `attemptStrymTvHandoff` returns `blocked_unverified_encoding` and does not call `open` while the shipped gate or contract is closed.

## Setup

- iPhone on the oldest iOS NORMA and StrymTV 1.1 both support, and one iPhone on the current iOS NORMA supports. StrymTV listing requires iOS/iPadOS 17 or later. Record the exact StrymTV version, iOS version, device, date, and network.
- NORMA on iPad is an iPhone-compatibility layout (`supportsTablet` is false). Do not describe an iPad result as a native iPad product test unless that is the build you ran.
- A NORMA-controlled HTTPS HLS stream of footage NORMA owns or has a license to use. Put a visible timecode in the picture. Add a non-secret query (`?x=1&y=a%2Fb`). Log requests on that host only.
- Do not use a commercial channel, a playlist from the vendor help page, or a URL with a password, bearer token, or signed-URL credential.
- StrymTV 1.1 from the App Store (id 1497450933, iTelli Apps, LLC). No other app with a similar name.

## Steps

1. From Safari, open each harness candidate for the owned test address. Record whether iOS asks to open an app, which app name is shown, whether video starts, and the exact path and query on the test host.
2. Repeat from Shortcuts, which the vendor describes as a supported place to open the link.
3. Repeat from a throwaway app calling `UIApplication.open` / React Native `Linking.openURL`. Record the completion value separately from whether video was visible. Record the result when StrymTV is not installed. Do not treat a false result as proof about which app is absent: another app can register `strymtv`.
4. Cold start (StrymTV force-quit), warm start (backgrounded), and already playing another stream. At least 10 attempts for each major state and OS combination.
5. Note any ad or interstitial before the first frame. Do not block or strip ads. Record median and worst time to first frame. This is not a NORMA playback-success metric.
6. Try bare `strymtv://` and `strymtv://playlist/<owned playlist>` only as separate experiments. Do not promote either into NORMA if it is undocumented.
7. Compare the burned-in clock with the wall clock. Keep alert delay and stream delay as separate numbers.
8. Local and remote notifications with NORMA foregrounded, backgrounded, and terminated; locked, unlocked, and signed out. Count taps. The NORMA action must foreground NORMA. A push must not contain the stream address.
9. Confirm YouTube TV is still the primary watch button for a carried game when the player control is absent, and still primary if a secondary control is shown.
10. On the owned test host, note unexpected clients. Absence of a request does not prove the player never logs the address.

## Pass line for considering an encoding contract

This is an experiment gate, not a customer reliability promise.

- One candidate plays a visible picture on at least 9 of 10 cold starts and 9 of 10 warm starts, on both OS versions.
- The test host receives the path and query that candidate was supposed to preserve. No double-encoding.
- The candidate id, the exact launch string shape, OS versions, StrymTV version, and recordings are written down.
- A repeated ad, a wrong recipient, or a timing failure can still make the feature unfit even if the URL opens.

Until that packet exists, leave `STRYMTV_ENCODING_GATE.status` as `blocked` and `SHIPPED_STRYMTV_CONTRACT` as `null`.

## Checklist

- [ ] Owned or licensed HTTPS HLS test asset, non-secret query, server log
- [ ] StrymTV 1.1 identity checked (bundle `com.SBTApps.StrymTVApp`)
- [ ] Safari trial for all three candidates
- [ ] Shortcuts trial
- [ ] Throwaway `open` trial, including no handler
- [ ] Cold, warm, and already-playing trials, 10 each
- [ ] Ads and time to first frame recorded, not suppressed
- [ ] Query and percent-encoding checked on the test host
- [ ] Notification path counted, with no URL in the payload
- [ ] Locked, signed-out, and duplicate-tap behavior recorded
- [ ] YouTube TV primary control unchanged
- [ ] Encoding contract still not flipped in the repo
