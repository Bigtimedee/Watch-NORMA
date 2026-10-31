import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  crossPostRow,
  type CrossRow,
  IG_PENDING,
  IgContainerPending,
  type IgResumeDeps,
  planIgResume,
  postInstagramReel,
  resumeIgRow,
} from "./crosspost.ts";

const NOW = new Date("2026-10-31T16:00:00Z");
const VID = "https://x.supabase.co/storage/v1/object/public/m/cfb.mp4";
const base = (o: Partial<CrossRow> = {}): CrossRow => ({
  id: "r1", platform: "twitter", status: "published", body: "CFB Saturday. NORMA has it.",
  hashtags: [], media_urls: [VID], published_at: "2026-10-31T15:00:00Z",
  ig_attempted_at: "2026-10-31T15:00:10Z", ig_error: IG_PENDING, ig_container_id: "C1",
  ig_container_created_at: "2026-10-31T15:00:10Z", ig_container_retried: false, ...o,
});

function rd(code: string, leaseOk = true) {
  const saves: Record<string, unknown>[] = [];
  const calls: string[] = [];
  const d: IgResumeDeps = {
    lease: () => Promise.resolve(leaseOk),
    save: (_id, p) => (saves.push(p), Promise.resolve()),
    status: (c) => (calls.push(`status:${c}`), Promise.resolve({ code, status: "" })),
    publish: (c) => (calls.push(`publish:${c}`), Promise.resolve("IGP1")),
    create: () => (calls.push("create"), Promise.resolve("C2")),
    log: () => {},
  };
  return { d, saves, calls };
}

Deno.test("postInstagramReel: not FINISHED -> IgContainerPending with id saved", async () => {
  const saved: string[] = [];
  const f = ((url: string) => Promise.resolve(new Response(JSON.stringify(
    String(url).endsWith("/media") ? { id: "C9" } : { status_code: "IN_PROGRESS" },
  )))) as unknown as typeof fetch;
  let err: unknown;
  try {
    await postInstagramReel({ userId: "U", token: "t" }, VID, "x", {
      fetch: f, sleep: () => Promise.resolve(), maxPolls: 2, onContainer: (c) => (saved.push(c), Promise.resolve()),
    });
  } catch (e) { err = e; }
  assertEquals(err instanceof IgContainerPending, true);
  assertEquals(saved, ["C9"]);
});

Deno.test("crossPostRow: IG pending is recorded as pending, not failed", async () => {
  const saves: unknown[] = [];
  const cont: string[] = [];
  const out = await crossPostRow(
    { id: "r1", platform: "twitter", status: "published", body: "NORMA", media_urls: [VID], published_at: NOW.toISOString() },
    {
      creds: { ig: { userId: "U", token: "t" } },
      claim: () => Promise.resolve(true),
      save: (_i, p, patch) => (saves.push([p, patch]), Promise.resolve()),
      saveIgContainer: (_i, c) => (cont.push(c), Promise.resolve()),
      post: { ig: () => Promise.reject(new IgContainerPending("C5")), fb: () => Promise.resolve(""), tiktok: () => Promise.resolve("") },
      log: () => {},
    }, NOW, false);
  assertEquals(out[0], { platform: "ig", result: "pending", container_id: "C5" });
  assertEquals(cont, ["C5"]);
  assertEquals(saves[0], ["ig", { error: IG_PENDING }]);
});

Deno.test("resume: FINISHED publishes once and saves post id", async () => {
  const { d, saves, calls } = rd("FINISHED");
  assertEquals(await resumeIgRow(base(), d, NOW), { result: "posted", post_id: "IGP1" });
  assertEquals(calls, ["status:C1", "publish:C1"]);
  assertEquals(saves, [{ ig_post_id: "IGP1", ig_error: null }]);
});

Deno.test("resume: IN_PROGRESS stays pending, no writes", async () => {
  const { d, saves } = rd("IN_PROGRESS");
  assertEquals((await resumeIgRow(base(), d, NOW)).result, "pending");
  assertEquals(saves, []);
});

Deno.test("resume: lease lost -> no status/publish (no double post)", async () => {
  const { d, calls } = rd("FINISHED", false);
  assertEquals((await resumeIgRow(base(), d, NOW)).result, "skipped");
  assertEquals(calls, []);
});

Deno.test("resume: already posted / not pending -> skip", () => {
  assertEquals(planIgResume(base({ ig_post_id: "X" }), NOW).kind, "skip");
  assertEquals(planIgResume(base({ ig_error: "boom" }), NOW).kind, "skip");
});

Deno.test("resume: >2h -> timeout failure", async () => {
  const { d, saves, calls } = rd("IN_PROGRESS");
  const r = await resumeIgRow(base({ ig_container_created_at: "2026-10-31T13:50:00Z" }), d, NOW);
  assertEquals(r.result, "failed");
  assertEquals(calls, []);
  assertEquals(typeof saves[0].ig_error, "string");
});

Deno.test("resume: ERROR -> one fresh container, then final failure", async () => {
  const a = rd("ERROR");
  assertEquals(await resumeIgRow(base(), a.d, NOW), { result: "recreated", container_id: "C2" });
  assertEquals(a.saves[0].ig_container_retried, true);
  const b = rd("EXPIRED");
  assertEquals((await resumeIgRow(base({ ig_container_retried: true }), b.d, NOW)).result, "failed");
  assertEquals(b.calls.includes("create"), false);
});
