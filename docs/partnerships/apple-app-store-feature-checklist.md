# Apple App Store Feature Checklist — Watch NORMA

## What Apple's Editorial Team Looks for in Sports Apps

Apple's App Store editorial team selects apps to feature based on a combination of design quality, technical craft, and cultural timeliness. For sports apps specifically, they look for:

**Design and experience**
- Adherence to iOS Human Interface Guidelines (HIG): native navigation, standard controls, correct use of SF Symbols and Dynamic Type
- Dark mode support with a coherent visual identity (NORMA uses `userInterfaceStyle: automatic`)
- Seamless onboarding that reaches core value within 60 seconds of first launch
- Thoughtful use of haptics, animations, and system transitions

**Apple technology integration**
- Sign In with Apple (confirmed active in NORMA)
- Native push notifications via APNs, including rich notification payloads
- Universal links and deep link handling for shared content
- Privacy-respecting design: minimal permissions, clear purpose strings, no tracking without explicit consent

**Sports-specific signals**
- Real-time data with low-latency updates during live events
- Personalization: the app understands what a specific fan cares about, not just what is happening in the sport broadly
- Utility at moments that matter, not ambient noise

**Cultural timeliness**
- Apps that launch or update major features ahead of a high-profile sports calendar event are strong candidates for editorial curation
- The editorial team plans features 4 to 6 weeks in advance; submissions must arrive before that window closes

---

## App Store Listing Quality Checklist

### App Name and Subtitle
- [ ] App name is unique and searchable: "NORMA"
- [ ] Subtitle (30 characters max) is benefit-focused, not feature-focused
  - Suggested: "Know exactly when to tune in"

### Description (4,000 characters max)
- [ ] First paragraph leads with the user benefit, not the technology
- [ ] Mentions sports explicitly: NCAA, NBA, MLB, NFL, NHL
- [ ] Explains the core differentiator: alerts fired at the precise moment a fan's stake is on the line
- [ ] Includes a short paragraph on privacy and data practices
- [ ] No generic filler language ("best app", "must have")
- [ ] Ends with a clear call to action

### Keywords (100 characters max, comma-separated)
- [ ] Include high-intent terms: sports alerts, bet tracker, live game notifications, NCAA basketball, parlay tracker
- [ ] Avoid duplicating words already in the app name or subtitle
- [ ] Prioritize keywords Apple Search Ads data shows have volume in the sports category

### Screenshots (iPhone 6.9" + 6.5" required; iPad if supported)
- [ ] First screenshot communicates the core value proposition without text
- [ ] Screenshots show real product UI, not illustrated mockups
- [ ] Captions are benefit-led, action-oriented (not "See your alerts" but "Know the moment your spread goes live")
- [ ] At least one screenshot shows a push notification in context
- [ ] At least one screenshot shows the bet slip scan or wager tracking UI

### App Preview Video (optional but strongly recommended for editorial consideration)
- [ ] 15 to 30 seconds, no voiceover required
- [ ] Opens with the notification arriving at a high-stakes game moment
- [ ] Demonstrates the full flow: alert fires, user opens app, sees "Why Now" explanation

### App Icon
- [ ] Renders clearly at 1024x1024 and at 60x60 (home screen small)
- [ ] Distinctive in a grid of sports apps; does not look like a generic score tracker

### Ratings and Reviews
- [ ] Prompt for a review at a moment of delight (after a bet resolves correctly, after a close-game alert)
- [ ] Respond to all reviews publicly

---

## Apple Technologies Already in NORMA

The following Apple platform technologies are confirmed active in `app.json` and the codebase:

| Technology | Implementation |
|---|---|
| Sign In with Apple | `usesAppleSignIn: true`; `expo-apple-authentication` plugin |
| Apple Push Notifications (APNs) | `UIBackgroundModes: [remote-notification]`; Expo Push API backed by APNs |
| Deep Links / Universal Links | Custom scheme `norma://`; `LSApplicationQueriesSchemes` for 24 partner apps |
| Camera and Photo Library | `NSCameraUsageDescription` + `NSPhotoLibraryUsageDescription` for bet slip OCR |
| Dark Mode | `userInterfaceStyle: automatic` |
| New Architecture | `newArchEnabled: true` (React Native Bridgeless / JSI) |

Technologies to add before submitting for feature consideration:
- [ ] WidgetKit: live score widget for a followed game, updates during game
- [ ] Live Activities / Dynamic Island: active bet status during live game
- [ ] Shortcuts / Siri Intents: "Hey Siri, check my Duke bet"

---

## Best Timing for Feature Submission

Submit the feature request 6 weeks before the target event date. Use the internal Apple Developer Relations contact form, not the generic App Store support channel.

| Sports Calendar Event | Target Feature Window | Submit By |
|---|---|---|
| March Madness (Selection Sunday ~March 15) | App Store feature during tournament | Early February |
| NBA Playoffs (begin mid-April) | Feature at start of playoffs | Early March |
| MLB Opening Day (late March) | Feature during opening week | Mid-February |
| NFL Kickoff (early September) | Feature at start of season | Late July |
| NCAA Football Championship (early January) | Feature during bowl/playoff season | Late November |

For 2027 planning: March Madness submission deadline is approximately February 1, 2027.

---

## How to Contact Apple Developer Relations

**Primary channel — App Store Feature Nomination:**
Use the nomination form at [developer.apple.com/contact/app-store/](https://developer.apple.com/contact/app-store/) under "App Store Editorial."

**Steps:**
1. Log in with the Apple ID associated with the developer account (`d10dave` / `com.norma.app`)
2. Select "App Store Editorial and Featuring"
3. Select "I'd like to nominate my app to be featured"
4. Complete the form: app name, App Store URL, target feature window, brief pitch (2 to 3 sentences), notable Apple technologies used
5. Attach the app preview video if available

**WWDC / Developer Relations:**
If attending WWDC or holding an Apple Developer account at the Paid tier, request a one-on-one lab session with the App Store team during the conference. These sessions have a higher conversion rate for editorial discussion than the online form.

**App Review contact (separate from editorial):**
For App Review issues only: [developer.apple.com/contact/](https://developer.apple.com/contact/)

**App Store Connect:**
After submitting a new build, flag the "What's New" section with language about notable Apple technology use. Editorial teams monitor App Store Connect release notes for feature candidates.
