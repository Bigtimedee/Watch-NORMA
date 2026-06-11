# 07 — Security, Privacy, and Risk

## Privacy Principles

Watch-NORMA handles sensitive preference, viewing, account, and betting/market data. The app must minimize collection, protect stored data, and avoid unnecessary retention.

Core principles:
- Collect only what is needed to deliver the product experience.
- Store sensitive data (API keys, wallet addresses) behind Row-Level Security.
- Never log tokens, API keys, or credentials in Edge Function output.
- Give users clear controls (ad personalization toggle, notification preferences, disconnect, delete account).
- Comply with App Store requirements for account deletion and data handling.

## Sensitive Data Categories

| Category | Where It Lives | Sensitivity |
|----------|---------------|-------------|
| Connected streaming accounts | `connections` table (provider key, no credentials) | Low — just indicates "I use this service" |
| Sportsbook connections | `connections` table (provider key, no credentials) | Low — same as streaming |
| Kalshi API credentials | `connections.metadata` (API key ID + RSA private key) | **High** — enables read-only account access |
| Polymarket wallet address | `connections.metadata` (public address) | Medium — public on-chain but links to NORMA identity |
| Notification history | `alerts`, `delivery_log` tables | Medium — reveals user interests and engagement |
| Wager data | `wagers` table | **High** — reveals betting behavior, amounts, outcomes |
| Prediction positions | `prediction_positions` table | **High** — reveals market exposure and P&L |
| Watch behavior (deep link events) | `deep_link_events` table | Low — provider + method + timestamp |
| Location / timezone | `profiles.timezone` | Low — timezone only, no GPS |
| Push tokens | `profiles.push_token` | Medium — Expo push token, device-specific |
| Ad interaction data | `impressions`, `conversions` tables | Medium — reveals engagement patterns |
| Email content (wager parsing) | Processed transiently, not stored | **High** — forwarded sportsbook emails parsed and discarded |
| Advertiser billing | `advertiser_wallets`, Stripe | **High** — financial data |

## Authentication and Authorization

**User authentication:**
- Supabase Auth with email/password and Apple Sign-In (iOS).
- Sessions managed via JWTs. Tokens stored in `expo-secure-store` (encrypted native storage on device).
- Automatic token refresh handled by Supabase JS client.

**Row-Level Security (RLS):**
- All user-facing tables have RLS enabled with policies restricting access to the user's own rows (e.g., `auth.uid() = user_id`).
- Edge Functions that need to write across users use the `SUPABASE_SERVICE_ROLE_KEY` (admin key, never exposed to the client).

**Advertiser authentication:**
- Advertiser portal uses Supabase Auth (email/password).
- Admin pages check for `admin` role via `_shared/admin.ts`.
- Admin role assigned via migration 024 (`admin_role` in Supabase auth).
- The web middleware (`web/src/middleware.ts`) enforces auth on protected routes.

**Protected routes:**
- All `/(tabs)/` routes in the mobile app require authentication (enforced by `AuthGate` in root layout).
- All `/dashboard`, `/campaigns`, `/billing`, etc. routes in the web portal require auth (enforced by middleware).
- Admin routes (`/admin/*`) require the admin role.

## Secrets Management

- **Environment variables:** All secrets are managed as Supabase secrets (`supabase secrets set`) and accessible only to Edge Functions at runtime. They are never committed to the repository.
- **`.env.example`:** Contains only placeholder values for the three client-side variables (Supabase URL, anon key, SportsDataIO key).
- **`.gitignore`:** Excludes `.env`, `.env.local`, `.env.production`, and other sensitive files.
- **CI/CD secrets:** `EXPO_TOKEN` is stored as a GitHub Actions secret for OTA updates.
- **Kalshi credentials:** RSA private keys are stored in `connections.metadata`. RLS ensures only the owning user can access their own connection record. For future partner API integrations, the CLAUDE.md plan calls for `pgcrypto` column-level encryption.
- **Stripe keys:** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are Supabase secrets. The webhook handler verifies Stripe's signature before processing.
- **Google service account:** `GOOGLE_SERVICE_ACCOUNT_JSON` is a Supabase secret used for Gmail API access (email wager ingestion).

**Production warnings:**
- Never `console.log` tokens, API keys, or user credentials in Edge Functions.
- Never include actual secret values in commits, PRs, or documentation.
- Rotate compromised keys immediately via Supabase secrets management.

