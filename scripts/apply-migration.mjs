#!/usr/bin/env node
/**
 * Apply ONE pending, additive migration file to hosted Supabase through the
 * Management API, with a read-only pre-check. Driven by
 * .github/workflows/apply-migration.yml (workflow_dispatch only).
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... \
 *     node scripts/apply-migration.mjs <check|apply|live-moments-dry-run> [<file under supabase/migrations/>]
 *
 * check  (read-only): lists supabase_migrations.schema_migrations versions,
 *        prints every repo migration file NOT recorded as applied and, for
 *        each, whether the objects it creates (tables, columns, indexes,
 *        functions, views, pg_cron jobs) already exist in the database.
 * apply: refuses unless the target is the only unapplied file, or every other
 *        unapplied file's objects are confirmed present. Runs the file's SQL
 *        plus the schema_migrations insert in ONE transaction (BEGIN/COMMIT
 *        added unless the file already manages its own transaction), then
 *        verifies the objects the file declares.
 * live-moments-dry-run: calls cmo-live-moments with {"dry_run":true} for
 *        mode todays_games and live, the same way pg_cron does (pg_net +
 *        vault Bearer 'New Secret 2026'), and prints the responses. The
 *        function writes nothing and publishes nothing in a dry run.
 *
 * Never prints the access token, the vault secret, or request headers.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
const MODE = process.argv[2] || "check";
const TARGET = process.argv[3] || "";
const DIR = "supabase/migrations";
const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

if (!TOKEN || !REF) {
  console.error("::error::SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF is not set.");
  process.exit(1);
}

// ---------------------------------------------------------------- API helpers
function clean(msg) {
  try {
    const j = JSON.parse(msg);
    msg = j.message || j.error || msg;
  } catch { /* plain text */ }
  return String(msg).split(TOKEN).join("***").replace(/\s+/g, " ").slice(0, 600);
}

async function post(url, sql) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  return { status: res.status, text: await res.text() };
}

function assertSelectOnly(sql) {
  const s = sql.trim().toLowerCase();
  if (!/^(select|with)\b/.test(s)) throw new Error("refusing non-SELECT statement");
  if (s.includes(";")) throw new Error("refusing multi-statement SQL");
  if (/\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|call|do|vacuum|refresh|lock|set|reset|comment)\b/.test(s.replace(/'[^']*'/g, "''"))) {
    throw new Error("refusing SQL with a write/DDL keyword");
  }
}

let readOnlyOk = true;
/** Read-only SELECT. Falls back to /database/query (SELECT-only enforced here) if the read-only endpoint is missing or lacks privilege. */
async function read(sql) {
  assertSelectOnly(sql);
  if (readOnlyOk) {
    const r = await post(`${API}/read-only`, sql);
    if (r.status >= 200 && r.status < 300) return JSON.parse(r.text);
    if ([404, 405].includes(r.status) || /permission denied/i.test(r.text)) {
      console.log(`::warning::read-only endpoint answered ${r.status} (${clean(r.text)}); using /database/query with the SELECT-only guard.`);
      readOnlyOk = false;
    } else {
      throw new Error(`read query failed ${r.status}: ${clean(r.text)}`);
    }
  }
  const r = await post(API, sql);
  if (r.status < 200 || r.status >= 300) throw new Error(`read query failed ${r.status}: ${clean(r.text)}`);
  return JSON.parse(r.text);
}

