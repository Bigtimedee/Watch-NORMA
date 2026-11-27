import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  backoffMs,
  createManagementQuery,
  isThrottlerRejection,
  parseRetryAfter,
} from "./management-query.mjs";

const TOKEN = "super-secret-token";

function jsonResponse(status, body, headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    headers: { get: (name) => lower[String(name).toLowerCase()] ?? null },
  };
}

function client(overrides = {}) {
  const calls = [];
  const sleeps = [];
  let clock = 0;
  const fetch = overrides.fetch ?? (async () => jsonResponse(201, []));
  const wrapped = async (url, init) => {
    calls.push({ url, init: JSON.parse(init.body), authorization: init.headers.Authorization });
    return fetch(url, init, calls.length);
  };
  const query = createManagementQuery({
    token: TOKEN,
    projectRef: "projref",
    fetch: wrapped,
    sleep: async (ms) => { sleeps.push(ms); clock += ms; },
    now: () => clock,
    random: () => 0,
    minIntervalMs: 0,
    maxRetryWaitMs: 30_000,
    ...overrides,
    fetch: wrapped,
  });
  return { query, calls, sleeps, setClock: (n) => { clock = n; } };
}

describe("retry timing", () => {
  test("parses Retry-After seconds and HTTP dates", () => {
    const now = Date.parse("2026-11-09T23:26:38.000Z");
    assert.equal(parseRetryAfter("2", now), 2000);
    assert.equal(parseRetryAfter("0", now), 0);
    assert.equal(parseRetryAfter("Sun, 09 Nov 2026 23:26:40 GMT", now), 2000);
    assert.equal(parseRetryAfter("not-a-date", now), null);
    assert.equal(parseRetryAfter("-5", now), null);
  });

  test("uses Retry-After instead of the exponent, and jitters when it is absent", () => {
    assert.equal(backoffMs(0, { random: () => 0, retryAfterMs: 2000 }), 2000);
    assert.equal(backoffMs(0, { random: () => 0, retryAfterMs: null }), 250);
    assert.equal(backoffMs(1, { random: () => 0, retryAfterMs: null }), 500);
    assert.equal(backoffMs(0, { random: () => 0.99, retryAfterMs: null }), 311);
  });

  test("recognizes the throttler body from run 42720446058", () => {
    assert.equal(isThrottlerRejection(429, '{"message":"ThrottlerException: Too Many Requests"}'), true);
    assert.equal(isThrottlerRejection(429, "slow down"), false);
    assert.equal(isThrottlerRejection(400, "ThrottlerException: Too Many Requests"), false);
  });
});

