# Auth redirects (admin password recovery)

## HARD RULE

Hosted Auth `site_url` and web `resetPasswordForEmail({ redirectTo })` must **never** be the marketing homepage:

- Forbidden: `https://getnorma.app`, `https://getnorma.app/`, `https://www.getnorma.app`, `https://www.getnorma.app/`
- Required: `https://getnorma.app/auth/reset-password` (and the www twin on the allowlist)
- Mobile: keep `norma://auth-callback` allowlisted. Do not change the app's `redirectTo`.

Expired / invalid recovery links (`error=access_denied`, `error_code=otp_expired`) must render the set-password page's expired UX — never a silent dump on `/`.

## Why this exists (2026-09-19)

PR #43 made the recovery email CTA a real `{{ .ConfirmationURL }}` link. Clicking it still failed:

`https://getnorma.app/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired#…`

Users landed on the marketing homepage with no set-password form.

**Cause:** production Auth (`shijrazlzawjpobrpmnt`) had `site_url = https://getnorma.app`. GoTrue uses `site_url` when `redirectTo` is missing or not allowlisted. Apex `getnorma.app` 307s to `www.getnorma.app`, and **www was not on the allowlist**, so `redirectTo` from `window.location.origin` was rejected.

## Source of truth

| Environment | Config |
| --- | --- |
| This repo | `supabase/auth-redirects.json` |
| Local `supabase start` | `supabase/config.toml` `site_url = "norma://auth-callback"` (mobile-first local). Web localhost reset URLs are on `additional_redirect_urls`. |
| Production | Hosted Auth URL config. Git does not sync this by itself. |

## Apply to production

Repo secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` (same pair as Edge Function deploy and auth email templates):

```bash
SUPABASE_ACCESS_TOKEN=sbp_... \
SUPABASE_PROJECT_REF=shijrazlzawjpobrpmnt \
  node scripts/apply-auth-redirects.mjs
```

`--dry-run` GETs live `site_url` / `uri_allow_list` and does not write.

On merge to `main`, `.github/workflows/ci.yml` job **Apply Auth Redirects** runs the same script. Manual re-apply: **Actions → Apply Auth redirects → Run workflow**.

The script PATCHes **only** `site_url` and `uri_allow_list`. Mailer HTML stays with `scripts/apply-auth-email-templates.mjs`.

### Dashboard fallback

1. Open [Authentication → URL Configuration](https://supabase.com/dashboard/project/shijrazlzawjpobrpmnt/auth/url-configuration).
2. Set **Site URL** to `https://getnorma.app/auth/reset-password` (not the marketing `/`).
3. Ensure Redirect URLs include every entry in `supabase/auth-redirects.json` `uri_allow_list` (mobile schemes + apex + www + exact `/auth/reset-password` and `/auth/callback` paths).
4. Save.

## Re-test (admin forgot password)

1. Sign out of https://getnorma.app/admin (or `/auth/login`).
2. Open **Forgot password** (`/auth/forgot-password`).
3. Submit the admin email.
4. Confirm the email still has a blue **Reset Password** link and a raw `https://<ref>.supabase.co/auth/v1/verify?...` URL.
5. Open the verify URL **once**, promptly.
6. Expect `https://getnorma.app/auth/reset-password` (or www) with password + confirm fields — **not** the marketing homepage.
7. Set a new password. Expect redirect to `/admin` (admin) or `/dashboard` (advertiser).
8. Re-open the same email link (or append `?error=access_denied&error_code=otp_expired`). Expect: “This reset link expired or was already used — request a new one” plus a link to `/auth/forgot-password`. Never `/` with no explanation.

Mobile app recovery is unchanged: `hooks/useAuth.ts` still passes `redirectTo: norma://auth-callback`.
