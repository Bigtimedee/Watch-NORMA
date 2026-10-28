import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { REPLY_MAX_LENGTH, planSelfReply, runSelfReply, type SelfReplyDeps } from "./reply.ts";

function mockDeps(opts: { postFails?: boolean; saveFails?: boolean } = {}) {
  const calls = { posts: [] as Array<[string, string]>, ids: [] as string[], errors: [] as string[] };
  const deps: SelfReplyDeps = {
    postReply: (text, inReplyTo) => {
      calls.posts.push([text, inReplyTo]);
      if (opts.postFails) return Promise.reject(new Error("Twitter API error 403: nope"));
      return Promise.resolve({ tweetId: "999" });
    },
    saveReplyId: (_id, rid) => {
      if (opts.saveFails) return Promise.reject(new Error("db down"));
      calls.ids.push(rid);
      return Promise.resolve(true);
    },
    saveReplyError: (_id, m) => {
      calls.errors.push(m);
      return Promise.resolve();
    },
    log: () => {},
  };
  return { deps, calls };
}

Deno.test("plan: empty / whitespace / null -> none", () => {
  assertEquals(planSelfReply({ reply_question: null }).kind, "none");
  assertEquals(planSelfReply({ reply_question: "   " }).kind, "none");
  assertEquals(planSelfReply({}).kind, "none");
});

Deno.test("plan: trims and replies", () => {
  const p = planSelfReply({ reply_question: "  Who wins tonight?  " });
  assertEquals(p, { kind: "reply", text: "Who wins tonight?", length: 17 });
});

Deno.test("plan: already replied -> idempotent", () => {
  assertEquals(planSelfReply({ reply_question: "Q?", reply_platform_post_id: "1" }).kind, "already_replied");
});

Deno.test("plan: hashtag / mention -> skip (not stripped)", () => {
  assertEquals(planSelfReply({ reply_question: "Who wins? #TNF" }).kind, "skip");
  assertEquals(planSelfReply({ reply_question: "Ask @NFL who wins" }).kind, "skip");
  assertEquals(planSelfReply({ reply_question: "＃TNF?" }).kind, "skip");
  // not hashtags/mentions
  assertEquals(planSelfReply({ reply_question: "Who's #1? no" }).kind, "skip");
  assertEquals(planSelfReply({ reply_question: "Email a@b? 3rd & 4?" }).kind, "reply");
  assertEquals(planSelfReply({ reply_question: "Better: 4th-and-1 go or punt?" }).kind, "reply");
});

Deno.test("plan: 270 ok, 271 skipped (never truncated)", () => {
  assertEquals(planSelfReply({ reply_question: "a".repeat(REPLY_MAX_LENGTH) }).kind, "reply");
  const p = planSelfReply({ reply_question: "a".repeat(REPLY_MAX_LENGTH + 1) });
  assertEquals(p.kind, "skip");
});

Deno.test("run: posts in_reply_to main tweet and stores id", async () => {
  const { deps, calls } = mockDeps();
  const o = await runSelfReply({ id: "r1", reply_question: "Who wins?" }, "123", deps);
  assertEquals(o, { kind: "replied", reply_tweet_id: "999" });
  assertEquals(calls.posts, [["Who wins?", "123"]]);
  assertEquals(calls.ids, ["999"]);
});

Deno.test("run: no question -> no X call, no DB write", async () => {
  const { deps, calls } = mockDeps();
  assertEquals((await runSelfReply({ id: "r1" }, "123", deps)).kind, "none");
  assertEquals(calls.posts.length + calls.ids.length + calls.errors.length, 0);
});

Deno.test("run: already replied -> no X call", async () => {
  const { deps, calls } = mockDeps();
  const o = await runSelfReply({ id: "r1", reply_question: "Q?", reply_platform_post_id: "5" }, "123", deps);
  assertEquals(o.kind, "already_replied");
  assertEquals(calls.posts.length, 0);
});

Deno.test("run: skip records reason, no X call", async () => {
  const { deps, calls } = mockDeps();
  const o = await runSelfReply({ id: "r1", reply_question: "Who? #x" }, "123", deps);
  assertEquals(o.kind, "skip");
  assertEquals(calls.posts.length, 0);
  assert(calls.errors[0].startsWith("reply_skipped"));
});

Deno.test("run: X failure never throws, logs reply_error", async () => {
  const { deps, calls } = mockDeps({ postFails: true });
  const o = await runSelfReply({ id: "r1", reply_question: "Q?" }, "123", deps);
  assertEquals(o.kind, "error");
  assert(calls.errors[0].startsWith("reply_failed"));
});

Deno.test("run: even saveReplyError failing does not throw", async () => {
  const { deps } = mockDeps({ postFails: true });
  deps.saveReplyError = () => Promise.reject(new Error("db"));
  assertEquals((await runSelfReply({ id: "r1", reply_question: "Q?" }, "1", deps)).kind, "error");
});

Deno.test("run: save-id failure reports posted id, does not throw", async () => {
  const { deps } = mockDeps({ saveFails: true });
  const o = await runSelfReply({ id: "r1", reply_question: "Q?" }, "1", deps);
  assertEquals(o.kind, "error");
  assertEquals(o.reply_tweet_id, "999");
});