describe("read retries", () => {
  test("retries a throttler 429 using Retry-After, then returns the row", async () => {
    let n = 0;
    const { query, calls, sleeps } = client({
      fetch: async () => {
        n += 1;
        if (n === 1) return jsonResponse(429, { message: "ThrottlerException: Too Many Requests" }, { "retry-after": "2" });
        return jsonResponse(201, [{ ok: true }]);
      },
    });
    const rows = await query.read("select 1 as ok");
    assert.deepEqual(rows, [{ ok: true }]);
    assert.equal(calls.length, 2);
    assert.deepEqual(sleeps, [2000]);
    assert.equal(query.stats.throttled, 1);
    assert.equal(query.stats.retries, 1);
    assert.equal(query.stats.writes, 0);
  });

  test("exhausts read retries without a further call past the cap", async () => {
    const { query, calls, sleeps } = client({
      maxReadAttempts: 3,
      fetch: async () => jsonResponse(429, { message: "ThrottlerException: Too Many Requests" }),
    });
    await assert.rejects(query.read("select 1 as ok"), (e) => e.code === "throttle_exhausted" && e.attempts === 3);
    assert.equal(calls.length, 3);
    assert.deepEqual(sleeps, [250, 500]);
  });

  test("fails fast when Retry-After exceeds the wait budget", async () => {
    const { query, calls } = client({
      maxRetryWaitMs: 1000,
      fetch: async () => jsonResponse(429, { message: "ThrottlerException: Too Many Requests" }, { "retry-after": "120" }),
    });
    await assert.rejects(query.read("select 1 as ok"), (e) => e.code === "throttle_exhausted" && /120s/.test(e.message));
    assert.equal(calls.length, 1);
  });

  test("does not retry auth or SQL failures, and redacts the token", async () => {
    const auth = client({ fetch: async () => jsonResponse(401, { message: `bad ${TOKEN}` }) });
    await assert.rejects(auth.query.read("select 1 as ok"), (e) => {
      assert.equal(e.code, "auth");
      assert.equal(e.message.includes(TOKEN), false);
      assert.match(e.message, /\*\*\*/);
      return true;
    });
    assert.equal(auth.calls.length, 1);
    assert.deepEqual(auth.sleeps, []);

    const sql = client({ fetch: async () => jsonResponse(400, { message: "syntax error at or near foo" }) });
    await assert.rejects(sql.query.read("select 1 as ok"), (e) => e.code === "permanent" && /syntax error/.test(e.message));
    assert.equal(sql.calls.length, 1);
  });

  test("retries a dropped read and does not send a write", async () => {
    let n = 0;
    const { query, calls } = client({
      fetch: async () => {
        n += 1;
        if (n === 1) throw new Error("ECONNRESET");
        return jsonResponse(201, [{ n: 1 }]);
      },
    });
    const rows = await query.read("select 1 as n");
    assert.deepEqual(rows, [{ n: 1 }]);
    assert.equal(calls.length, 2);
    assert.equal(query.stats.writes, 0);
  });

  test("stops at the read budget", async () => {
    const { query, calls } = client({ readBudget: 2, fetch: async () => jsonResponse(201, []) });
    await query.read("select 1 as n");
    await query.read("select 1 as n");
    await assert.rejects(query.read("select 1 as n"), (e) => e.code === "budget");
    assert.equal(calls.length, 2);
  });

  test("refuses a read that is not a single SELECT before any request", async () => {
    const { query, calls } = client();
    await assert.rejects(query.read("insert into t values (1)"), (e) => e.code === "select_guard");
    await assert.rejects(query.read("select 1; select 2"), (e) => e.code === "select_guard");
    assert.equal(calls.length, 0);
  });

  test("falls back from a missing read-only route once", async () => {
    const warnings = [];
    const { query, calls } = client({
      onWarning: (m) => warnings.push(m),
      fetch: async (url) => {
        if (String(url).endsWith("/read-only")) return jsonResponse(404, { message: "not found" });
        return jsonResponse(201, [{ n: 1 }]);
      },
    });
    const rows = await query.read("select 1 as n");
    assert.deepEqual(rows, [{ n: 1 }]);
    assert.equal(calls.length, 2);
    assert.equal(String(calls[1].url).endsWith("/read-only"), false);
    assert.equal(warnings.length, 1);
    const again = await query.read("select 2 as n");
    assert.deepEqual(again, [{ n: 1 }]);
    assert.equal(calls.length, 3);
    assert.equal(warnings.length, 1);
  });

  test("serializes overlapping reads and keeps a gap", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const { query, sleeps } = client({
      minIntervalMs: 100,
      fetch: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        inFlight -= 1;
        return jsonResponse(201, []);
      },
    });
    await Promise.all([query.read("select 1 as n"), query.read("select 2 as n")]);
    assert.equal(maxInFlight, 1);
    assert.deepEqual(sleeps, [100]);
  });
});

describe("writes", () => {
  test("retries only a throttler 429, and accepts the statement once", async () => {
    let n = 0;
    const { query, calls } = client({
      fetch: async () => {
        n += 1;
        if (n === 1) return jsonResponse(429, { message: "ThrottlerException: Too Many Requests" }, { "retry-after": "1" });
        return jsonResponse(201, []);
      },
    });
    const rows = await query.write("begin; select 1; commit;");
    assert.deepEqual(rows, []);
    assert.equal(calls.length, 2);
    assert.equal(query.stats.writes, 2);
    assert.equal(query.stats.writesAccepted, 1);
  });

  test("does not retry a network failure, a bare 429, or a SQL error", async () => {
    for (const [label, respond] of [
      ["network", async () => { throw new Error("socket hang up"); }],
      ["bare429", async () => jsonResponse(429, { message: "slow down" })],
      ["sql", async () => jsonResponse(400, { message: "syntax error at or near foo" })],
      ["gateway", async () => jsonResponse(504, { message: "gateway timeout" })],
    ]) {
      const { query, calls } = client({ fetch: respond });
      const expected = label === "sql" ? "permanent" : "ambiguous_write";
      await assert.rejects(query.write("begin; select 1; commit;"), (e) => {
        assert.equal(e.code, expected, label);
        if (expected === "ambiguous_write") assert.match(e.message, /not retried/);
        return true;
      });
      assert.equal(calls.length, 1, label);
      assert.equal(query.stats.writesAccepted, 0, label);
    }
  });

  test("stops retrying a throttled write when Retry-After is too long", async () => {
    const { query, calls } = client({
      maxRetryWaitMs: 1000,
      fetch: async () => jsonResponse(429, { message: "ThrottlerException: Too Many Requests" }, { "retry-after": "90" }),
    });
    await assert.rejects(query.write("begin; select 1; commit;"), (e) => e.code === "throttle_exhausted");
    assert.equal(calls.length, 1);
    assert.equal(query.stats.writesAccepted, 0);
  });
});
