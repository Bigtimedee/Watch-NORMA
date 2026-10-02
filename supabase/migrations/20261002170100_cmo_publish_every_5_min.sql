-- Migration 20261002170100: run cmo-publish-content every 5 minutes.
--
-- Root cause of the 2026-09-26..10-02 late posts: 20260729000001 (re)created
-- cmo-publish-content with schedule '0 9 * * *' (09:00 UTC = 04:00 CT daily).
-- No frequent trigger for cmo-publish existed after that. Rows only shipped on
-- time when an agent manually POSTed cmo-publish at the slot (curl /
-- python-urllib invocations seen in edge logs on 9/13-9/24). When those manual
-- kicks stopped after 9/24, every row waited for the 04:00 CT sweep the next
-- day (f7c0d4ed, 393cb5d6, 5c4d7dc8, 3347826d).
--
-- Fix: every 5 minutes, so a due draft publishes within ~5 min of
-- scheduled_for. Safe only together with the cmo-publish guards (stale > 3h ->
-- skipped, empty media -> held then skipped, atomic publishing claim) and the
-- statuses added in 20261002170000; deploy that function version first.
--
-- alter_job keeps the existing job id and the Vault-based auth command from
-- 20260729000001 untouched; only the schedule changes. cmo-publish-linkedin
-- (*/30) is a separate job and is not modified.

SELECT cron.alter_job(job_id := jobid, schedule := '*/5 * * * *')
FROM cron.job
WHERE jobname = 'cmo-publish-content';
