#!/usr/bin/env node
/**
 * Apply ONE pending migration file to hosted Supabase through the Management
 * API, with a read-only preflight. Driven by
 * .github/workflows/apply-migration.yml (workflow_dispatch only).
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... \
 *     node scripts/apply-migration.mjs <check|apply|live-moments-dry-run> [<file under supabase/migrations/>]
 *
 * check  (read-only): lists supabase_migrations.schema_migrations versions and
 *        whether objects declared by unapplied repo files already exist.
 *        Catalog reads are batched (a few SELECTs for the whole set), paced,
 *        and retried on 429 / transient network errors. They are not one HTTP
 *        call per file.
 * apply: refuses unless the target is the only unapplied file, or every other
 *        unapplied file's objects are confirmed present. Runs the file's SQL
 *        plus the schema_migrations insert in ONE transaction (BEGIN/COMMIT
 *        added unless the file already manages its own transaction), then
 *        verifies the objects the file declares. With
 *        ALLOW_UNVERIFIED_OTHERS=true (opt-in), the other-files guard becomes
 *        a warning and only the target is applied. A lost write response is
 *        reconciled against the ledger and is not sent again.
 * live-moments-dry-run: calls cmo-live-moments with {"dry_run":true} for
 *        mode todays_games and live, the same way pg_cron does (pg_net +
 *        vault Bearer 'New Secret 2026'), and prints the responses. The
 *        function writes nothing and publishes nothing in a dry run.
 *
 * Never prints the access token, the vault secret, or request headers.
 */

import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createManagementQuery, cleanMessage } from "./lib/management-query.mjs";
import {
  decideApply,
  extractObjects,
  formatStatus,
  inspectFiles,
  lit,
  reconcileOutcome,
  stripComments,
  versionOf,
} from "./lib/migration-inspect.mjs";

export function listMigrationFiles(dir) {
  return readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
}

function readBodies(dir, names) {
  return names.map((file) => ({ file, sql: readFileSync(join(dir, file), "utf8") }));
}

function summaryMarkdown(s) {
  const lines = [
    "## Migration tool",
    "",
    `| | |`,
    `| --- | --- |`,
    `| Outcome | \`${s.outcome}\` |`,
    `| Mode | \`${s.mode}\` |`,
    `| Target | \`${s.target || "(none)"}\` |`,
    `| Files inspected | ${s.filesInspected} |`,
    `| Catalog queries | ${s.catalogQueries} |`,
    `| Management API reads | ${s.reads} (retries ${s.retries}, throttled ${s.throttled}) |`,
    `| Writes accepted | ${s.writesAccepted} (HTTP attempts ${s.writes}) |`,
  ];
  if (s.detail) lines.push("", "```", s.detail, "```");
  return lines.join("\n");
}

function writeSummary(path, summary) {
  if (!path) return;
  try {
    appendFileSync(path, `\n${summaryMarkdown(summary)}\n`);
  } catch { /* summary is best-effort; the log line still stands */ }
}

async function migrationState(query, files) {
  const cols = await query.read("select column_name from information_schema.columns where table_schema = 'supabase_migrations' and table_name = 'schema_migrations' order by ordinal_position");
  const colNames = cols.map((c) => c.column_name);
  const nameSql = colNames.includes("name") ? ", name" : "";
  const applied = await query.read(`select version${nameSql} from supabase_migrations.schema_migrations order by version`);
  const appliedSet = new Set(applied.map((r) => String(r.version)));
  const unapplied = files.filter((f) => {
    const v = versionOf(f);
    return v && !appliedSet.has(v.version);
  });
  const badNames = files.filter((f) => !versionOf(f));
  const orphan = applied.filter((r) => !files.some((f) => versionOf(f)?.version === String(r.version)));
  return { colNames, applied, unapplied, badNames, orphan, nameSql };
}

async function ledgerRow(query, nameSql, version) {
  return query.read(`select version${nameSql} from supabase_migrations.schema_migrations where version = ${lit(version)}`);
}

