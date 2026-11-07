// Source contract for the cmo-live-moments handler, its migration and config.
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const read = (rel: string) => Deno.readTextFile(new URL(rel, import.meta.url));

Deno.test("handler claims the ledger key BEFORE inserting the calendar row (idempotency)", async () => {
  const src = await read("./index.ts");
  const fn = src.slice(src.indexOf("async function composeAndQueue"));
  const claimAt = fn.indexOf('outcome: "queued"');
  const insertAt = fn.indexOf("insertCalendarRows(");
  assert(claimAt > 0 && insertAt > claimAt, "claimMoment(queued) must precede insertCalendarRows");
  assert(src.includes('code === "23505"'), "duplicate key = another run owns the moment");
  const td = src.slice(src.indexOf("async function runTodaysGames"));
  assert(td.indexOf('outcome: "queued"') < td.indexOf("insertCalendarRows("));
});

Deno.test("dry run never writes or kicks the publisher", async () => {
  const src = await read("./index.ts");
  assert(src.includes("if (dryRun) return { queued: true, info: { ...base, would: \"queue\""));
  assert(src.includes('if (dryRun) return { ...summary, would: "queue" }'));
  assert(src.includes("!opts.dryRun && queuedSomething"));
});

Deno.test("publisher kick forwards the inbound Authorization and never logs it", async () => {
  const src = await read("./index.ts");
  assert(src.includes('req.headers.get("Authorization")'));
  assert(src.includes("Authorization: auth"));
  assert(!src.includes("SUPABASE_SERVICE_ROLE_KEY}`"), "never send the env secret key as Bearer");
  for (const line of src.split("\n").filter((l) => /console\.(log|error|warn)|log\(/.test(l))) {
    assert(!/auth\b|serviceKey|Authorization/.test(line.replace(/publish_kick/g, "")), `logs a secret? ${line}`);
  }
});

Deno.test("rows are text-only X rows for growth formats; no AI images, no media fabricated", async () => {
  const src = await read("./index.ts");
  assert(src.includes("media_urls: []"));
  assert(!/dall-?e|midjourney|openai\.com\/v1\/images|generate_image/i.test(src));
});

Deno.test("migration is additive with RLS, unique moment_key and gated cron", async () => {
  const sql = await read("../../migrations/20261107180000_social_live_moments.sql");
  assert(!/\bDROP\s+(TABLE|COLUMN)\b/i.test(sql), "additive only");
  assert(/moment_key\s+text NOT NULL UNIQUE/.test(sql));
  assert(sql.includes("ALTER TABLE public.social_live_moments ENABLE ROW LEVEL SECURITY"));
  assert(sql.includes("REVOKE ALL ON TABLE public.social_live_moments FROM anon, authenticated"));
  assert(sql.includes("ADD COLUMN IF NOT EXISTS platform_captions jsonb"));
  assert(sql.includes("'cmo-live-moments'") && sql.includes("'* * * * *'"));
  assert(sql.includes("g.status = 'inprogress'"), "live cron only fires while a game is in progress");
  assert(sql.includes("'cmo-todays-games'") && sql.includes("'30 13 * * *'"));
  assert(sql.includes("NOT IN ('live_moment', 'todays_games')"), "SQL empty-media hold exempts text formats");
  assert(sql.includes("interval '3 hours'"), "3h stale hold kept");
  assert(sql.includes("c.ig_attempted_at IS NULL"), "cross-post trigger kept");
  assert(!/eyJhbGciOi/.test(sql), "no plaintext JWT in cron");
});

Deno.test("config.toml pins verify_jwt=false for the cron-invoked function", async () => {
  const toml = await read("../../config.toml");
  assert(/\[functions\.cmo-live-moments\]\s*\nverify_jwt = false/.test(toml));
});
