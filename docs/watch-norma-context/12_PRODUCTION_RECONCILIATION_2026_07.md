# 12. Production Reconciliation, July 2026

> **Read this before you trust `supabase_migrations.schema_migrations`, before you assume a function in `supabase/functions/` is deployed, and before you wire anything to a cron job.**
>
> On 2026-07-29 the production project (`shijrazlzawjpobrpmnt`) was found to be running a schema roughly three months behind the repository, with eight Edge Functions never deployed and four cron jobs that had never once succeeded. This file records what was true, what was changed, and what is still open.

---

## 1. The migration ledger is not a source of truth

`supabase_migrations.schema_migrations` held 56 entries against 99 migration files. That number was wrong in **both** directions:

- **34 migrations were genuinely unapplied.** Sixteen tables did not exist in production, including `referrals`, `referral_codes`, `alert_feedback`, `share_events`, `app_events`, `intent_moments`, `ad_clicks`, `webhook_endpoints`, `brief_log`, `partners`, and `sportsbook_restrictions`.
- **9 migrations were applied but never recorded.** `055`, `056`, `057`, `061`, `062`, `063`, `079`, `081`, `084` had all taken effect in the database with no ledger row. Someone applied them through the SQL editor.

**Consequence for future work:** never decide what to apply by diffing filenames against the ledger. Verify against actual schema state (`to_regclass`, `information_schema.columns`, `pg_policies`, `cron.job`). The reconciliation query pattern used here is worth repeating.

**Root cause:** `.github/workflows/ci.yml` runs `supabase start` and `supabase stop` inside a throwaway container to validate migrations. Nothing in CI ever runs `supabase db push` against production, and nothing runs `supabase functions deploy`. The app ships automatically via EAS OTA on every push to `main`; the database and the functions do not. **Until that asymmetry is fixed, this drift will recur.**

---

## 2. What was applied on 2026-07-29

All 29 non-cron migrations, verified. Applied SQL was hardened to be re-runnable: bare `CREATE POLICY`, `ADD COLUMN`, and `ADD CONSTRAINT` statements were wrapped in existence guards, because several originals would fail on a second execution. Some were applied as combined ledger entries; the ledger name does not always match a single repo filename.

| Area | Migrations |
|---|---|
| Geo compliance, waitlist | `058`, `059` |
| Game status constraint | `060` |
| Campaign lifecycle | `065`, `077`, `080`, `085`, `089` |
| Referrals | `066`, `20260706000002` |
| Alert feedback | `070` |
| Kalshi key encryption | `071` |
| Football sport keys, floor prices | `072`, `20260706000004` |
| Intent moments | `073` |
| Attribution, floor yield | `074`, `076` |
| Supply forecast bands | `075` |
| Partner API, brief log | `078`, `083`, `086` |
| Postback and webhooks | `082` |
| Streaming affiliate, partners | `087`, `090` |
| Content calendar | `20260618000001` |
| App events and analytics views | `20260706000001` |
| Share events, creative prescreen | `20260706000005`, `20260706000006` |

**Two seeded values to review.** `087` sets `streaming_providers.affiliate_tag` to the literal `NORMA_ESPN_TAG` for ESPN+, which is a placeholder, not a real affiliate tag. Once code reads that column it will append it to the ESPN+ universal link, which is streaming routing and therefore governed by rule 3. Replace or null it before anything consumes it. `090` seeds the `partners` table with internal business development notes, now living in production.

---

## 3. Still open

### 3.1 Eight Edge Functions exist in the repo and have never been deployed

`advertiser-weekly-report`, `creative-prescreen`, `get-referral-code`, `growth-weekly-report`, `monitor-health`, `morning-briefing`, `purge-old-data`, `verify-provider-links`.

Three matter beyond their own features: `purge-old-data` is the data retention commitment in rule 16, and `monitor-health` and `verify-provider-links` are the safety nets under streaming routing that rule 2 depends on.

Conversely, three functions are **deployed with no source in the repo**: `alert-engine`, `norma-agent-evaluate`, `refresh-social-tokens`. Nobody should assume the repo is a complete picture of what runs.

### 3.2 Five cron migrations are deliberately not applied

`064`, `067`, `068`, `069`, `20260706000007`. Each schedules a job targeting one of the undeployed functions above. Applying them first would only create more failing jobs.

### 3.3 Four live cron jobs have never succeeded

`cmo-publish-content` (336 failures in seven days), `cmo-generate-content` (28), `generate-social-content` (7), `poll-schedule-lookahead` (7). All fail identically: `unrecognized configuration parameter "app.settings.supabase_url"`.

