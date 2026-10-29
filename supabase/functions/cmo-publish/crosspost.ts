// =============================================================================
// cmo-publish cross-post: after a content_calendar X video row is published,
// also post the same video to Instagram Reels, the Facebook Page and TikTok
// (Direct Post). Dave hard rule 2026-10-29: every NORMA social video goes to
// X + IG + FB + TikTok, no third-party scheduler.
//
// Contract:
// - Runs as a sweep AFTER the X loop, on rows already status='published'.
//   It never reads or writes status/platform_post_id, so it can never block,
//   fail or roll back the X post.
// - Each platform is independent: own claim column (<p>_attempted_at), own
//   post id, own error. A throw on one platform is caught and recorded.
// - Idempotent: a platform is claimed with
//   UPDATE ... SET <p>_attempted_at=now WHERE <p>_attempted_at IS NULL AND
//   <p>_post_id IS NULL. Only the winner posts; there is no auto-retry after
//   a claimed attempt (clear <p>_attempted_at + <p>_error to retry by hand).
// - Missing credentials: <p>_error='not_configured', no claim, no network.
//   Once secrets are set, rows still inside the window get posted.
// - Guards: video only, NORMA in caps, per-platform caption length, no
//   @-mentions. Guard failures record '<reason>' and claim (no retry).
// =============================================================================

import { isVideoMediaUrl } from "./logic.ts";

export const CROSSPOST_PLATFORMS = ["ig", "fb", "tiktok"] as const;
export type CrossPlatform = typeof CROSSPOST_PLATFORMS[number];

/** Only cross-post rows the X loop published within this window. */
export const CROSSPOST_WINDOW_MS = 6 * 60 * 60 * 1000;

export const CAPTION_MAX: Record<CrossPlatform, number> = {
  ig: 2200, // IG caption limit
  fb: 5000, // FB video description, conservative
  tiktok: 2200, // TikTok title (Direct Post) limit, in UTF-16 runes
};

export const NOT_CONFIGURED = "not_configured";

export const META_GRAPH = "https://graph.facebook.com/v21.0";
export const TIKTOK_API = "https://open.tiktokapis.com/v2";

export interface CrossRow {
  id: string;
  platform: string;
  status: string;
  body: string;
  hashtags?: string[] | null;
  media_urls: string[] | null;
  published_at: string | null;
  ig_post_id?: string | null;
  ig_error?: string | null;
  ig_attempted_at?: string | null;
  fb_post_id?: string | null;
  fb_error?: string | null;
  fb_attempted_at?: string | null;
  tiktok_post_id?: string | null;
  tiktok_error?: string | null;
  tiktok_attempted_at?: string | null;
}

export interface CrossCreds {
  ig?: { userId: string; token: string };
  fb?: { pageId: string; token: string };
  tiktok?: { token: string; privacyLevel: string };
}

export function readCrossCreds(env: (k: string) => string | undefined): CrossCreds {
  const v = (k: string) => env(k)?.replace(/\s+/g, "") || undefined;
  const creds: CrossCreds = {};
  const igUser = v("META_INSTAGRAM_USER_ID");
  const igTok = v("META_INSTAGRAM_ACCESS_TOKEN");
  if (igUser && igTok) creds.ig = { userId: igUser, token: igTok };
  const page = v("META_FACEBOOK_PAGE_ID");
  const pageTok = v("META_FACEBOOK_PAGE_ACCESS_TOKEN");
  if (page && pageTok) creds.fb = { pageId: page, token: pageTok };
  const tt = v("TIKTOK_ACCESS_TOKEN");
  // Unaudited TikTok apps may only post SELF_ONLY; set PUBLIC_TO_EVERYONE
  // after the app passes TikTok's Direct Post audit.
  if (tt) creds.tiktok = { token: tt, privacyLevel: v("TIKTOK_PRIVACY_LEVEL") ?? "SELF_ONLY" };
  return creds;
}

