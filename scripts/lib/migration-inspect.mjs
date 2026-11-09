/**
 * Pure helpers for the Apply migration preflight.
 *
 * Object existence used to be one Management API read per unapplied file
 * (a UNION ALL of that file's checks). Run 42720446058 inspected 70 unapplied
 * files that way and received HTTP 429 before it sent any migration SQL.
 * Callers now build a handful of catalog queries for the whole set and match
 * rows locally. Verdict strings stay the same, so the apply guard does not
 * get looser.
 */

export function lit(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

export function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function qname(raw) {
  const n = raw.replace(/"/g, "");
  return n.includes(".") ? n : `public.${n}`;
}

export function extractObjects(sqlRaw) {
  const sql = stripComments(sqlRaw);
  const o = {
    tables: new Set(),
    columns: new Set(),
    indexes: new Set(),
    functions: new Set(),
    views: new Set(),
    cron: new Set(),
    rls: new Set(),
  };
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."]+)/gi)) o.tables.add(qname(m[1]));
  for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w."]+)([\s\S]*?);/gi)) {
    const t = qname(m[1]);
    for (const c of m[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?("?[\w]+"?)/gi)) {
      o.columns.add(`${t}.${c[1].replace(/"/g, "")}`);
    }
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

export function versionOf(file) {
  const m = /^([0-9]+)_(.+)\.sql$/.exec(file);
  return m ? { version: m[1], name: m[2] } : null;
}

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function unionObjects(list) {
  const o = {
    tables: new Set(), columns: new Set(), indexes: new Set(), functions: new Set(),
    views: new Set(), cron: new Set(), rls: new Set(),
  };
  for (const item of list) {
    for (const key of Object.keys(o)) for (const name of item[key]) o[key].add(name);
  }
  return o;
}

function tuple2(name) {
  const [schema, rest] = name.split(".");
  if (!schema || !rest) return null;
  return `(${lit(schema)}, ${lit(rest)})`;
}

function tuple3(name) {
  const parts = name.split(".");
  if (parts.length !== 3) return null;
  return `(${parts.map(lit).join(", ")})`;
}

/**
 * One SELECT per object kind, chunked so a single statement stays modest.
 * Empty kinds produce no query. Every statement is a single read.
 */
export function catalogPlan(objects, chunkSize = 150) {
  const queries = [];
  const relations = [...objects.tables, ...objects.views, ...objects.indexes].sort();
  for (const group of chunks(relations, chunkSize)) {
    queries.push({
      kind: "relation",
      sql: `select n, to_regclass(n) is not null as p from unnest(array[${group.map(lit).join(", ")}]::text[]) as n`,
    });
  }
  const columnTuples = [...objects.columns].sort().map(tuple3).filter(Boolean);
  for (const group of chunks(columnTuples, chunkSize)) {
    queries.push({
      kind: "column",
      sql: `select (c.table_schema || '.' || c.table_name || '.' || c.column_name) as n from information_schema.columns c where (c.table_schema, c.table_name, c.column_name) in (${group.join(", ")})`,
    });
  }
  const fnTuples = [...objects.functions].sort().map(tuple2).filter(Boolean);
  for (const group of chunks(fnTuples, chunkSize)) {
    queries.push({
      kind: "function",
      sql: `select distinct (ns.nspname || '.' || p.proname) as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where (ns.nspname, p.proname) in (${group.join(", ")})`,
    });
  }
  const rlsTuples = [...objects.rls].sort().map(tuple2).filter(Boolean);
  for (const group of chunks(rlsTuples, chunkSize)) {
    queries.push({
      kind: "rls",
      sql: `select (ns.nspname || '.' || c.relname) as n, c.relrowsecurity as p from pg_class c join pg_namespace ns on ns.oid = c.relnamespace where (ns.nspname, c.relname) in (${group.join(", ")})`,
    });
  }
  const cronNames = [...objects.cron].sort();
  for (const group of chunks(cronNames, chunkSize)) {
    queries.push({
      kind: "cron",
      sql: `select jobname as n from cron.job where jobname in (${group.map(lit).join(", ")})`,
    });
  }
  return queries;
}

export function emptyCatalog() {
  return {
    relation: new Map(),
    column: new Set(),
    fn: new Set(),
    rls: new Map(),
    cron: new Set(),
  };
}

export function absorbCatalog(index, kind, rows) {
  for (const row of rows || []) {
    if (kind === "relation") index.relation.set(row.n, row.p === true);
    else if (kind === "column") index.column.add(row.n);
    else if (kind === "function") index.fn.add(row.n);
    else if (kind === "rls") index.rls.set(row.n, row.p === true);
    else if (kind === "cron") index.cron.add(row.n);
  }
  return index;
}

function presentRelation(index, name) {
  return index.relation.get(name) === true;
}

export function statusForFile(file, objects, index) {
  const rows = [];
  for (const n of objects.tables) rows.push({ k: "table", n, p: presentRelation(index, n) });
  for (const n of objects.views) rows.push({ k: "view", n, p: presentRelation(index, n) });
  for (const n of objects.indexes) rows.push({ k: "index", n, p: presentRelation(index, n) });
  for (const n of objects.columns) rows.push({ k: "column", n, p: index.column.has(n) });
  for (const n of objects.functions) rows.push({ k: "function", n, p: index.fn.has(n) });
  for (const n of objects.rls) rows.push({ k: "rls_enabled", n, p: index.rls.get(n) === true });
  for (const n of objects.cron) rows.push({ k: "cron_job", n, p: index.cron.has(n) });
  if (!rows.length) {
    return { file, detectable: 0, present: 0, rows, verdict: "unknown (no detectable objects)" };
  }
  const present = rows.filter((r) => r.p === true).length;
  const verdict = present === rows.length ? "all present" : present === 0 ? "none present" : "partially present";
  return { file, detectable: rows.length, present, rows, verdict };
}

export function formatStatus(s) {
  const lines = [`  ${s.file}: ${s.verdict} (${s.present}/${s.detectable})`];
  for (const r of s.rows) lines.push(`      [${r.p ? "x" : " "}] ${r.k} ${r.n}`);
  return lines.join("\n");
}

export async function inspectFiles(fileBodies, read) {
  const parsed = fileBodies.map(({ file, sql }) => ({ file, objects: extractObjects(sql) }));
  const plan = catalogPlan(unionObjects(parsed.map((p) => p.objects)));
  const index = emptyCatalog();
  for (const query of plan) absorbCatalog(index, query.kind, await read(query.sql));
  return {
    catalogQueries: plan.length,
    statuses: parsed.map((p) => statusForFile(p.file, p.objects, index)),
  };
}

/**
 * Other unapplied files that are not "all present" block apply, unless the
 * operator set allow_unverified_others. Unknown (no detectable objects) still
 * blocks. The target file itself is not in `blocking`.
 */
export function decideApply({ target, statuses, allowUnverified }) {
  const others = statuses.filter((s) => s.file !== target);
  const blocking = others.filter((s) => s.verdict !== "all present");
  const confirmed = others.filter((s) => s.verdict === "all present");
  if (blocking.length && !allowUnverified) return { action: "refuse", blocking, confirmed };
  return { action: "apply", blocking, confirmed };
}

/**
 * After a write whose HTTP result does not prove commit or rollback.
 * Never treats "not visible" as permission to send the SQL again.
 */
export function reconcileOutcome({ ledgerPresent, objectVerdict, readFailed }) {
  if (readFailed) return { code: 4, outcome: "reconcile_unreadable" };
  if (ledgerPresent && (objectVerdict === "all present" || objectVerdict.startsWith("unknown"))) {
    return { code: 0, outcome: "reconciled_applied" };
  }
  if (ledgerPresent) return { code: 4, outcome: "ledger_without_objects" };
  if (objectVerdict === "all present" || objectVerdict === "partially present") {
    return { code: 4, outcome: objectVerdict === "all present" ? "objects_without_ledger" : "partial" };
  }
  return { code: 4, outcome: "not_visible" };
}