## Legal / Regulatory Risk Areas

| Risk Area | Current State | Notes |
|-----------|---------------|-------|
| **Gambling/betting data** | App tracks wagers and prediction positions. | Does not provide betting advice or facilitate bets. Manual entry + OCR + email parsing only. |
| **Sportsbook referral ads** | Sportsbook CTAs appear in alert cards. | Must comply with state-by-state gambling advertising laws. Geographic targeting not yet enforced. |
| **Prediction-market referral** | Kalshi/Polymarket links in app. | Kalshi is CFTC-regulated. Polymarket has varying regulatory status. |
| **Geofencing** | Not implemented. | Sportsbook ads may need to be suppressed in states where that book is illegal. Known gap. |
| **Age gating** | App Store rating and restrictions. | App must not serve betting-related content to minors. Age verification is delegated to the sportsbook/platform. |
| **Privacy disclosures** | Privacy policy exists (`docs/privacy-policy.html`). | Must accurately describe data collection, especially wager data, prediction positions, and email parsing. |
| **Push notification consent** | iOS system prompt + in-app toggle. | iOS handles consent natively. Users can disable push in Profile settings. |
| **Streaming provider terms** | Deep linking to streaming apps. | Deep links use public URL schemes. No scraping or unauthorized API access. |
| **Data-provider licensing** | ESPN (free/public), SportsDataIO (licensed), Sportradar (licensed), The Odds API (licensed). | API keys have usage terms and rate limits. Sportradar data may have redistribution restrictions. |
| **GDPR / data deletion** | `delete-account` function performs full deletion across all tables. | Compliant with App Store and GDPR requirements for right-to-deletion. |
| **Email processing** | Gmail API reads forwarded sportsbook emails. | Service account must have appropriate scopes. Email content is parsed and discarded, not stored verbatim. |

## Abuse and Misuse

| Threat | Mitigation |
|--------|------------|
| **Fake accounts** | Email verification required. Apple Sign-In validates identity. |
| **Notification abuse** | Per-user caps (max alerts per game/hour), fatigue model, quiet hours. |
| **API key leakage** | Client only has anon key (public). All secrets are server-side. RLS prevents unauthorized data access. |
| **Ad fraud** | `ad-fraud-check` detects impression stuffing, anomalous CTR, budget drain, rapid clicks. Auto-pause on high-confidence fraud. |
| **Affiliate fraud** | Conversion tracking ties impressions to actions. Rapid-click detection flags suspicious patterns. |
| **Unauthorized account linking** | Kalshi connection requires valid API key + private key (verified via test request). Polymarket uses public wallet address (no auth risk). |
| **Excessive data polling** | Sportradar rate budget tracked in `api_rate_log`. Orchestrator throttles when nearing limits. |
| **Rate-limit violations** | Per-API rate tracking. Backoff on errors. Concurrency limits in orchestrator (max 5 PBP, max 3 summary). |
| **Scraping** | No web-facing API exposes bulk game data. All client queries go through RLS-scoped Supabase. |

## Required Safeguards

1. **Least privilege.** The mobile client uses the Supabase anon key with RLS. Edge Functions use the service role key only when cross-user writes are required.
2. **Encrypted secrets.** All API keys and tokens are stored as Supabase secrets or in RLS-protected database fields. Token storage on device uses `expo-secure-store`.
3. **Clear consent.** Push notification consent is handled by iOS system prompt. Ad personalization has an explicit toggle. Email wager ingestion requires the user to actively forward emails.
4. **Easy disconnect.** Users can disconnect any service (streaming, sportsbook, Kalshi, Polymarket) from the Connections tab at any time. Disconnecting removes the connection record.
5. **Account deletion.** Full data deletion across all tables via `delete-account` Edge Function. Accessible from Profile tab. Requires confirmation prompt.
6. **Audit logging.** Connection changes and advertiser actions are tracked. Delivery attempts are logged in `delivery_log`. Ad impressions and conversions are recorded.
7. **Rate limiting.** Supabase Edge Functions have platform-level rate limits. Per-user alert caps prevent notification abuse. Sportradar rate budget prevents API overuse.
8. **Webhook signature verification.** Stripe webhooks verify the `stripe-signature` header. Gmail Pub/Sub verifies the bearer token.
9. **Duplicate alert idempotency.** The dedup hash system prevents the same alert from being sent twice. `send-push` checks delivery status before sending.
