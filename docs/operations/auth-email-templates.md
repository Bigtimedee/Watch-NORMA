# Auth email templates (Watch NORMA)

## Source of truth

Password reset and the other Auth emails are **Supabase Auth mailer templates**, not a custom NORMA sender.

| Environment | Where the HTML lives |
| --- | --- |
| This repo | `supabase/templates/*.html` + `manifest.json` |
| Local `supabase start` | `supabase/config.toml` `[auth.email.template.*]` `content_path` |
| Production (`shijrazlzawjpobrpmnt`) | Hosted Auth config (dashboard or Management API). Git does not sync this automatically. |

There is no in-app mailer for recovery. `web/src/app/auth/forgot-password/page.tsx` calls `supabase.auth.resetPasswordForEmail`. The email body is whatever the hosted project has stored.

## Incident (2026-09-19)

Dave requested a reset from the getnorma.app `/admin` login → Forgot password flow. Gmail mobile showed:

- Subject: **Reset Your Password**
- Heading: **Reset Password**
- Copy: “Follow this link to reset the password for your user:”
- CTA: plain text **Reset Password** — not blue, not clickable, no URL

That matches the classic GoTrue recovery wording with the `<a href="{{ .ConfirmationURL }}">` wrapper missing (or an empty/invalid href that Gmail strips). Sender display name **Watch NORMA** is unchanged.

## Fix

Each link-based template now has:

1. A real HTML anchor: `<a href="{{ .ConfirmationURL }}">…</a>` (GoTrue interpolates the verify URL; do not append query/path after this variable).
2. A raw URL line that prints `{{ .ConfirmationURL }}` as visible text for clients that strip HTML.

Reauthentication is OTP-only (`{{ .Token }}`) and must not say “follow this link.”

## Apply to production

Templates in git do nothing on the hosted project until they are PATCHed or pasted.

### Automated (preferred)

Repo secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` (already used by Edge Function deploy):

```bash
SUPABASE_ACCESS_TOKEN=sbp_... \
SUPABASE_PROJECT_REF=shijrazlzawjpobrpmnt \
  node scripts/apply-auth-email-templates.mjs
```

`--dry-run` GETs the live templates and prints whether each body already has `<a href>` without writing.

On merge to `main`, `.github/workflows/ci.yml` job **Apply Auth Email Templates** runs the same script. To re-apply without a code change: **Actions → Apply Auth email templates → Run workflow** (`.github/workflows/apply-auth-email-templates.yml`).

The script PATCHes only `mailer_subjects_*` and `mailer_templates_*_content`. It does not change `site_url`, redirect allowlists, SMTP, or providers. Redirect / vanity work is a separate change (PR #42).

### Dashboard fallback (if the API cannot run)

1. Open [Authentication → Email Templates](https://supabase.com/dashboard/project/shijrazlzawjpobrpmnt/auth/templates).
2. For each row below, paste the matching file into the **body** (HTML) and set the subject.

| Dashboard template | Subject | File |
| --- | --- | --- |
| Reset password | Reset Your Password | `supabase/templates/recovery.html` |
| Confirm signup | Confirm Your Signup | `supabase/templates/confirmation.html` |
| Invite user | You have been invited | `supabase/templates/invite.html` |
| Magic link | Your Magic Link | `supabase/templates/magic_link.html` |
| Change email address | Confirm Email Change | `supabase/templates/email_change.html` |
| Reauthentication | `{{ .Token }} is your verification code` | `supabase/templates/reauthentication.html` |

3. Save. Confirm the preview shows a blue/underlined link and a raw URL line.

## Re-test (admin forgot password)

1. Sign out of https://getnorma.app/admin (or `/auth/login`).
2. Open **Forgot password** (`/auth/forgot-password`).
3. Submit the admin email.
4. Open the message (Gmail mobile and desktop). Expect:
   - Subject still **Reset Your Password**
   - Blue, clickable **Reset Password**
   - A second line with the full `https://<ref>.supabase.co/auth/v1/verify?...` URL
5. Tap the link. It should land on `/auth/reset-password` (via `/auth/callback?next=/auth/reset-password`).
6. Set a new password and sign in to `/admin/dashboard`.

Mobile app recovery still uses `norma://auth-callback` (`redirectTo` / site URL). Do not change that in this apply.

## Guardrails

- Jest: `lib/__tests__/auth-email-templates.test.ts` (runs in Client CI). Fails if any checked-in template that says “follow this link” / reset / confirm / invite / sign-in is missing `<a href="{{ .ConfirmationURL }}">` or a raw URL fallback. Also fails a fixture that clones the broken production body.
- `scripts/apply-auth-email-templates.mjs` re-lints before PATCH and verifies the GET-after-write body still has the anchor.

## Audit (2026-09-19)

| Template | CTA type | In-repo status |
| --- | --- | --- |
| Recovery / reset password | Link — `{{ .ConfirmationURL }}` | Fixed (was the incident) |
| Confirm signup | Link — `{{ .ConfirmationURL }}` | Same guard as recovery |
| Invite user | Link — `{{ .ConfirmationURL }}` | Same guard as recovery |
| Magic link | Link — `{{ .ConfirmationURL }}` | Same guard as recovery |
| Change email address | Link — `{{ .ConfirmationURL }}` | Same guard as recovery |
| Reauthentication | OTP — `{{ .Token }}` only | No link CTA (correct) |

Security notification templates (password changed, email changed, etc.) are informational and were not customized. Enable them in the dashboard if you want those alerts; they do not need a recovery URL.
