/**
 * Supabase Management API database query client.
 *
 * The read-only route is POST /v1/projects/{ref}/database/query/read-only
 * (https://supabase.com/docs/reference/api/v1-read-only-query). That reference
 * lists 429 Rate limit exceeded. The Apply migration run 42720446058 failed
 * with `read query failed 429: ThrottlerException: Too Many Requests` — a
 * NestJS throttler rejection from api.supabase.com, not a Postgres error.
 *
 * A throttler 429 is produced by a guard that runs before the query handler,
 * so the SQL was not submitted. Reads, and writes whose body matches that
 * rejection, may be retried. A timeout, a network error, or a 5xx on a write
 * is ambiguous: the statement may have been received. Those are never retried.
 */

export class ManagementQueryError extends Error {
  constructor(message, { code, status = 0, attempts = 1 } = {}) {
    super(message);
    this.name = "ManagementQueryError";
    this.code = code;
    this.status = status;
    this.attempts = attempts;
  }
}

export function assertSelectOnly(sql) {
  const s = sql.trim().toLowerCase();
  if (!/^(select|with)\b/.test(s)) throw new ManagementQueryError("refusing non-SELECT statement", { code: "select_guard" });
  if (s.includes(";")) throw new ManagementQueryError("refusing multi-statement SQL", { code: "select_guard" });
  if (/\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|call|do|vacuum|refresh|lock|set|reset|comment)\b/.test(s.replace(/'[^']*'/g, "''"))) {
    throw new ManagementQueryError("refusing SQL with a write/DDL keyword", { code: "select_guard" });
  }
}

export function cleanMessage(msg, token) {
  let text = msg;
  try {
    const j = JSON.parse(msg);
    text = j.message || j.error || msg;
  } catch { /* plain text */ }
  let s = String(text);
  if (token) s = s.split(token).join("***");
  return s.replace(/\s+/g, " ").slice(0, 600);
}

/** Retry-After may be delta-seconds or an HTTP-date. Returns milliseconds, or null. */
export function parseRetryAfter(header, nowMs) {
  if (header == null || String(header).trim() === "") return null;
  const text = String(header).trim();
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const seconds = Number(text);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return Math.round(seconds * 1000);
  }
  const when = Date.parse(text);
  if (!Number.isNaN(when)) return Math.max(0, when - nowMs);
  return null;
}

export function isThrottlerRejection(status, body) {
  return status === 429 && /throttl|too many requests|rate limit/i.test(String(body || ""));
}

/**
 * Jittered exponential backoff. A usable Retry-After replaces the exponent.
 * `attempt` is 0 for the first retry.
 */
export function backoffMs(attempt, { random, retryAfterMs, baseMs = 250, capMs = 8000 }) {
  if (retryAfterMs != null) return retryAfterMs;
  const exp = Math.min(baseMs * 2 ** attempt, capMs);
  const jitter = Math.floor((random?.() ?? Math.random()) * Math.floor(exp * 0.25));
  return exp + jitter;
}