async function write(sql) {
  const r = await post(API, sql);
  if (r.status < 200 || r.status >= 300) throw new Error(`write failed ${r.status}: ${clean(r.text)}`);
  return r.text ? JSON.parse(r.text) : [];
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ------------------------------------------------------------- repo files
function versionOf(file) {
  const m = /^([0-9]+)_(.+)\.sql$/.exec(file);
  return m ? { version: m[1], name: m[2] } : null;
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

// --------------------------------------------------- object extraction (heuristic)
function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}
function qname(raw) {
  const n = raw.replace(/"/g, "");
  return n.includes(".") ? n : `public.${n}`;
}
function extractObjects(sqlRaw) {
  const sql = stripComments(sqlRaw);
  const o = { tables: new Set(), columns: new Set(), indexes: new Set(), functions: new Set(), views: new Set(), cron: new Set(), rls: new Set() };
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."]+)/gi)) o.tables.add(qname(m[1]));
  for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w."]+)([\s\S]*?);/gi)) {
    const t = qname(m[1]);
    for (const c of m[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?("?[\w]+"?)/gi)) o.columns.add(`${t}.${c[1].replace(/"/g, "")}`);
    if (/enable\s+row\s+level\s+security/i.test(m[2])) o.rls.add(t);
  }
  for (const m of sql.matchAll(/create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([\w."]+)\s+on\s+(?:only\s+)?([\w."]+)/gi)) {
    const schema = qname(m[2]).split(".")[0];
    const idx = m[1].replace(/"/g, "");
    o.indexes.add(idx.includes(".") ? idx : `${schema}.${idx}`);
  }
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\(/gi)) o.functions.add(qname(m[1]));
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?([\w."]+)/gi)) o.views.add(qname(m[1]));
  for (const m of sql.matchAll(/cron\.schedule\s*\(\s*'([^']+)'/gi)) o.cron.add(m[1]);
  return o;
}

function checksSql(o) {
  const parts = [];
  const sp = (n) => n.split(".");
  for (const t of o.tables) parts.push(`select 'table' k, ${lit(t)} n, to_regclass(${lit(t)}) is not null p`);
  for (const v of o.views) parts.push(`select 'view' k, ${lit(v)} n, to_regclass(${lit(v)}) is not null p`);
  for (const i of o.indexes) parts.push(`select 'index' k, ${lit(i)} n, to_regclass(${lit(i)}) is not null p`);
  for (const c of o.columns) {
    const [s, t, col] = sp(c);
    parts.push(`select 'column' k, ${lit(c)} n, exists(select 1 from information_schema.columns where table_schema=${lit(s)} and table_name=${lit(t)} and column_name=${lit(col)}) p`);
  }
  for (const f of o.functions) {
    const [s, fn] = sp(f);
    parts.push(`select 'function' k, ${lit(f)} n, exists(select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname=${lit(s)} and p.proname=${lit(fn)}) p`);
  }
  for (const r of o.rls) {
    const [s, t] = sp(r);
    parts.push(`select 'rls_enabled' k, ${lit(r)} n, coalesce((select c.relrowsecurity from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname=${lit(s)} and c.relname=${lit(t)}), false) p`);
  }
  for (const j of o.cron) parts.push(`select 'cron_job' k, ${lit(j)} n, exists(select 1 from cron.job where jobname=${lit(j)}) p`);
  return parts.length ? parts.join(" union all ") : null;
}

async function objectStatus(file) {
  const o = extractObjects(readFileSync(join(DIR, file), "utf8"));
  const q = checksSql(o);
  if (!q) return { file, detectable: 0, present: 0, rows: [], verdict: "unknown (no detectable objects)" };
  const rows = await read(q);
  const present = rows.filter((r) => r.p === true).length;
  const verdict = present === rows.length ? "all present" : present === 0 ? "none present" : "partially present";
  return { file, detectable: rows.length, present, rows, verdict };
}

function printStatus(s) {
  console.log(`  ${s.file}: ${s.verdict} (${s.present}/${s.detectable})`);
  for (const r of s.rows) console.log(`      [${r.p ? "x" : " "}] ${r.k} ${r.n}`);
}

// ------------------------------------------------------------- state
async function migrationState() {
  const cols = await read(`select column_name from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations' order by ordinal_position`);
  const colNames = cols.map((c) => c.column_name);
  const applied = await read(`select version${colNames.includes("name") ? ", name" : ""} from supabase_migrations.schema_migrations order by version`);
  const appliedSet = new Set(applied.map((r) => String(r.version)));
  const unapplied = files.filter((f) => {
    const v = versionOf(f);
    return v && !appliedSet.has(v.version);
  });
  const badNames = files.filter((f) => !versionOf(f));
  const orphan = applied.filter((r) => !files.some((f) => versionOf(f)?.version === String(r.version)));
  return { colNames, applied, unapplied, badNames, orphan };
}

async function check() {
  const st = await migrationState();
  console.log(`schema_migrations columns: ${st.colNames.join(", ")}`);
  console.log(`Applied versions recorded: ${st.applied.length}; repo migration files: ${files.length}`);
  console.log(`Latest 5 recorded: ${st.applied.slice(-5).map((r) => r.version + (r.name ? "_" + r.name : "")).join(", ")}`);
  if (st.badNames.length) console.log(`Files without a <version>_<name>.sql name (ignored): ${st.badNames.join(", ")}`);
  if (st.orphan.length) console.log(`Recorded versions with no repo file: ${st.orphan.map((r) => r.version).join(", ")}`);
  console.log(`\nUNAPPLIED repo migration files (${st.unapplied.length}):`);
  const statuses = [];
  for (const f of st.unapplied) {
    const s = await objectStatus(f);
    statuses.push(s);
    printStatus(s);
  }
  if (!st.unapplied.length) console.log("  (none)");
  if (TARGET && !st.unapplied.includes(TARGET)) {
    console.log(`\nTarget ${TARGET} is ${files.includes(TARGET) ? "already recorded as applied" : "not a file in supabase/migrations"}.`);
  }
  return { st, statuses };
}

async function apply() {
  if (!TARGET || !files.includes(TARGET)) throw new Error(`target '${TARGET}' is not a file in ${DIR}`);
  const v = versionOf(TARGET);
  if (!v) throw new Error(`target '${TARGET}' is not named <version>_<name>.sql`);
  const { st, statuses } = await check();
  if (!st.unapplied.includes(TARGET)) {
    console.log(`\nNothing to do: ${TARGET} is already recorded as applied. Verifying its objects:`);
    return verify();
  }
  const others = statuses.filter((s) => s.file !== TARGET);
  const blocking = others.filter((s) => s.verdict !== "all present");
  if (blocking.length) {
    console.log(`\n::error::Refusing to apply. Other unapplied files are not confirmed present in the database:`);
    for (const s of blocking) console.log(`  - ${s.file}: ${s.verdict}`);
    process.exit(2);
  }
  if (others.length) console.log(`\nOther unapplied files are all confirmed present (recording is out of date, not schema): ${others.map((s) => s.file).join(", ")}`);

  const sql = readFileSync(join(DIR, TARGET), "utf8");
  const ownTx = /^\s*(begin|start\s+transaction)\s*;/im.test(stripComments(sql));
  const insCols = ["version"];
  const insVals = [lit(v.version)];
  if (st.colNames.includes("name")) { insCols.push("name"); insVals.push(lit(v.name)); }
  if (st.colNames.includes("statements")) { insCols.push("statements"); insVals.push(`array[${lit(sql)}]`); }
  const record = `insert into supabase_migrations.schema_migrations (${insCols.join(", ")}) values (${insVals.join(", ")}) on conflict (version) do nothing;`;

  console.log(`\nApplying ${TARGET} (version ${v.version}) ${ownTx ? "(file manages its own transaction; recording separately)" : "in one transaction with the schema_migrations insert"} ...`);
  if (ownTx) {
    await write(sql);
    await write(record);
  } else {
    await write(`begin;\n${sql}\n;\n${record}\ncommit;`);
  }
  console.log("Applied and recorded.");
  const rec = await read(`select version${st.colNames.includes("name") ? ", name" : ""} from supabase_migrations.schema_migrations where version = ${lit(v.version)}`);
  console.log(`schema_migrations row: ${JSON.stringify(rec)}`);
  if (!rec.length) throw new Error("version not recorded after apply");
  return verify();
}

async function verify() {
  const s = await objectStatus(TARGET);
  console.log(`\nVERIFY ${TARGET}:`);
  printStatus(s);
  const cron = [...extractObjects(readFileSync(join(DIR, TARGET), "utf8")).cron];
  if (cron.length) {
    const jobs = await read(`select jobid, jobname, schedule, active from cron.job where jobname in (${cron.map(lit).join(", ")}) order by jobname`);
    for (const j of jobs) console.log(`      cron.job ${j.jobid} ${j.jobname} '${j.schedule}' active=${j.active}`);
  }
  if (s.verdict !== "all present") {
    console.log("::error::Verification FAILED.");
    process.exit(3);
  }
  console.log("Verification PASSED.");
}

// ------------------------------------------------------- live moments dry run
async function liveMomentsDryRun() {
  const url = `https://${REF}.supabase.co/functions/v1/cmo-live-moments`;
  for (const mode of ["todays_games", "live"]) {
    const body = JSON.stringify({ mode, dry_run: true, source: "apply-migration-workflow" });
    const rows = await write(`select net.http_post(
      url := ${lit(url)},
      body := ${lit(body)}::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'New Secret 2026')),
      timeout_milliseconds := 60000
    ) as id`);
    const id = rows?.[0]?.id;
    if (id == null) throw new Error("pg_net did not return a request id");
    let resp = null;
    for (let i = 0; i < 30 && !resp; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const r = await read(`select status_code, timed_out, error_msg, content from net._http_response where id = ${Number(id)}`);
      if (r.length) resp = r[0];
    }
    console.log(`\n=== cmo-live-moments dry run, mode=${mode} (pg_net request ${id}) ===`);
    if (!resp) { console.log("No response recorded within 90s."); continue; }
    console.log(`status_code=${resp.status_code} timed_out=${resp.timed_out} error=${resp.error_msg ?? "none"}`);
    let content = resp.content ?? "";
    try { content = JSON.stringify(JSON.parse(content), null, 2); } catch { /* raw */ }
    console.log(String(content).slice(0, 8000));
  }
}

// ------------------------------------------------------------------- main
try {
  if (MODE === "check") await check();
  else if (MODE === "apply") await apply();
  else if (MODE === "live-moments-dry-run") await liveMomentsDryRun();
  else throw new Error(`unknown mode '${MODE}'`);
} catch (e) {
  console.log(`::error::${clean(e?.message || e)}`);
  process.exit(1);
}
