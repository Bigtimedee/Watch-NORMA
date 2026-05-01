-- Migration: Explicit INSERT grant on deep_link_events for authenticated role.
--
-- Migration 037 created deep_link_events and enabled RLS but never issued an
-- explicit GRANT INSERT to authenticated. It relied on Supabase's project-level
-- ALTER DEFAULT PRIVILEGES (which grants ALL on public tables to authenticated,
-- anon, and service_role). That default applies only to tables created by the
-- same role that ran ALTER DEFAULT PRIVILEGES; if the migration ran as a
-- different role, or if the project's default privileges were not yet set at
-- the time migration 037 ran, authenticated silently lacks INSERT.
--
-- The service-role key bypasses RLS and always works, which is why the
-- diagnostic test row could be inserted while zero app-generated rows appeared.
--
-- This migration adds the explicit grant. It is idempotent: granting a
-- privilege that already exists is a no-op in PostgreSQL.

GRANT INSERT ON public.deep_link_events TO authenticated;

-- Also allow authenticated to select their own rows for future client-side
-- debugging (the RLS SELECT policy would be needed separately; this is just
-- the object-level privilege).
GRANT SELECT ON public.deep_link_events TO authenticated;