/** Caption = body + hashtags (X body is the source of truth). */
export function composeCaption(row: Pick<CrossRow, "body" | "hashtags">): string {
  const tags = (row.hashtags ?? [])
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`));
  const body = (row.body ?? "").trim();
  const missing = tags.filter((t) => !body.toLowerCase().includes(t.toLowerCase()));
  return missing.length ? `${body}\n\n${missing.join(" ")}` : body;
}

const MENTION_RE = /(^|[^\w.@/])@[A-Za-z0-9_.]{1,30}/;
/** Brand word must be 'NORMA'; 'Norma'/'norma' as a standalone word is blocked. getnorma.app / watchNORMA are fine. */
const BAD_BRAND_RE = /\bnorma\b/gi;

export type CrossPlan =
  | { kind: "post"; caption: string; videoUrl: string }
  | { kind: "skip"; reason: string; claim: boolean }
  | { kind: "done" };

export function planCrossPost(
  row: CrossRow,
  platform: CrossPlatform,
  creds: CrossCreds,
  now: Date,
): CrossPlan {
  if (row[`${platform}_post_id`]) return { kind: "done" };
  if (row[`${platform}_attempted_at`]) return { kind: "done" };
  if (row.status !== "published" || row.platform !== "twitter") {
    return { kind: "skip", reason: "not_published_on_x", claim: false };
  }
  if (!row.published_at || now.getTime() - Date.parse(row.published_at) > CROSSPOST_WINDOW_MS) {
    return { kind: "skip", reason: "outside_window", claim: false };
  }
  const videoUrl = (row.media_urls ?? []).find((u) => isVideoMediaUrl(u));
  if (!videoUrl) return { kind: "skip", reason: "no_video", claim: false };
  if (!creds[platform]) return { kind: "skip", reason: NOT_CONFIGURED, claim: false };
  const caption = composeCaption(row);
  if (!caption) return { kind: "skip", reason: "empty_caption", claim: true };
  if (MENTION_RE.test(caption)) return { kind: "skip", reason: "mention_blocked", claim: true };
  for (const m of caption.matchAll(BAD_BRAND_RE)) {
    if (m[0] !== "NORMA") return { kind: "skip", reason: "brand_case: NORMA must be caps", claim: true };
  }
  if (caption.length > CAPTION_MAX[platform]) {
    return { kind: "skip", reason: `over_length: ${caption.length} > ${CAPTION_MAX[platform]}`, claim: true };
  }
  return { kind: "post", caption, videoUrl };
}

// ---------------------------------------------------------------------------
// Platform clients (fetch injected for tests)
// ---------------------------------------------------------------------------

type Fetch = typeof fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function json(res: Response, what: string): Promise<Record<string, unknown>> {
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch { /* non-json */ }
  if (!res.ok) {
    const err = (data.error as { message?: string })?.message ?? text.slice(0, 200);
    throw new Error(`${what} ${res.status}: ${err}`);
  }
  return data;
}

export interface ClientOpts {
  fetch?: Fetch;
  sleep?: (ms: number) => Promise<void>;
  pollMs?: number;
  maxPolls?: number;
}

/** Instagram Reels: container (video_url) -> poll FINISHED -> media_publish. */
export async function postInstagramReel(
  c: NonNullable<CrossCreds["ig"]>,
  videoUrl: string,
  caption: string,
  o: ClientOpts = {},
): Promise<string> {
  const f = o.fetch ?? fetch;
  const wait = o.sleep ?? sleep;
  const create = await json(
    await f(`${META_GRAPH}/${c.userId}/media`, {
      method: "POST",
      body: new URLSearchParams({
        media_type: "REELS",
        video_url: videoUrl,
        caption,
        share_to_feed: "true",
        access_token: c.token,
      }),
    }),
    "ig container",
  );
  const containerId = String(create.id ?? "");
  if (!containerId) throw new Error("ig container: no id");
  const max = o.maxPolls ?? 15;
  for (let i = 0; i < max; i++) {
    const st = await json(
      await f(`${META_GRAPH}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(c.token)}`),
      "ig status",
    );
    if (st.status_code === "FINISHED") {
      const pub = await json(
        await f(`${META_GRAPH}/${c.userId}/media_publish`, {
          method: "POST",
          body: new URLSearchParams({ creation_id: containerId, access_token: c.token }),
        }),
        "ig publish",
      );
      if (!pub.id) throw new Error("ig publish: no id");
      return String(pub.id);
    }
    if (st.status_code === "ERROR" || st.status_code === "EXPIRED") {
      throw new Error(`ig container ${st.status_code}: ${st.status ?? ""}`);
    }
    await wait(o.pollMs ?? 4000);
  }
  throw new Error(`ig container ${containerId} not FINISHED after ${max} polls`);
}

/** Facebook Page video via file_url (Graph fetches the public Storage URL). */
export async function postFacebookVideo(
  c: NonNullable<CrossCreds["fb"]>,
  videoUrl: string,
  caption: string,
  o: ClientOpts = {},
): Promise<string> {
  const f = o.fetch ?? fetch;
  const res = await json(
    await f(`${META_GRAPH}/${c.pageId}/videos`, {
      method: "POST",
      body: new URLSearchParams({
        file_url: videoUrl,
        description: caption,
        published: "true",
        access_token: c.token,
      }),
    }),
    "fb video",
  );
  if (!res.id) throw new Error("fb video: no id");
  return String(res.id);
}

/**
 * TikTok Content Posting API, Direct Post, FILE_UPLOAD (PULL_FROM_URL needs a
 * verified URL prefix and *.supabase.co cannot be verified). Returns publish_id.
 */
export async function postTikTokVideo(
  c: NonNullable<CrossCreds["tiktok"]>,
  videoUrl: string,
  caption: string,
  o: ClientOpts = {},
): Promise<string> {
  const f = o.fetch ?? fetch;
  const auth = { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json; charset=UTF-8" };
  const info = await json(
    await f(`${TIKTOK_API}/post/publish/creator_info/query/`, { method: "POST", headers: auth }),
    "tiktok creator_info",
  );
  const opts = ((info.data as { privacy_level_options?: string[] })?.privacy_level_options) ?? [];
  if (opts.length && !opts.includes(c.privacyLevel)) {
    throw new Error(`tiktok privacy_level ${c.privacyLevel} not allowed (options: ${opts.join(",")})`);
  }
  const vid = await f(videoUrl);
  if (!vid.ok) throw new Error(`tiktok video download ${vid.status}`);
  const bytes = new Uint8Array(await vid.arrayBuffer());
  const size = bytes.byteLength;
  // Single chunk up to 64MB (TikTok allows whole-file upload when < 64MB).
  if (size > 64 * 1024 * 1024) throw new Error(`tiktok video ${size} bytes > 64MB single-chunk limit`);
  const init = await json(
    await f(`${TIKTOK_API}/post/publish/video/init/`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        post_info: {
          title: caption,
          privacy_level: c.privacyLevel,
          disable_comment: false,
          disable_duet: false,
          disable_stitch: false,
        },
        source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: size, total_chunk_count: 1 },
      }),
    }),
    "tiktok init",
  );
  const d = init.data as { publish_id?: string; upload_url?: string } | undefined;
  if (!d?.publish_id || !d.upload_url) throw new Error("tiktok init: missing publish_id/upload_url");
  const put = await f(d.upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Content-Range": `bytes 0-${size - 1}/${size}`,
    },
    body: bytes,
  });
  if (!put.ok) throw new Error(`tiktok upload ${put.status}`);
  return d.publish_id;
}

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

export interface CrossDeps {
  creds: CrossCreds;
  /** Atomic claim; true only for the winner. */
  claim: (rowId: string, p: CrossPlatform) => Promise<boolean>;
  save: (rowId: string, p: CrossPlatform, patch: { post_id?: string | null; error?: string | null }) => Promise<void>;
  post: Record<CrossPlatform, (videoUrl: string, caption: string) => Promise<string>>;
  log?: (m: string) => void;
}

export type CrossOutcome =
  | { platform: CrossPlatform; result: "posted"; post_id: string }
  | { platform: CrossPlatform; result: "skipped"; reason: string }
  | { platform: CrossPlatform; result: "failed"; error: string }
  | { platform: CrossPlatform; result: "would_post"; caption_length: number }
  | { platform: CrossPlatform; result: "done" };

export async function crossPostRow(
  row: CrossRow,
  deps: CrossDeps,
  now: Date,
  dryRun: boolean,
): Promise<CrossOutcome[]> {
  const log = deps.log ?? console.log;
  const out: CrossOutcome[] = [];
  for (const p of CROSSPOST_PLATFORMS) {
    try {
      const plan = planCrossPost(row, p, deps.creds, now);
      if (plan.kind === "done") {
        out.push({ platform: p, result: "done" });
        continue;
      }
      if (plan.kind === "skip") {
        out.push({ platform: p, result: "skipped", reason: plan.reason });
        if (dryRun) continue;
        if (plan.claim) {
          if (await deps.claim(row.id, p)) await deps.save(row.id, p, { error: plan.reason });
        } else if (plan.reason === NOT_CONFIGURED && row[`${p}_error`] !== NOT_CONFIGURED) {
          await deps.save(row.id, p, { error: NOT_CONFIGURED });
        }
        continue;
      }
      if (dryRun) {
        out.push({ platform: p, result: "would_post", caption_length: plan.caption.length });
        continue;
      }
      if (!(await deps.claim(row.id, p))) {
        out.push({ platform: p, result: "skipped", reason: "claimed_elsewhere" });
        continue;
      }
      try {
        const id = await deps.post[p](plan.videoUrl, plan.caption);
        await deps.save(row.id, p, { post_id: id, error: null });
        log(`[cmo-publish] crosspost ${p} row ${row.id} -> ${id}`);
        out.push({ platform: p, result: "posted", post_id: id });
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
        log(`[cmo-publish] crosspost ${p} row ${row.id} failed: ${msg}`);
        await deps.save(row.id, p, { error: msg }).catch(() => {});
        out.push({ platform: p, result: "failed", error: msg });
      }
    } catch (e) {
      // Never let one platform (or a DB hiccup) affect the others or X.
      out.push({ platform: p, result: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
