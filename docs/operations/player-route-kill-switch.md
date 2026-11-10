# StrymTV remote kill switch

The control row is `public.player_route_control` id `1`.

| Column | Production seed | Meaning |
|---|---|---|
| `killed` | `true` | Server kill. Overrides local opt-in, cohort, and a cached allow. |
| `strymtv_enabled` | `false` | Playback enable. This screen and this migration do not turn it on. |
| `cohort_allowlist` | empty | Empty admits nobody. Tokens only, not user ids. |
| `ttl_seconds` | `60` | Hint. Clients never trust an allow longer than 60 seconds, and never accept a TTL above 15 minutes. |
| `updated_at` | insert time | Ordering. An older payload cannot clear a newer kill. |

Reads: signed-in app users, `SELECT` of that row only. Writes: service role, and only after `/admin/player-routes` confirms `app_metadata.role = admin`. `anon` and `authenticated` cannot insert, update, or delete.

## What users experience

- YouTube TV and the normal watch button do not read this table.
- StrymTV stays hidden when the read fails, the row is malformed, `updated_at` is too far in the future, the snapshot is older than its trust window, the kill flag is on, playback is off, or the cohort does not match.
- The app refreshes when it becomes active, every 60 seconds while it is active, and again immediately before any StrymTV handoff.
- A handoff that cannot refresh does not open. A late "allowed" response cannot override a kill that was already observed.
- This is not an instant disable of a phone that is not refreshing. The longest a foregrounded app can keep a previous allow on screen is 60 seconds, and pressing the button checks again.
- The encoding gate in the app remains blocked. Clearing `killed` does not start playback.

## Admin procedure

1. Sign in to the admin site as an account whose `app_metadata.role` is `admin`.
2. Open `/admin/player-routes`.
3. **Disable StrymTV** sets `killed = true` and bumps `updated_at`.
4. **Clear kill flag only** sets `killed = false`. It does not set `strymtv_enabled`. Leave playback off unless a separate release says otherwise.
5. Do not edit the row in the SQL editor to put a stream URL or a user id on it. The table has no such columns.

## Apply and check

Migrations are not applied by the normal push. After the file is on `main`:

```bash
# GitHub → Actions → Apply migration → mode=check, migration=20261110040000_player_route_control.sql
# Then mode=apply for that same filename only.
```

Check, read-only:

```sql
select id, killed, strymtv_enabled, cardinality(cohort_allowlist) as cohorts, ttl_seconds, schema_version
from public.player_route_control
where id = 1;
```

Expected: `killed` true, `strymtv_enabled` false, `cohorts` 0, `ttl_seconds` 60.

## Rollback

Prefer **Disable StrymTV** in the admin page. That is the operational rollback.

Removing the table is only for abandoning the control. Clients then fail closed because the read fails. YouTube TV is unaffected.

```sql
DROP POLICY IF EXISTS player_route_control_read ON public.player_route_control;
DROP TABLE IF EXISTS public.player_route_control;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261110040000';
```

## Who has the client

The table protects clients that include this reader. Those clients ship as a JavaScript update on the existing EAS `production` channel for the current runtime (`appVersion`, 1.8.1). Older binaries that never received this update have no StrymTV action to kill. A new App Store binary is not required for the reader. An OTA does not reach a phone that has not installed a build with the same runtime, and it does not by itself open StrymTV.