No `app.*` settings exist on this database. Three different naming conventions appear across migrations (`app.settings.supabase_url`, `app.supabase_url`, `app.settings.service_role_key`, `app.supabase_service_role_key`) and none of them resolve. **The social content pipeline has never run in production.**

Every working cron job instead hardcodes the project URL and embeds the service role key literally in the job command.

### 3.4 Credential handling

The legacy service role JWT is stored in plaintext inside `cron.job` command text, readable by anyone who can query that table, and does not expire until 2086. It is being replaced.

**Migration path in progress:** new format keys (`sb_publishable_*`, `sb_secret_*`) have been created. The secret key is stored in Vault under the name `New Secret 2026` and should be referenced as:

```sql
(select decrypted_secret from vault.decrypted_secrets where name = 'New Secret 2026')
```

**Never write a key literal into a migration file.** Rule 9. The reason the four broken jobs cannot simply be "fixed like the working ones" is that the working pattern would put a live secret into git.

**Critical constraint:** new format secret keys are **not JWTs**. Any Edge Function invoked with one must be deployed with `verify_jwt = false`, or the platform rejects the request before the function body runs. This is the same mechanism that makes `intent-api` unreachable today. Functions called by cron need verification off; functions called by the app with a user session token (such as `get-referral-code`) keep it on.

**Cutover order, and it matters:** the publishable key must reach users' phones in an OTA update *before* legacy keys are disabled. Disabling legacy while devices still carry the old anon key takes the live app offline.

---

## 3.5 Automated function deployment (added 2026-07-29)

**Status: the `config.toml` half is committed. The CI job below is NOT yet in `.github/workflows/ci.yml`,** because GitHub refuses workflow file edits from a token without the `workflow` permission. Anyone with such a token should paste this job into `ci.yml` immediately above `ota-update:`.

```yaml
  deploy-functions:
    name: Deploy Edge Functions
    runs-on: ubuntu-latest
    needs: [client, deno, migrations]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Warn if secrets are missing
        if: env.SUPABASE_ACCESS_TOKEN == '' || env.SUPABASE_PROJECT_REF == ''
        run: |
          echo "::warning::SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF not set."
          echo "::warning::Edge Functions were NOT deployed. Repo and production will drift."
      - name: Deploy all Edge Functions
        if: env.SUPABASE_ACCESS_TOKEN != '' && env.SUPABASE_PROJECT_REF != ''
        run: supabase functions deploy --project-ref "$SUPABASE_PROJECT_REF"
      - name: List deployed functions
        if: env.SUPABASE_ACCESS_TOKEN != '' && env.SUPABASE_PROJECT_REF != ''
        run: supabase functions list --project-ref "$SUPABASE_PROJECT_REF"
```

Project ref for this project is `shijrazlzawjpobrpmnt`.

Once added, that job deploys Edge Functions on every push to `main`. On every push to `main`, after the three test jobs pass, it runs `supabase functions deploy` against production. This closes half the drift described in section 1.

**It requires two GitHub repository secrets.** Until both are set, the job logs a warning and deploys nothing, so drift continues silently:

- `SUPABASE_ACCESS_TOKEN` — a Supabase personal access token
- `SUPABASE_PROJECT_REF` — the project reference

**`supabase/config.toml` now pins `verify_jwt` per function, and this is load bearing.** The CLI defaults it to `true`. Before this change, a blanket deploy would have turned verification ON for `poll-boxscore`, `generate-social-content`, and `publish-social-posts`, which currently run with it OFF, breaking boxscore polling. Any function that must accept a caller without a valid Supabase JWT has to be listed in `config.toml` explicitly. Verify against the live project before adding or removing an entry.

`intent-api` is deliberately absent from that list. Adding it is what would make the API reachable, and that should not happen before durable rate limiting exists.

## 3.6 Migrations are still NOT deployed automatically

`supabase db push` was deliberately left out of CI. Adding it today would immediately apply the five parked cron migrations (`064`, `067`, `068`, `069`, `20260706000007`), and because no `app.*` settings exist on this database, that would schedule five more jobs that fail on every run, joining the four already failing.

**Order of operations:** rewrite those five migrations to read the key from Vault, verify the jobs run, and only then add a `db push` step to CI. Until then, migrations remain a deliberate manual act.

## 4. What this does not fix

The alert engine has produced 28 alerts in its lifetime, all `ncaam`, none since 2026-03-29, and none ever for `nba` or `mlb`. Nothing in this reconciliation addresses that. Note also that production holds zero team follows and zero player follows (all 41 follows are single game follows) and two wagers, so candidate generation may simply be starved rather than broken. Distinguishing the two requires watching `evaluate-alerts` during a live game.
