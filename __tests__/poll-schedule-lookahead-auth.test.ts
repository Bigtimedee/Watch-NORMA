/**
 * Regression test: poll-schedule-lookahead's authentication contract.
 *
 * Why this test exists
 * --------------------
 * On 2026-05-16, NBA / MLB / NCAA games disappeared from every future date in
 * the NORMA Games screen. The root cause was in
 * supabase/functions/poll-schedule-lookahead/index.ts:
 *
 *   const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 *   ...
 *   await fetch(`${supabaseUrl}/functions/v1/poll-schedule`, {
 *     headers: { Authorization: `Bearer ${serviceRoleKey}` },
 *     ...
 *   });
 *
 * After Supabase rolled out the new API key system, the auto-injected
 * SUPABASE_SERVICE_ROLE_KEY is an `sb_secret_*` opaque key. That key works
 * fine as `apikey:` for PostgREST and inside `createClient(url, key)`, but
 * it is NOT a valid JWT, so the function gateway rejects it with
 * UNAUTHORIZED_INVALID_JWT_FORMAT. Result: every lookahead run failed
 * silently, no future games were ever pre-populated, and the Games screen
 * showed "No games on …" for every date past today.
 *
 * `supabase.functions.invoke()` fails for the same root reason — supabase-js
 * forwards the client constructor key as Bearer to the function gateway.
 *
 * The reliable contract:
 *   1. The caller (pg_cron in migration 057, or a manual curl) sends a
 *      valid JWT in the inbound Authorization header.
 *   2. Lookahead FORWARDS that exact header to poll-schedule.
 * Migration 057 hardcodes the valid service-role JWT in the cron job, so the
 * inbound header is always a real JWT.
 *
 * This test guards the source file against re-introducing the broken
 * env-var-based pattern.
 */

import * as fs from "fs";
import * as path from "path";

const LOOKAHEAD_PATH = path.join(
  __dirname,
  "..",
  "supabase",
  "functions",
  "poll-schedule-lookahead",
  "index.ts",
);

const MIGRATION_PATH = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "057_fix_lookahead_cron_auth.sql",
);

// Lines that are inside file-header / comment blocks intentionally describe
// the broken pattern. Strip them before pattern-matching.
function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
}

describe("poll-schedule-lookahead authentication pattern", () => {
  let source: string;
  let code: string;

  beforeAll(() => {
    source = fs.readFileSync(LOOKAHEAD_PATH, "utf-8");
    code = codeOnly(source);
  });

  it("source file exists", () => {
    expect(source.length).toBeGreaterThan(0);
  });

  it("forwards the inbound Authorization header (does not synthesize one from env)", () => {
    // Must read the inbound header
    expect(code).toMatch(/req\.headers\.get\(\s*["']Authorization["']/i);
    // And forward it (case-insensitive — we accept the lowercase fallback variant too)
    expect(code).toMatch(/Authorization:\s*inboundAuth/);
  });

  it("does NOT build a Bearer header from Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')", () => {
    expect(code).not.toMatch(/Authorization:\s*`Bearer \$\{[^}]*SERVICE_ROLE_KEY[^}]*\}`/);
    expect(code).not.toMatch(/Authorization:\s*`Bearer \$\{[^}]*serviceRoleKey[^}]*\}`/);
  });

  it("does NOT use supabase.functions.invoke for poll-schedule (also auth-broken — see header)", () => {
    expect(code).not.toMatch(/functions\.invoke\(\s*["']poll-schedule["']/);
  });

  it("rejects requests with no inbound Authorization header (fail-fast, not silent failure)", () => {
    expect(code).toMatch(/Missing Authorization header/i);
  });
});

describe("Migration 057 — lookahead cron auth", () => {
  let sql: string;
  let sqlNoComments: string;

  beforeAll(() => {
    sql = fs.readFileSync(MIGRATION_PATH, "utf-8");
    // Strip `-- comment` lines so the migration's documentation (which
    // intentionally describes the broken pattern) doesn't trip the test.
    sqlNoComments = sql
      .split("\n")
      .filter((line) => !/^\s*--/.test(line))
      .join("\n");
  });

  it("unschedules the old broken cron before scheduling the fixed one", () => {
    expect(sqlNoComments).toMatch(/cron\.unschedule\(['"]poll-schedule-lookahead['"]\)/);
  });

  it("schedules poll-schedule-lookahead with a hardcoded JWT (not current_setting)", () => {
    expect(sqlNoComments).toMatch(/cron\.schedule\(\s*['"]poll-schedule-lookahead['"]/);
    // Must NOT use the broken current_setting() pattern from migration 046
    expect(sqlNoComments).not.toMatch(/current_setting\(['"]app\.settings\.service_role_key['"]\)/);
    // MUST include a real JWT signature (last segment of a JWT has at least
    // ~40 base64url chars after the second dot)
    expect(sqlNoComments).toMatch(/Bearer eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{40,}/);
  });
});
