import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { assertSelectOnly } from "./management-query.mjs";
import {
  absorbCatalog,
  catalogPlan,
  decideApply,
  emptyCatalog,
  extractObjects,
  reconcileOutcome,
  statusForFile,
} from "./migration-inspect.mjs";

function objectsFor(sql) {
  return extractObjects(sql);
}

describe("catalog batching", () => {
  test("one relation query covers many files, and every query is one SELECT", () => {
    const tables = new Set();
    for (let i = 0; i < 40; i++) tables.add(`public.t${i}`);
    const plan = catalogPlan({
      tables, columns: new Set(), indexes: new Set(), functions: new Set(),
      views: new Set(), cron: new Set(), rls: new Set(),
    });
    assert.equal(plan.length, 1);
    assert.equal(plan[0].kind, "relation");
    assert.equal(plan[0].sql.includes("union all"), false);
    for (const q of plan) assertSelectOnly(q.sql);
  });

  test("chunks wide column lists and keeps kinds apart", () => {
    const columns = new Set();
    for (let i = 0; i < 200; i++) columns.add(`public.t.c${i}`);
    const plan = catalogPlan({
      tables: new Set(["public.t"]),
      columns,
      indexes: new Set(),
      functions: new Set(["public.f"]),
      views: new Set(),
      cron: new Set(["job"]),
      rls: new Set(["public.t"]),
    }, 150);
    const kinds = plan.map((q) => q.kind);
    assert.deepEqual(kinds.filter((k) => k === "column").length, 2);
    assert.equal(kinds.filter((k) => k === "relation").length, 1);
    assert.equal(kinds.filter((k) => k === "function").length, 1);
    assert.equal(kinds.filter((k) => k === "rls").length, 1);
    assert.equal(kinds.filter((k) => k === "cron").length, 1);
    for (const q of plan) assertSelectOnly(q.sql);
  });

  test("a missing catalog row is not treated as present", () => {
    const objects = objectsFor("alter table public.media_assets add column if not exists eligible_for_consumer_auto_post boolean;");
    const missing = statusForFile("m.sql", objects, emptyCatalog());
    assert.equal(missing.verdict, "none present");
    assert.equal(missing.rows[0].p, false);

    const index = emptyCatalog();
    absorbCatalog(index, "column", [{ n: "public.media_assets.eligible_for_consumer_auto_post" }]);
    assert.equal(statusForFile("m.sql", objects, index).verdict, "all present");

    const partialObjects = objectsFor(`
      create table public.a (id int);
      create table public.b (id int);
    `);
    const partialIndex = emptyCatalog();
    absorbCatalog(partialIndex, "relation", [
      { n: "public.a", p: true },
      { n: "public.b", p: false },
    ]);
    assert.equal(statusForFile("p.sql", partialObjects, partialIndex).verdict, "partially present");
    assert.equal(statusForFile("empty.sql", objectsFor("update public.t set a = 1;"), emptyCatalog()).verdict, "unknown (no detectable objects)");
  });

  test("the consumer denylist migration declares one column", () => {
    const sql = readFileSync(new URL("../../supabase/migrations/20260905160000_consumer_auto_post_media_denylist.sql", import.meta.url), "utf8");
    const objects = extractObjects(sql);
    assert.deepEqual([...objects.columns], ["public.media_assets.eligible_for_consumer_auto_post"]);
    assert.equal(objects.tables.size + objects.indexes.size + objects.functions.size + objects.views.size + objects.cron.size + objects.rls.size, 0);
  });
});

describe("apply guard and reconcile", () => {
  test("unknown and partial files still block, and the opt-in only warns", () => {
    const statuses = [
      { file: "target.sql", verdict: "none present" },
      { file: "present.sql", verdict: "all present" },
      { file: "mystery.sql", verdict: "unknown (no detectable objects)" },
      { file: "half.sql", verdict: "partially present" },
    ];
    const refused = decideApply({ target: "target.sql", statuses, allowUnverified: false });
    assert.equal(refused.action, "refuse");
    assert.deepEqual(refused.blocking.map((s) => s.file), ["mystery.sql", "half.sql"]);
    assert.deepEqual(refused.confirmed.map((s) => s.file), ["present.sql"]);
    const opted = decideApply({ target: "target.sql", statuses, allowUnverified: true });
    assert.equal(opted.action, "apply");
    assert.equal(opted.blocking.length, 2);
  });

  test("reconcile never calls a lost response a clean miss or a success without proof", () => {
    assert.deepEqual(reconcileOutcome({ ledgerPresent: true, objectVerdict: "all present", readFailed: false }), { code: 0, outcome: "reconciled_applied" });
    assert.equal(reconcileOutcome({ ledgerPresent: false, objectVerdict: "none present", readFailed: false }).outcome, "not_visible");
    assert.equal(reconcileOutcome({ ledgerPresent: false, objectVerdict: "all present", readFailed: false }).outcome, "objects_without_ledger");
    assert.equal(reconcileOutcome({ ledgerPresent: false, objectVerdict: "partially present", readFailed: false }).outcome, "partial");
    assert.equal(reconcileOutcome({ ledgerPresent: true, objectVerdict: "none present", readFailed: false }).outcome, "ledger_without_objects");
    assert.equal(reconcileOutcome({ ledgerPresent: false, objectVerdict: "none present", readFailed: true }).outcome, "reconcile_unreadable");
    assert.equal(reconcileOutcome({ ledgerPresent: false, objectVerdict: "none present", readFailed: false }).code, 4);
  });
});
