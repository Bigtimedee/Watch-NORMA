import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { runMigrationTool } from "./apply-migration.mjs";
import { createManagementQuery } from "./lib/management-query.mjs";

const TOKEN = "super-secret-token";
const TARGET = "20260905160000_consumer_auto_post_media_denylist.sql";
const TARGET_SQL = `alter table public.media_assets add column if not exists eligible_for_consumer_auto_post boolean not null default true;\n`;
const COLUMN = "public.media_assets.eligible_for_consumer_auto_post";

function jsonResponse(status, body, headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    headers: { get: (name) => lower[String(name).toLowerCase()] ?? null },
  };
}

function literals(sql) {
  return [...sql.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
}

function makeDb() {
  const state = { versions: [], columns: new Set(), relations: new Set() };
  const calls = [];
  let readFailures = 0;
  let failReadsAfterWrite = false;
  let writeMode = "ok";
  const fetch = async (url, init) => {
    const sql = JSON.parse(init.body).query;
    calls.push({ url: String(url), sql });
    const writing = String(url).endsWith("/database/query");
    if (!writing) {
      if (failReadsAfterWrite && state.versions.length) {
        return jsonResponse(429, { message: "ThrottlerException: Too Many Requests" }, { "retry-after": "0" });
      }
      if (readFailures > 0) {
        readFailures -= 1;
        return jsonResponse(429, { message: "ThrottlerException: Too Many Requests" }, { "retry-after": "0" });
      }
      return jsonResponse(201, answer(sql));
    }
    if (writeMode === "throttle-once" && calls.filter((c) => c.url.endsWith("/database/query")).length === 1) {
      return jsonResponse(429, { message: "ThrottlerException: Too Many Requests" }, { "retry-after": "0" });
    }
    if (writeMode === "throttle-forever") {
      return jsonResponse(429, { message: "ThrottlerException: Too Many Requests" }, { "retry-after": "0" });
    }
    if (writeMode === "sql") return jsonResponse(400, { message: "syntax error at or near foo" });
    if (writeMode === "auth") return jsonResponse(401, { message: `nope ${TOKEN}` });
    if (writeMode === "hang-before-commit") throw new Error("socket hang up");
    commit(sql);
    if (writeMode === "hang-after-commit") throw new Error(`socket hang up ${TOKEN}`);
    return jsonResponse(201, []);
  };

  function answer(sql) {
    if (sql.includes("ordinal_position")) {
      return [{ column_name: "version" }, { column_name: "statements" }, { column_name: "name" }];
    }
    if (sql.includes("where version =")) {
      const version = literals(sql)[0];
      return state.versions.filter((r) => r.version === version);
    }
    if (sql.includes("order by version")) return state.versions.map((r) => ({ ...r }));
    if (sql.includes("to_regclass")) {
      return literals(sql).map((n) => ({ n, p: state.relations.has(n) }));
    }
    if (sql.includes("information_schema.columns c")) {
      const rows = [];
      for (const m of sql.matchAll(/\('([^']*)',\s*'([^']*)',\s*'([^']*)'\)/g)) {
        const name = `${m[1]}.${m[2]}.${m[3]}`;
        if (state.columns.has(name)) rows.push({ n: name });
      }
      return rows;
    }
    if (sql.includes("pg_proc") || sql.includes("relrowsecurity") || sql.includes("from cron.job")) return [];
    throw new Error(`unexpected read SQL: ${sql.slice(0, 180)}`);
  }

  function commit(sql) {
    const version = sql.match(/values \('(\d+)'/)?.[1];
    const name = sql.match(/values \('\d+', '([^']+)'/)?.[1];
    if (version) state.versions.push({ version, name });
    if (sql.includes("eligible_for_consumer_auto_post")) state.columns.add(COLUMN);
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_.]+)/gi)) {
      state.relations.add(m[1].includes(".") ? m[1] : `public.${m[1]}`);
    }
  }

  return {
    state,
    calls,
    fetch,
    setReadFailures(n) { readFailures = n; },
    failReadsAfterCommit() { failReadsAfterWrite = true; },
    setWriteMode(mode) { writeMode = mode; },
    writes() { return calls.filter((c) => c.url.endsWith("/database/query")); },
  };
}

function toolClient(db, overrides = {}) {
  return createManagementQuery({
    token: TOKEN,
    projectRef: "projref",
    fetch: db.fetch,
    sleep: async () => {},
    now: () => 0,
    random: () => 0,
    minIntervalMs: 0,
    maxRetryWaitMs: 30_000,
    readBudget: 64,
    ...overrides,
  });
}

function workspace(files) {
  const dir = mkdtempSync(join(tmpdir(), "norma-mig-"));
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return dir;
}