function recordSql(colNames, version, name, fileSql) {
  const insCols = ["version"];
  const insVals = [lit(version)];
  if (colNames.includes("name")) { insCols.push("name"); insVals.push(lit(name)); }
  if (colNames.includes("statements")) { insCols.push("statements"); insVals.push(`array[${lit(fileSql)}]`); }
  return `insert into supabase_migrations.schema_migrations (${insCols.join(", ")}) values (${insVals.join(", ")}) on conflict (version) do nothing;`;
}

/**
 * @returns {Promise<number>} process exit code
 */
export async function runMigrationTool({
  mode,
  target = "",
  dir,
  allowUnverified = false,
  projectRef,
  query,
  token = "",
  log = console.log,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  summaryPath = process.env.GITHUB_STEP_SUMMARY || "",
} = {}) {
  const summary = {
    mode,
    target,
    outcome: "error",
    filesInspected: 0,
    catalogQueries: 0,
    reads: 0,
    writes: 0,
    writesAccepted: 0,
    retries: 0,
    throttled: 0,
    detail: "",
  };
  const finish = (code) => {
    const stats = query?.stats || {};
    summary.reads = stats.reads ?? summary.reads;
    summary.writes = stats.writes ?? 0;
    summary.writesAccepted = stats.writesAccepted ?? 0;
    summary.retries = stats.retries ?? 0;
    summary.throttled = stats.throttled ?? 0;
    const flat = [
      `outcome=${summary.outcome}`,
      `mode=${summary.mode}`,
      `target=${summary.target || "(none)"}`,
      `files_inspected=${summary.filesInspected}`,
      `catalog_queries=${summary.catalogQueries}`,
      `reads=${summary.reads}`,
      `retries=${summary.retries}`,
      `throttled=${summary.throttled}`,
      `writes_accepted=${summary.writesAccepted}`,
      `write_attempts=${summary.writes}`,
    ].join(" ");
    log(`summary: ${flat}`);
    writeSummary(summaryPath, summary);
    return code;
  };

  try {
    if (mode === "check") {
      await check();
      return finish(0);
    }
    if (mode === "apply") return finish(await apply());
    if (mode === "live-moments-dry-run") return finish(await liveMomentsDryRun());
    throw new Error(`unknown mode '${mode}'`);
  } catch (e) {
    let msg = cleanMessage(e?.message || String(e), token);
    if (mode === "apply" && (query?.stats?.writes ?? 0) === 0 && !/sql was not sent/i.test(msg)) {
      msg += " Migration SQL was not sent.";
    } else if (mode === "apply" && (query?.stats?.writesAccepted ?? 0) > 0) {
      msg += " A write was already accepted in this run. Re-dispatch check before apply; do not assume that write rolled back.";
    }
    summary.outcome = e?.code || "error";
    summary.detail = msg;
    log(`::error::${msg}`);
    const code = e?.code === "ambiguous_write" ? 4 : 1;
    return finish(code);
  }

  async function inspect(names, { countFiles = true } = {}) {
    const result = await inspectFiles(readBodies(dir, names), (sql) => query.read(sql));
    summary.catalogQueries += result.catalogQueries;
    if (countFiles) summary.filesInspected += names.length;
    return result.statuses;
  }

  async function check() {
    const files = listMigrationFiles(dir);
    const st = await migrationState(query, files);
    log(`schema_migrations columns: ${st.colNames.join(", ")}`);
    log(`Applied versions recorded: ${st.applied.length}; repo migration files: ${files.length}`);
    log(`Latest 5 recorded: ${st.applied.slice(-5).map((r) => r.version + (r.name ? "_" + r.name : "")).join(", ")}`);
    if (st.badNames.length) log(`Files without a <version>_<name>.sql name (ignored): ${st.badNames.join(", ")}`);
    if (st.orphan.length) log(`Recorded versions with no repo file: ${st.orphan.map((r) => r.version).join(", ")}`);
    log(`\nUNAPPLIED repo migration files (${st.unapplied.length}):`);
    const statuses = st.unapplied.length ? await inspect(st.unapplied) : [];
    for (const s of statuses) log(formatStatus(s));
    if (!st.unapplied.length) log("  (none)");
    if (target && !st.unapplied.includes(target)) {
      log(`\nTarget ${target} is ${files.includes(target) ? "already recorded as applied" : "not a file in supabase/migrations"}.`);
    }
    summary.outcome = "checked";
    return { st, statuses, code: 0 };
  }

  async function verify(fileSql) {
    const [s] = await inspect([target], { countFiles: false });
    log(`\nVERIFY ${target}:`);
    log(formatStatus(s));
    const cron = [...extractObjects(fileSql).cron];
    if (cron.length) {
      const jobs = await query.read(`select jobid, jobname, schedule, active from cron.job where jobname in (${cron.map(lit).join(", ")}) order by jobname`);
      for (const j of jobs) log(`      cron.job ${j.jobid} ${j.jobname} '${j.schedule}' active=${j.active}`);
    }
    if (s.verdict !== "all present") {
      summary.outcome = "verify_failed";
      summary.detail = `${target} verdict ${s.verdict}`;
      log("::error::Verification FAILED.");
      return 3;
    }
    if (summary.outcome !== "reconciled_applied" && summary.outcome !== "already_recorded" && summary.outcome !== "applied") {
      summary.outcome = "verified";
    }
    log("Verification PASSED.");
    return 0;
  }

  async function finishAmbiguous(nameSql, version, fileSql) {
    log("Write response did not prove the outcome. Re-reading the ledger and declared objects. SQL will not be sent again.");
    let ledgerPresent = false;
    let objectVerdict = "unknown (no detectable objects)";
    let readFailed = false;
    try {
      const rec = await ledgerRow(query, nameSql, version);
      ledgerPresent = rec.length > 0;
      const [s] = await inspect([target], { countFiles: false });
      objectVerdict = s.verdict;
      log(formatStatus(s));
    } catch (e) {
      readFailed = true;
      summary.detail = cleanMessage(e?.message || String(e), token);
    }
    const decision = reconcileOutcome({ ledgerPresent, objectVerdict, readFailed });
    summary.outcome = decision.outcome;
    if (decision.outcome === "reconciled_applied") {
      log("Ledger row is present after the lost response. Verifying declared objects. SQL was not sent again.");
      return verify(fileSql);
    }
    const hint = {
      not_visible: "Ledger row is absent and declared objects are not present. A timed-out statement may still be running. Do not assume it rolled back. Re-dispatch apply only after a later check still shows the version absent.",
      objects_without_ledger: "Declared objects are present but the ledger row is absent. SQL was not sent again, because a second run can repeat data updates.",
      ledger_without_objects: "Ledger row is present but declared objects are not all present. SQL was not sent again.",
      partial: "Declared objects are only partly present and the ledger row is absent. SQL was not sent again.",
      reconcile_unreadable: "The follow-up read failed, so the write outcome is still unknown. SQL was not sent again.",
    }[decision.outcome] || "Write outcome is ambiguous. SQL was not sent again.";
    summary.detail = hint;
    log(`::error::${hint}`);
    return decision.code;
  }

  async function apply() {
    const files = listMigrationFiles(dir);
    if (!target || !files.includes(target)) throw new Error(`target '${target}' is not a file in ${dir}`);
    const v = versionOf(target);
    if (!v) throw new Error(`target '${target}' is not named <version>_<name>.sql`);
    const { st, statuses } = await check();
    const fileSql = readFileSync(join(dir, target), "utf8");
    if (!st.unapplied.includes(target)) {
      log(`\nNothing to do: ${target} is already recorded as applied. Verifying its objects:`);
      summary.outcome = "already_recorded";
      return verify(fileSql);
    }
    const decision = decideApply({ target, statuses, allowUnverified });
    if (decision.action === "refuse") {
      log(`\n::error::Refusing to apply. Other unapplied files are not confirmed present in the database:`);
      for (const s of decision.blocking) log(`  - ${s.file}: ${s.verdict}`);
      summary.outcome = "refused";
      summary.detail = `${decision.blocking.length} other unapplied file(s) are not confirmed present`;
      return 2;
    }
    if (decision.blocking.length) {
      log(`\n::warning::allow_unverified_others=true: applying ONLY ${target}. These other unapplied files are not confirmed present and are NOT being applied:`);
      for (const s of decision.blocking) log(`  - ${s.file}: ${s.verdict}`);
    }
    if (decision.confirmed.length) {
      log(`\nOther unapplied files are confirmed present (recording is out of date, not schema): ${decision.confirmed.map((s) => s.file).join(", ")}`);
    }

    const fresh = await ledgerRow(query, st.nameSql, v.version);
    if (fresh.length) {
      log(`\nLedger row for ${v.version} appeared during preflight. Not sending SQL.`);
      summary.outcome = "already_recorded";
      return verify(fileSql);
    }

    const ownTx = /^\s*(begin|start\s+transaction)\s*;/im.test(stripComments(fileSql));
    const record = recordSql(st.colNames, v.version, v.name, fileSql);
    log(`\nApplying ${target} (version ${v.version}) ${ownTx ? "(file manages its own transaction; recording separately)" : "in one transaction with the schema_migrations insert"} ...`);
    const statements = ownTx ? [fileSql, record] : [`begin;\n${fileSql}\n;\n${record}\ncommit;`];
    for (const statement of statements) {
      try {
        await query.write(statement);
      } catch (e) {
        if (e?.code !== "ambiguous_write") throw e;
        return finishAmbiguous(st.nameSql, v.version, fileSql);
      }
    }
    log("Applied and recorded.");
    const rec = await ledgerRow(query, st.nameSql, v.version);
    log(`schema_migrations row: ${JSON.stringify(rec)}`);
    if (!rec.length) {
      summary.outcome = "ledger_missing_after_write";
      summary.detail = "version not recorded after apply";
      log("::error::version not recorded after apply");
      return 4;
    }
    summary.outcome = "applied";
    return verify(fileSql);
  }

  async function liveMomentsDryRun() {
    const url = `https://${projectRef}.supabase.co/functions/v1/cmo-live-moments`;
    for (const liveMode of ["todays_games", "live"]) {
      const body = JSON.stringify({ mode: liveMode, dry_run: true, source: "apply-migration-workflow" });
      const rows = await query.write(`select net.http_post(
      url := ${lit(url)},
      body := ${lit(body)}::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'New Secret 2026')),
      timeout_milliseconds := 60000
    ) as id`);
      const id = rows?.[0]?.id;
      const idNum = Number(id);
      if (!Number.isInteger(idNum)) throw new Error("pg_net did not return an integer request id");
      let resp = null;
      for (let i = 0; i < 30 && !resp; i++) {
        await sleep(3000);
        const r = await query.read(`select status_code, timed_out, error_msg, content from net._http_response where id = ${idNum}`);
        if (r.length) resp = r[0];
      }
      log(`\n=== cmo-live-moments dry run, mode=${liveMode} (pg_net request ${idNum}) ===`);
      if (!resp) { log("No response recorded after 30 polls."); continue; }
      log(`status_code=${resp.status_code} timed_out=${resp.timed_out} error=${resp.error_msg ?? "none"}`);
      let content = resp.content ?? "";
      try { content = JSON.stringify(JSON.parse(content), null, 2); } catch { /* raw */ }
      log(String(content).slice(0, 8000));
    }
    summary.outcome = "dry_run";
    return 0;
  }
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  if (!token || !projectRef) {
    console.error("::error::SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF is not set.");
    process.exit(1);
  }
  const mode = process.argv[2] || "check";
  const query = createManagementQuery({
    token,
    projectRef,
    // check/apply should be a handful of catalog reads. The dry run polls.
    readBudget: mode === "live-moments-dry-run" ? 90 : 32,
    onWarning: (msg) => console.log(`::warning::${msg}`),
  });
  const code = await runMigrationTool({
    mode,
    target: process.argv[3] || "",
    dir: "supabase/migrations",
    allowUnverified: process.env.ALLOW_UNVERIFIED_OTHERS === "true",
    projectRef,
    query,
    token,
  });
  if (code) process.exit(code);
}

if (invokedDirectly()) {
  main().catch((e) => {
    console.error(`::error::${cleanMessage(e?.message || String(e), process.env.SUPABASE_ACCESS_TOKEN)}`);
    process.exit(1);
  });
}
