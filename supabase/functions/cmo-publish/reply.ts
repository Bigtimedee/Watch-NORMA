// =============================================================================
// cmo-publish self-reply (reply-bait question under the main tweet).
//
// Rules (chosen for safety; see migration 20261027200000):
// - Runs only AFTER the main tweet posted and markPublished succeeded.
// - Empty/whitespace reply_question -> no reply, no write.
// - reply_platform_post_id already set -> never re-reply (idempotent).
// - Contains a #hashtag or @mention -> SKIP the reply (do not strip: stripping
//   can leave a grammatically broken question on a public account).
// - Over 270 chars (X weighted length, URLs = 23) after trim -> SKIP (never
//   truncate mid-word).
// - Any error is caught and written to reply_error; the main row stays
//   'published' and the run result stays success.
// =============================================================================

import { X_TARGET_TWEET_LENGTH, tweetTextLength } from "./logic.ts";

export const REPLY_MAX_LENGTH = X_TARGET_TWEET_LENGTH; // 270

const HASHTAG_RE = /(^|[^\p{L}\p{N}_&])[#＃][\p{L}\p{N}_]/u;
const MENTION_RE = /(^|[^\p{L}\p{N}_])[@＠][A-Za-z0-9_]/u;

export type ReplyPlan =
  | { kind: "none" }
  | { kind: "already_replied" }
  | { kind: "skip"; reason: string }
  | { kind: "reply"; text: string; length: number };

export interface ReplyCandidate {
  reply_question?: string | null;
  reply_platform_post_id?: string | null;
}

export function planSelfReply(row: ReplyCandidate): ReplyPlan {
  const text = (row.reply_question ?? "").trim();
  if (!text) return { kind: "none" };
  if (row.reply_platform_post_id) return { kind: "already_replied" };
  if (HASHTAG_RE.test(text)) return { kind: "skip", reason: "reply_skipped: contains #hashtag" };
  if (MENTION_RE.test(text)) return { kind: "skip", reason: "reply_skipped: contains @mention" };
  const length = tweetTextLength(text);
  if (length > REPLY_MAX_LENGTH) {
    return { kind: "skip", reason: `reply_skipped: ${length} chars (max ${REPLY_MAX_LENGTH})` };
  }
  return { kind: "reply", text, length };
}

export interface SelfReplyDeps {
  postReply: (text: string, inReplyToTweetId: string) => Promise<{ tweetId: string }>;
  /** Store reply id only if none stored yet. Returns false if a reply id already existed. */
  saveReplyId: (postId: string, replyTweetId: string) => Promise<boolean>;
  saveReplyError: (postId: string, message: string) => Promise<void>;
  log?: (msg: string) => void;
}

export interface SelfReplyOutcome {
  kind: ReplyPlan["kind"] | "replied" | "error";
  reply_tweet_id?: string;
  detail?: string;
}

/** Never throws. */
export async function runSelfReply(
  row: ReplyCandidate & { id: string },
  mainTweetId: string,
  deps: SelfReplyDeps,
): Promise<SelfReplyOutcome> {
  const log = deps.log ?? ((m: string) => console.log(m));
  let plan: ReplyPlan;
  try {
    plan = planSelfReply(row);
  } catch (e) {
    plan = { kind: "skip", reason: `reply_skipped: ${String(e)}` };
  }
  if (plan.kind === "none" || plan.kind === "already_replied") return { kind: plan.kind };
  if (plan.kind === "skip") {
    log(`[cmo-publish] Post ${row.id} self-reply ${plan.reason}`);
    try {
      await deps.saveReplyError(row.id, plan.reason);
    } catch (_) { /* never surface */ }
    return { kind: "skip", detail: plan.reason };
  }
  try {
    const { tweetId } = await deps.postReply(plan.text, mainTweetId);
    try {
      await deps.saveReplyId(row.id, tweetId);
    } catch (saveErr) {
      const msg = `reply_posted_but_not_saved: ${tweetId}: ${errMsg(saveErr)}`;
      log(`[cmo-publish] Post ${row.id} ${msg}`);
      return { kind: "error", reply_tweet_id: tweetId, detail: msg };
    }
    log(`[cmo-publish] Post ${row.id} self-reply posted: ${tweetId}`);
    return { kind: "replied", reply_tweet_id: tweetId };
  } catch (e) {
    const msg = `reply_failed: ${errMsg(e)}`.slice(0, 500);
    log(`[cmo-publish] Post ${row.id} ${msg}`);
    try {
      await deps.saveReplyError(row.id, msg);
    } catch (_) { /* never surface */ }
    return { kind: "error", detail: msg };
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