export function createManagementQuery({
  token,
  projectRef,
  fetch: fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
  random = Math.random,
  minIntervalMs = 250,
  maxReadAttempts = 6,
  maxWriteThrottleAttempts = 4,
  readBudget = 80,
  maxRetryWaitMs = 30_000,
  onWarning = () => {},
} = {}) {
  if (!token || !projectRef) {
    throw new ManagementQueryError("SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF is not set.", { code: "auth" });
  }
  const api = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  const stats = { http: 0, reads: 0, writes: 0, writesAccepted: 0, retries: 0, throttled: 0 };
  const route = { current: "read-only" };
  let readOnlyOk = true;
  let warnedFallback = false;
  let chain = Promise.resolve();
  // The first request should not wait. Later requests start at least
  // minIntervalMs after the previous request started.
  let lastStart = -minIntervalMs;

  function enqueue(fn) {
    const run = chain.then(fn, fn);
    chain = run.then(() => {}, () => {});
    return run;
  }

  async function pace() {
    const wait = Math.max(0, lastStart + minIntervalMs - now());
    if (wait > 0) await sleep(wait);
    lastStart = now();
  }

  async function postOnce(url, sql) {
    await pace();
    stats.http += 1;
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: sql }),
      });
      const text = await res.text();
      const retryAfter = res.headers?.get?.("retry-after") ?? res.headers?.get?.("Retry-After") ?? null;
      return { status: res.status, text, retryAfter };
    } catch (e) {
      return { networkError: true, status: 0, text: String(e?.message || e), retryAfter: null };
    }
  }

  function delayFor(attemptIndex, retryAfterHeader) {
    const retryAfterMs = parseRetryAfter(retryAfterHeader, now());
    if (retryAfterMs != null && retryAfterMs > maxRetryWaitMs) {
      throw new ManagementQueryError(
        `rate limited; Retry-After ${Math.ceil(retryAfterMs / 1000)}s exceeds the ${Math.ceil(maxRetryWaitMs / 1000)}s wait budget. No further request was sent.`,
        { code: "throttle_exhausted", status: 429, attempts: attemptIndex + 1 },
      );
    }
    return backoffMs(attemptIndex, { random, retryAfterMs });
  }

  async function read(sql) {
    assertSelectOnly(sql);
    return enqueue(() => readInner(sql));
  }

  async function readInner(sql) {
    let attempts = 0;
    while (true) {
      if (stats.reads >= readBudget) {
        throw new ManagementQueryError(
          `read budget exhausted (${readBudget} Management API reads). Refusing further reads so a per-file scan cannot flood the API.`,
          { code: "budget", attempts },
        );
      }
      const url = readOnlyOk ? `${api}/read-only` : api;
      const r = await postOnce(url, sql);
      stats.reads += 1;
      attempts += 1;
      if (r.networkError) {
        if (attempts >= maxReadAttempts) {
          throw new ManagementQueryError(`read query failed: network (${cleanMessage(r.text, token)})`, {
            code: "throttle_exhausted", status: 0, attempts,
          });
        }
        stats.retries += 1;
        await sleep(delayFor(attempts - 1, null));
        continue;
      }
      if (readOnlyOk && ([404, 405].includes(r.status) || /permission denied/i.test(r.text))) {
        readOnlyOk = false;
        route.current = "query (select-only guard)";
        if (!warnedFallback) {
          warnedFallback = true;
          onWarning(`read-only endpoint answered ${r.status} (${cleanMessage(r.text, token)}); using /database/query with the SELECT-only guard.`);
        }
        continue;
      }
      if (r.status >= 200 && r.status < 300) {
        try {
          return r.text ? JSON.parse(r.text) : [];
        } catch {
          throw new ManagementQueryError("read query returned non-JSON", { code: "permanent", status: r.status, attempts });
        }
      }
      if (r.status === 401 || r.status === 403) {
        throw new ManagementQueryError(`read query failed ${r.status}: ${cleanMessage(r.text, token)}`, {
          code: "auth", status: r.status, attempts,
        });
      }
      const throttled = isThrottlerRejection(r.status, r.text) || r.status === 429;
      const transient = throttled || [408, 500, 502, 503, 504].includes(r.status);
      if (transient && attempts < maxReadAttempts) {
        if (throttled) stats.throttled += 1;
        stats.retries += 1;
        await sleep(delayFor(attempts - 1, r.retryAfter));
        continue;
      }
      if (transient) {
        throw new ManagementQueryError(`read query failed ${r.status}: ${cleanMessage(r.text, token)}`, {
          code: "throttle_exhausted", status: r.status, attempts,
        });
      }
      throw new ManagementQueryError(`read query failed ${r.status}: ${cleanMessage(r.text, token)}`, {
        code: "permanent", status: r.status, attempts,
      });
    }
  }

  async function write(sql) {
    return enqueue(() => writeInner(sql));
  }

  async function writeInner(sql) {
    let attempts = 0;
    while (true) {
      const r = await postOnce(api, sql);
      stats.writes += 1;
      attempts += 1;
      if (r.networkError) {
        throw new ManagementQueryError(
          `write outcome ambiguous: network (${cleanMessage(r.text, token)}). The statement was not retried.`,
          { code: "ambiguous_write", status: 0, attempts },
        );
      }
      if (r.status >= 200 && r.status < 300) {
        stats.writesAccepted += 1;
        try {
          return r.text ? JSON.parse(r.text) : [];
        } catch {
          throw new ManagementQueryError("write returned non-JSON after a 2xx. The statement was not retried.", {
            code: "ambiguous_write", status: r.status, attempts,
          });
        }
      }
      if (r.status === 401 || r.status === 403) {
        throw new ManagementQueryError(`write failed ${r.status}: ${cleanMessage(r.text, token)}`, {
          code: "auth", status: r.status, attempts,
        });
      }
      if (isThrottlerRejection(r.status, r.text)) {
        stats.throttled += 1;
        if (attempts >= maxWriteThrottleAttempts) {
          throw new ManagementQueryError(
            `write failed ${r.status}: ${cleanMessage(r.text, token)}. The throttler rejected the request before the query handler, so this SQL was not executed.`,
            { code: "throttle_exhausted", status: r.status, attempts },
          );
        }
        stats.retries += 1;
        await sleep(delayFor(attempts - 1, r.retryAfter));
        continue;
      }
      if (r.status === 429 || [408, 500, 502, 503, 504].includes(r.status)) {
        throw new ManagementQueryError(
          `write outcome ambiguous (${r.status}: ${cleanMessage(r.text, token)}). The statement was not retried.`,
          { code: "ambiguous_write", status: r.status, attempts },
        );
      }
      throw new ManagementQueryError(`write failed ${r.status}: ${cleanMessage(r.text, token)}`, {
        code: "permanent", status: r.status, attempts,
      });
    }
  }

  return { read, write, stats, assertSelectOnly, get route() { return route.current; } };
}
