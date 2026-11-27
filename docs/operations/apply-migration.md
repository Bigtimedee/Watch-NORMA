# Apply migration

Dispatch-only workflow: **Actions → Apply migration**. It does not run on push.
Script: `scripts/apply-migration.mjs`. Workflow: `.github/workflows/apply-migration.yml`.

The job uses repo secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` and talks to the Supabase Management API:

- reads: `POST /v1/projects/{ref}/database/query/read-only` ([reference](https://supabase.com/docs/reference/api/v1-read-only-query), which documents HTTP 429)
- writes: `POST /v1/projects/{ref}/database/query`

If the read-only route is missing or returns permission denied, the script falls back to `/database/query` and still refuses any read that is not a single `SELECT` or `WITH`.

## Modes

| mode | effect |
| --- | --- |
| `check` (default) | Read-only. Lists repo files missing from `supabase_migrations.schema_migrations` and whether the objects those files declare are present. |
| `apply` | Sends one named file, plus the ledger insert, then reads the ledger and the declared objects. |
| `live-moments-dry-run` | Calls `cmo-live-moments` with `dry_run: true` through `pg_net`. No posts. |

`allow_unverified_others` applies only to `apply`. Without it, the job refuses to write when any other unapplied file is not confirmed present (including files with no detectable objects). With it, those files are listed and left untouched.

## Why a check can fail before any SQL is sent

Preflight used to issue one HTTP read per unapplied file, with no pause and no retry. Run [42720446058](https://github.com/Bigtimedee/Watch-NORMA/actions/runs/42720446058) (Apply migration #3, `main` `d401096`, mode `apply`, file `20260905160000_consumer_auto_post_media_denylist.sql`) did that for 70 unapplied files right after run [42720365830](https://github.com/Bigtimedee/Watch-NORMA/actions/runs/42720365830). The log reached `20260905160000_consumer_auto_post_media_denylist.sql: none present (0/1)` and then:

```text
read query failed 429: ThrottlerException: Too Many Requests
```

There is no `Applying ...` line in that log. `ThrottlerException` is the Management API's NestJS throttler, not a Postgres syntax error. The failed run's Run step lasted about 11 seconds (job 22s). The column `public.media_assets.eligible_for_consumer_auto_post` was absent at that moment.

A later dispatch, run [42720748855](https://github.com/Bigtimedee/Watch-NORMA/actions/runs/42720748855), did send the file. It logged `Applied and recorded` and `Verification PASSED`. A read-only check after that found the ledger row `20260905160000` / `consumer_auto_post_media_denylist` and the column, with the denylist filenames updated as the file specifies. This code change does not re-apply that migration.

## What the script does now

- **Batch catalog reads.** Tables, views, indexes, columns, functions, RLS flags, and cron jobs for every unapplied file are checked with a few `SELECT`s, then matched locally. Verdicts are unchanged: `all present`, `none present`, `partially present`, or `unknown (no detectable objects)`. A name the catalog query does not confirm is treated as absent.
- **Pace.** Requests on one run are serial, with a gap between starts (default 250ms).
- **Retry reads.** 429, 408, 502, 503, 504, and dropped connections are retried with jittered exponential backoff. A `Retry-After` header (seconds or HTTP-date) replaces the backoff, up to 30 seconds. Past that, the run stops instead of calling again early. 401/403 and SQL errors (4xx other than 429) are not retried.
- **Read budget.** `check` and `apply` stop at 32 reads so a per-file loop cannot flood the API. The dry run's poll loop has a separate, higher budget.
- **Writes are not blindly retried.** A 429 whose body is a throttler rejection (`ThrottlerException` / `Too Many Requests` / `rate limit`) happened before the query handler and may be retried. A timeout, a network error, a bare 429, or a 5xx is ambiguous: the statement is not sent again. The script re-reads the ledger and declared objects and exits 4 unless both the ledger row and the declared objects are present (exit 0 only after that verification). It does not treat "not visible yet" as proof the write rolled back.
- **Ledger race.** Immediately before the write, the script reads the target version again. If the row appeared during preflight, it does not send the SQL.
- **Concurrency.** This workflow and Daily metrics share `supabase-management-query` with `cancel-in-progress: false`. That queues them. It does not cancel an apply that may already have sent SQL. Back-to-back applies still share the provider's rate-limit window; batching plus retry is what keeps a second run from repeating the 70-call burst.
- **Summary.** The log ends with `summary: outcome=... reads=... writes_accepted=...` and the job summary repeats it. Tokens and SQL text are not included. A failed `apply` that never attempted a write says the migration SQL was not sent.

Exit codes: `0` verified, `1` refused by the API or the read budget, `2` other unapplied files are not confirmed, `3` objects did not match after a recorded write, `4` write outcome unknown or incomplete.

## Residual limits

The Management API can still return 429 if something else uses the same access token (the dashboard, another workflow, a local `supabase` CLI). This job will not wait longer than the retry budget, and it will not mark that case successful. Re-dispatch `check` first. Re-dispatch `apply` only when the ledger row for that version is still absent. Do not re-run a file whose objects are present but whose ledger row is missing until someone has looked at the data updates in that file.

`supabase/setup-cli@v1` and `expo/expo-github-action@v8` still declare Node 20. They are not this workflow. `actions/checkout@v7` and `actions/setup-node@v7` declare Node 24 (`runs.using: node24`), which removes the Node 20 deprecation warning those v4 actions produced on run 42720446058.
