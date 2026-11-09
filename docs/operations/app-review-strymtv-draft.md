# App Review notes — customer player routes (DRAFT)

This draft has not been submitted to Apple. Counsel has not reviewed it and has not signed off. Dave approved building the gated feature. That is not approval to ship it, to file these notes, or to contact iTelli Apps, LLC.

Do not paste this into App Store Connect while `STRYMTV_ENCODING_GATE` is blocked and the build flags are off. If a later build enables the feature, replace this draft with notes that match that build and the device evidence.

## Draft reviewer note

NORMA is a sports alerts app. It works without any third-party player installed.

This build includes an experimental, default-off option for a customer to save their own HTTPS HLS address and later hand that address to iOS using the public `strymtv://player/` text published by StrymTV (App Store id 1497450933, seller iTelli Apps, LLC). The option is not available in this build:

- The in-app flags are off and no cohort is admitted.
- NORMA has no remote feature-flag service, so there is no server switch that turns the option on.
- The app refuses to build a StrymTV launch URL until an iPhone trial records how that app decodes the address. That trial has not been run.
- Profile does not show the setup screen. Game detail does not show a second watch button. Pushes do not include a player action or a stream address.
- NORMA does not bundle playlists, channel lists, or stream addresses. It does not play video inside NORMA.

YouTube TV remains the watch button when the customer uses YouTube TV and the game is on a network YouTube TV carries.

If a future build enables the option, a reviewer would need a NORMA-owned HTTPS HLS test address, a StrymTV install, and an account that has been opted in. The customer, not NORMA, supplies the address. Opening it discloses the address to iOS and to whichever app handles the `strymtv` scheme. NORMA cannot prove which app that is. NORMA cannot tell whether playback started.

## What not to claim

- Do not say NORMA is a partner of StrymTV or iTelli Apps.
- Do not say the feature plays the right channel, starts without an ad, or confirms playback.
- Do not say a saved address stays inside NORMA. The handoff is the point of a later build, and it leaves the app.
- Do not say counsel, Apple, or the vendor has approved this draft.

## Related guidelines to re-read before any submission

Guideline 2.3.1 (accurate notes), 2.5.1 (public APIs), 4.2.3 (the app must work without another app), 5.1.2 (installed-app data), and 5.2.1 through 5.2.3 (third-party services and intellectual property). App Store presence of StrymTV does not approve NORMA's use of it.