async function run(dir, db, extra = {}) {
  const logs = [];
  const summaryPath = join(dir, "summary.md");
  const query = extra.query ?? toolClient(db, extra.client);
  const code = await runMigrationTool({
    mode: extra.mode ?? "apply",
    target: extra.target ?? TARGET,
    dir,
    allowUnverified: extra.allowUnverified ?? false,
    projectRef: "projref",
    query,
    token: TOKEN,
    log: (line) => logs.push(String(line)),
    summaryPath,
  });
  const summary = readFileSync(summaryPath, "utf8");
  return { code, logs, summary, query };
}

describe("apply migration request shape", () => {
  test("checks 40 unapplied files with a handful of reads and no writes", async () => {
    const files = {};
    for (let i = 0; i < 40; i++) {
      const version = String(20260101000000 + i);
      files[`${version}_t${i}.sql`] = `create table public.t${i} (id int);\n`;
    }
    const dir = workspace(files);
    const db = makeDb();
    try {
      const { code, summary } = await run(dir, db, { mode: "check", target: "" });
      assert.equal(code, 0);
      const reads = db.calls.filter((c) => c.url.endsWith("/read-only"));
      assert.ok(reads.length <= 8, `expected <= 8 reads, got ${reads.length}`);
      assert.equal(reads.filter((c) => c.sql.includes("to_regclass")).length, 1);
      assert.equal(db.writes().length, 0);
      assert.equal(db.calls.some((c) => c.sql.toLowerCase().includes("union all")), false);
      assert.match(summary, /Files inspected \| 40/);
      assert.equal(summary.includes(TOKEN), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a 429 during preflight is retried and does not send SQL when it persists", async () => {
    const dir = workspace({ [TARGET]: TARGET_SQL });
    const db = makeDb();
    db.setReadFailures(2);
    try {
      const recovered = await run(dir, db, { allowUnverified: true });
      assert.equal(recovered.code, 0);
      assert.equal(db.writes().length, 1);
      assert.equal(db.state.columns.has(COLUMN), true);
      assert.equal(db.state.versions.length, 1);
      assert.match(recovered.summary, /Writes accepted \| 1/);

      const stuck = makeDb();
      stuck.setReadFailures(20);
      const failed = await run(dir, stuck, {
        allowUnverified: true,
        client: { maxReadAttempts: 3 },
      });
      assert.equal(failed.code, 1);
      assert.equal(stuck.writes().length, 0);
      assert.match(failed.logs.join("\n"), /Migration SQL was not sent/);
      assert.equal(failed.summary.includes(TOKEN), false);
      assert.equal(stuck.state.versions.length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("auth fails fast and a SQL write error is not retried", async () => {
    const dir = workspace({ [TARGET]: TARGET_SQL });
    try {
      const authDb = makeDb();
      authDb.fetch = async () => jsonResponse(401, { message: `denied ${TOKEN}` });
      const auth = await run(dir, authDb, { allowUnverified: true, query: toolClient(authDb) });
      assert.equal(auth.code, 1);
      assert.match(auth.logs.join("\n"), /read query failed 401/);
      assert.equal(auth.logs.join("\n").includes(TOKEN), false);
      assert.match(auth.logs.join("\n"), /Migration SQL was not sent/);

      const sqlDb = makeDb();
      sqlDb.setWriteMode("sql");
      const sql = await run(dir, sqlDb, { allowUnverified: true });
      assert.equal(sql.code, 1);
      assert.equal(sqlDb.writes().length, 1);
      assert.match(sql.logs.join("\n"), /syntax error/);
      assert.equal(/Migration SQL was not sent/.test(sql.logs.join("\n")), false);
      assert.equal(sqlDb.state.versions.length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a lost write is reconciled once and is not sent again", async () => {
    const dir = workspace({ [TARGET]: TARGET_SQL });
    try {
      const committed = makeDb();
      committed.setWriteMode("hang-after-commit");
      const applied = await run(dir, committed, { allowUnverified: true });
      assert.equal(applied.code, 0);
      assert.equal(committed.writes().length, 1);
      assert.match(applied.summary, /reconciled_applied/);
      assert.match(applied.logs.join("\n"), /not sent again/i);
      assert.equal(applied.summary.includes(TOKEN), false);

      const dropped = makeDb();
      dropped.setWriteMode("hang-before-commit");
      const missed = await run(dir, dropped, { allowUnverified: true });
      assert.equal(missed.code, 4);
      assert.equal(dropped.writes().length, 1);
      assert.match(missed.summary, /not_visible/);
      assert.match(missed.logs.join("\n"), /Do not assume it rolled back/);
      assert.equal(dropped.state.columns.has(COLUMN), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("does not write when the ledger already has the version, even if it appears mid-preflight", async () => {
    const dir = workspace({ [TARGET]: TARGET_SQL });
    try {
      const recorded = makeDb();
      recorded.state.versions.push({ version: "20260905160000", name: "consumer_auto_post_media_denylist" });
      recorded.state.columns.add(COLUMN);
      const already = await run(dir, recorded, { allowUnverified: true });
      assert.equal(already.code, 0);
      assert.equal(recorded.writes().length, 0);
      assert.match(already.summary, /already_recorded/);

      const raced = makeDb();
      raced.state.columns.add(COLUMN);
      const original = raced.fetch;
      let versionLookups = 0;
      raced.fetch = async (url, init) => {
        const sql = JSON.parse(init.body).query;
        if (sql.includes("where version =")) {
          versionLookups += 1;
          if (versionLookups === 1) {
            raced.state.versions.push({ version: "20260905160000", name: "consumer_auto_post_media_denylist" });
          }
        }
        return original(url, init);
      };
      const mid = await run(dir, raced, { allowUnverified: true });
      assert.equal(mid.code, 0);
      assert.equal(raced.writes().length, 0);
      assert.match(mid.logs.join("\n"), /appeared during preflight/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("refuses other unapplied files unless the operator opts in, and the confirmed list is exact", async () => {
    const dir = workspace({
      [TARGET]: TARGET_SQL,
      "20260101000000_ready.sql": "create table public.ready (id int);\n",
      "20260101000001_mystery.sql": "update public.ready set id = 1;\n",
    });
    const db = makeDb();
    db.state.relations.add("public.ready");
    try {
      const refused = await run(dir, db, { allowUnverified: false });
      assert.equal(refused.code, 2);
      assert.equal(db.writes().length, 0);
      assert.match(refused.logs.join("\n"), /mystery\.sql: unknown/);

      const optedDb = makeDb();
      optedDb.state.relations.add("public.ready");
      const opted = await run(dir, optedDb, { allowUnverified: true });
      assert.equal(opted.code, 0);
      assert.equal(optedDb.writes().length, 1);
      const text = opted.logs.join("\n");
      assert.match(text, /NOT being applied:\n {2}- 20260101000001_mystery\.sql/);
      assert.match(text, /confirmed present \(recording is out of date, not schema\): 20260101000000_ready\.sql/);
      assert.equal(text.includes("confirmed present (recording is out of date, not schema): 20260101000000_ready.sql, 20260101000001_mystery.sql"), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a throttled write is retried once and a repeated throttler does not loop", async () => {
    const dir = workspace({ [TARGET]: TARGET_SQL });
    try {
      const once = makeDb();
      once.setWriteMode("throttle-once");
      const ok = await run(dir, once, { allowUnverified: true });
      assert.equal(ok.code, 0);
      assert.equal(once.writes().length, 2);
      assert.equal(once.state.versions.length, 1);

      const forever = makeDb();
      forever.setWriteMode("throttle-forever");
      const stopped = await run(dir, forever, {
        allowUnverified: true,
        client: { maxWriteThrottleAttempts: 3 },
      });
      assert.equal(stopped.code, 1);
      assert.equal(forever.writes().length, 3);
      assert.equal(forever.state.versions.length, 0);
      assert.match(stopped.logs.join("\n"), /not executed/);

      const after = makeDb();
      after.failReadsAfterCommit();
      const late = await run(dir, after, { allowUnverified: true, client: { maxReadAttempts: 2 } });
      assert.equal(late.code, 1);
      assert.equal(after.writes().length, 1);
      assert.equal(after.state.versions.length, 1);
      assert.match(late.logs.join("\n"), /write was already accepted/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("workflow recurrence guards", () => {
  test("migration and metrics jobs share a non-cancelling queue and Node 24 actions", () => {
    const root = new URL("../", import.meta.url);
    const workflows = [
      ".github/workflows/apply-migration.yml",
      ".github/workflows/apply-auth-email-templates.yml",
      ".github/workflows/apply-auth-redirects.yml",
      ".github/workflows/ci.yml",
      ".github/workflows/daily-metrics.yml",
      ".github/workflows/eas-status.yml",
      ".github/workflows/set-linkedin-secrets.yml",
    ];
    for (const rel of workflows) {
      const text = readFileSync(new URL(rel, root), "utf8");
      assert.equal(text.includes("actions/checkout@v4"), false, rel);
      assert.equal(text.includes("actions/setup-node@v4"), false, rel);
      if (text.includes("actions/checkout@")) assert.match(text, /actions\/checkout@v7/, rel);
      if (text.includes("actions/setup-node@")) assert.match(text, /actions\/setup-node@v7/, rel);
    }
    for (const rel of [".github/workflows/apply-migration.yml", ".github/workflows/daily-metrics.yml"]) {
      const text = readFileSync(new URL(rel, root), "utf8");
      assert.match(text, /group: supabase-management-query/);
      assert.match(text, /cancel-in-progress: false/);
    }
    const apply = readFileSync(new URL(".github/workflows/apply-migration.yml", root), "utf8");
    assert.match(apply, /node-version: 24/);
    const metrics = readFileSync(new URL("../scripts/daily-metrics.mjs", import.meta.url), "utf8");
    assert.match(metrics, /createManagementQuery/);
    assert.equal(metrics.includes("await fetch("), false);
  });
});
