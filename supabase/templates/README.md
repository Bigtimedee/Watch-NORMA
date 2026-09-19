# Supabase Auth email templates

These HTML files are the **in-repo source of truth** for Watch NORMA authentication emails (invite, confirm signup, magic link, recovery / reset password, email change, reauthentication OTP).

Hosted Supabase does **not** pick them up from git. Production project `shijrazlzawjpobrpmnt` is updated by:

1. `scripts/apply-auth-email-templates.mjs` (Management API `PATCH /v1/projects/:ref/config/auth`) — CI job on main, or locally with `SUPABASE_ACCESS_TOKEN`.
2. Manual paste into [Authentication → Email Templates](https://supabase.com/dashboard/project/shijrazlzawjpobrpmnt/auth/templates) if the API cannot run.

See `docs/operations/auth-email-templates.md` for apply steps, dashboard fallback, and how to re-test from `/admin`.
