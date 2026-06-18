# Co-Marketing Landing Pages — Partner Brief

## What These Are

NORMA has dedicated landing pages at `/partners/[partnerKey]` (e.g., `/partners/draftkings`) that sportsbook partners can link to from their marketing — bet confirmation emails, app push notifications, or social posts.

The page shows the partner's logo alongside NORMA's logo, a co-branded headline, three bettor-specific value props, and an App Store download button. Every visit is tracked and attributed to the partner via an embedded referral code.

---

## Partner Landing Page URLs

| Partner | URL |
|---------|-----|
| DraftKings | `https://getnorma.app/partners/draftkings` |
| FanDuel | `https://getnorma.app/partners/fanduel` |
| BetMGM | `https://getnorma.app/partners/betmgm` |
| Caesars | `https://getnorma.app/partners/caesars` |
| ESPNBet | `https://getnorma.app/partners/espnbet` |

Pages render a partner logo automatically if a `logo_url` is set in NORMA's `provider_registry` table for that partner key.

---

## Attribution

Each partner has a static referral code (seeded in migration 086). When a user visits the landing page, the click is recorded. When a user downloads the app and signs up, they are attributed to the partner via the referral code embedded in the App Store link.

Conversion metrics (clicks → signups) are visible at `/admin/partners`.

---

## How to Brief a Sportsbook Marketing Team

Send this to the partner's marketing or affiliate contact:

---

**Subject: Watch NORMA — Co-Marketing Link for [Partner] Users**

Hi [Name],

We'd love to feature Watch NORMA to your bettor base. Watch NORMA is a free app that alerts users when their active wagers are live, when to tune in, and when the game is close. It's built specifically for sports bettors.

We've created a co-branded landing page for [Partner] users:

**[Partner Landing Page URL]**

**Suggested placements:**
- Bet confirmation email: "Track this bet in Watch NORMA →" (link)
- App push notification (post-bet-placement): "Get live alerts on this wager. Download Watch NORMA →"
- Social post or story: "Bet smarter with Watch NORMA — track your [Partner] bets in real time."

Every download from your link is attributed to [Partner] in our system. We'll share a monthly report on clicks, installs, and active users sourced from your placement.

No integration required. Just add the link.

Let me know if you'd like custom creative assets or a co-branded email template.

— Dave / NORMA
bd@norma-app.com

---

## Technical Notes

- The landing page is a server-rendered Next.js page — no JS required to load or for the App Store button to work.
- The referral code is appended to the App Store URL (`ref=CODE`). At signup, NORMA reads this code and records the referral in the `referral_codes` table.
- Partners can provide a square PNG or SVG logo URL to be displayed on the page. Update `provider_registry.logo_url` for the partner's key to activate it.
- To add a new partner landing page, run: `INSERT INTO partner_referral_codes (partner_key, code) VALUES ('newpartner', 'newcode');` — the page will render automatically if a matching `provider_registry` row exists.
