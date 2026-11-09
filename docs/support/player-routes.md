# Support: customer player routes

The player-route feature is experimental and not available to customers. Profile hides "Your own player" unless a build flag admits the account or this device already has saved routes or a reinstall lock. The current App Store build does not admit anyone, and it will not open StrymTV.

## What NORMA stores

A stream address, if a future build lets someone save one, lives only in this device's Keychain (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), under that NORMA account. It is removed when that person signs out or deletes the account. Keychain items can survive an app reinstall. After reinstall, NORMA locks those routes and will not open them until the person deletes them or reviews them. Review does not by itself turn opening back on.

`WHEN_UNLOCKED_THIS_DEVICE_ONLY` is documented by Apple and Expo as not migrating to a new device. It has not been tested here against every same-device backup. Do not tell a customer the address cannot be in a backup.

## What support must not do

- Do not ask a customer to email, chat, or screenshot the stream address. NORMA support tools do not have it, and a screenshot or message would create a copy NORMA should not collect.
- Do not look for the address in Supabase, `app_events`, `deep_link_events`, push payloads, crash reports, or AsyncStorage. The client is written not to put it there. A missing row is not proof a customer never saved one on a device.
- Do not say NORMA checked that the video is legal, is the right channel, or started playing. A user confirmation only means the person said the test looked right. iOS accepting a URL only means the handoff was accepted.
- Do not say the app that opened was StrymTV. Another app can register the same `strymtv` scheme. NORMA cannot authenticate the recipient.
- Do not suggest a VPN, a playlist link, or a way around a blackout. A customer route is not a blackout bypass. Regional and unknown broadcasts do not get an automatic player action.
- Do not tell the customer YouTube TV was replaced. When YouTube TV carries the game, that watch button stays first. There is no setting in this version that overrides it.

## What a customer can do

If the setup screen is reachable, they can delete one mapping or delete all of them even when the feature is switched off. Deletion does not need a network call to finish on the device. NORMA cannot remotely wipe a phone that is offline.

If StrymTV does not open, the message is "StrymTV could not be opened." Offer the normal watch button and, if they want the app, the public App Store listing id 1497450933. Do not say the failure proves StrymTV is not installed.

## v1 address limits

HTTPS HLS addresses ending in `.m3u8` only. No `http`, no local or private hosts, no username/password in the address, and no obvious token or signature query fields. The check is not a guarantee that a saved address contains no secret. Reusable account passwords and long-lived bearer credentials are not a supported v1 input.

Notifications, if a future build registers the action, use one category title: "Open your stream in StrymTV". Expo categories do not give each notification its own button title. The push carries a game id, not an address. A stale button opens NORMA and then the normal game screen when the gates are closed.
