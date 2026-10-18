// =============================================================================
// cmo-publish/x-media.ts — X media upload (images: simple; video: chunked)
//
// Before 2026-10-18 the publisher only did a simple multipart upload to the
// v1.1 media endpoint, which is an image path: no media_category, no chunked
// INIT/APPEND/FINALIZE, no processing poll. A tweet_video uploaded that way
// is rejected / never processed, so .mp4 rows could not actually post.
//
// Video now uses the documented chunked flow against the same endpoint:
//   INIT     command=INIT, total_bytes, media_type, media_category=tweet_video
//   APPEND   command=APPEND, media_id, segment_index, media_data (base64), ...
//   FINALIZE command=FINALIZE, media_id
//   STATUS   command=STATUS, media_id   (polled while processing_info is
//                                        pending / in_progress)
// OAuth 1.0a signing stays in index.ts; this module receives a header builder
// so tests can drive the whole flow with a mocked fetch and never touch X.
// =============================================================================

import { isVideoMediaUrl } from "./logic.ts";

export const X_UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";

/** Chunk size for APPEND segments (before base64 expansion). */
export const VIDEO_SEGMENT_BYTES = 2 * 1024 * 1024;

/** Upper bound on STATUS polls so a stuck transcode cannot hang a run. */
export const MAX_PROCESSING_POLLS = 12;

export interface XCredentials {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

/** index.ts supplies this; bodyParams are the form fields to sign. */
export type BuildAuthHeader = (
  method: string,
  url: string,
  bodyParams: Record<string, string>,
) => Promise<string>;

export interface UploadDeps {
  fetchImpl?: typeof fetch;
  buildAuthHeader: BuildAuthHeader;
  segmentBytes?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

interface XUploadResponse {
  media_id_string?: string;
  media_id?: number | string;
  error?: string;
  errors?: Array<{ message?: string; code?: number }>;
  processing_info?: {
    state?: string;
    check_after_secs?: number;
    progress_percent?: number;
    error?: { message?: string; code?: number };
  };
}

function mediaIdOf(data: XUploadResponse): string | null {
  if (data.media_id_string) return data.media_id_string;
  if (data.media_id !== undefined && data.media_id !== null) {
    return String(data.media_id);
  }
  return null;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Segment byte-ranges for a chunked APPEND sequence. */
export function planVideoSegments(
  totalBytes: number,
  segmentBytes: number = VIDEO_SEGMENT_BYTES,
): Array<{ index: number; start: number; end: number }> {
  const size = Math.max(1, Math.floor(segmentBytes));
  const segments: Array<{ index: number; start: number; end: number }> = [];
  for (let start = 0, index = 0; start < totalBytes; start += size, index++) {
    segments.push({ index, start, end: Math.min(totalBytes, start + size) });
  }
  return segments;
}

function mimeFor(mediaUrl: string, contentType: string | null): string {
  const fromHeader = contentType?.split(";")[0].trim();
  if (fromHeader && fromHeader !== "application/octet-stream") return fromHeader;
  const lower = mediaUrl.toLowerCase();
  if (lower.includes(".mov")) return "video/quicktime";
  if (lower.includes(".m4v")) return "video/mp4";
  if (lower.includes(".mp4")) return "video/mp4";
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".webp")) return "image/webp";
  if (lower.includes(".gif")) return "image/gif";
  return "image/jpeg";
}

async function parseUploadResponse(
  res: Response,
  log: (m: string) => void,
  step: string,
): Promise<XUploadResponse | null> {
  const text = await res.text();
  let data: XUploadResponse;
  try {
    data = JSON.parse(text) as XUploadResponse;
  } catch {
    log(`Media upload ${step} returned non-JSON (status ${res.status}): ${text.slice(0, 200)}`);
    return null;
  }
  if (!res.ok) {
    log(`Media upload ${step} failed (status ${res.status}): ${text.slice(0, 200)}`);
    return null;
  }
  return data;
}

async function postForm(
  deps: Required<Pick<UploadDeps, "fetchImpl" | "buildAuthHeader">>,
  params: Record<string, string>,
): Promise<Response> {
  const authHeader = await deps.buildAuthHeader("POST", X_UPLOAD_URL, params);
  return deps.fetchImpl(X_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "NORMA-CMO-Bot/1.0",
    },
    body: new URLSearchParams(params).toString(),
  });
}

async function uploadVideoChunked(
  bytes: Uint8Array,
  mimeType: string,
  deps: Required<Pick<UploadDeps, "fetchImpl" | "buildAuthHeader">> & UploadDeps,
  log: (m: string) => void,
): Promise<string | null> {
  const segmentBytes = deps.segmentBytes ?? VIDEO_SEGMENT_BYTES;
  const sleep = deps.sleep ??
    ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  // INIT
  const init = await parseUploadResponse(
    await postForm(deps, {
      command: "INIT",
      total_bytes: String(bytes.byteLength),
      media_type: mimeType,
      media_category: "tweet_video",
    }),
    log,
    "INIT",
  );
  const mediaId = init && mediaIdOf(init);
  if (!mediaId) {
    log("Media upload INIT returned no media_id.");
    return null;
  }

  // APPEND (base64 media_data, one call per segment)
  for (const seg of planVideoSegments(bytes.byteLength, segmentBytes)) {
    const res = await postForm(deps, {
      command: "APPEND",
      media_id: mediaId,
      segment_index: String(seg.index),
      media_data: bytesToBase64(bytes.subarray(seg.start, seg.end)),
    });
    // APPEND success is 204 No Content with an empty body on the v1.1 API.
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log(`Media upload APPEND ${seg.index} failed (status ${res.status}): ${text.slice(0, 200)}`);
      return null;
    }
    await res.text().catch(() => "");
  }

  // FINALIZE
  const finalized = await parseUploadResponse(
    await postForm(deps, { command: "FINALIZE", media_id: mediaId }),
    log,
    "FINALIZE",
  );
  if (!finalized) return null;

  // STATUS poll while X transcodes the video.
  let info = finalized.processing_info;
  for (let poll = 0; info && poll < MAX_PROCESSING_POLLS; poll++) {
    const state = (info.state ?? "").toLowerCase();
    if (state === "succeeded") return mediaId;
    if (state === "failed") {
      log(`Media processing failed for ${mediaId}: ${info.error?.message ?? "unknown"}`);
      return null;
    }
    const waitMs = Math.min((info.check_after_secs ?? 1) * 1000, 10_000);
    await sleep(waitMs);
    const params = { command: "STATUS", media_id: mediaId };
    const authHeader = await deps.buildAuthHeader("GET", X_UPLOAD_URL, params);
    const statusRes = await deps.fetchImpl(
      `${X_UPLOAD_URL}?${new URLSearchParams(params).toString()}`,
      {
        method: "GET",
        headers: { Authorization: authHeader, "User-Agent": "NORMA-CMO-Bot/1.0" },
      },
    );
    const status = await parseUploadResponse(statusRes, log, "STATUS");
    if (!status) return null;
    info = status.processing_info;
    if (!info) return mediaId; // No processing block: ready to tweet.
  }
  if (info && (info.state ?? "").toLowerCase() === "succeeded") return mediaId;
  if (!info) return mediaId;
  log(`Media processing did not finish for ${mediaId} after ${MAX_PROCESSING_POLLS} polls.`);
  return null;
}

/**
 * Upload one medium (image or video) and return its media_id, or null on any
 * failure. Callers must hold the row on null — never fall back to text-only.
 */
export async function uploadMediaToX(
  mediaUrl: string,
  _credentials: XCredentials,
  deps: UploadDeps,
): Promise<string | null> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const log = deps.log ?? ((m: string) => console.warn(`[cmo-publish] ${m}`));
  try {
    const source = await fetchImpl(mediaUrl);
    if (!source.ok) {
      log(`Failed to fetch media for upload (status ${source.status}): ${mediaUrl}`);
      return null;
    }
    const bytes = new Uint8Array(await source.arrayBuffer());
    const mimeType = mimeFor(mediaUrl, source.headers.get("content-type"));
    const isVideo = isVideoMediaUrl(mediaUrl) || mimeType.startsWith("video/");

    if (isVideo) {
      return await uploadVideoChunked(
        bytes,
        mimeType,
        { ...deps, fetchImpl, buildAuthHeader: deps.buildAuthHeader },
        log,
      );
    }

    // Images keep the original simple multipart upload.
    const boundary = `NORMABoundary${Date.now()}`;
    const encoder = new TextEncoder();
    const preamble = encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="media"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    );
    const epilogue = encoder.encode(`\r\n--${boundary}--\r\n`);
    const multipartBody = new Uint8Array(
      preamble.byteLength + bytes.byteLength + epilogue.byteLength,
    );
    multipartBody.set(preamble, 0);
    multipartBody.set(bytes, preamble.byteLength);
    multipartBody.set(epilogue, preamble.byteLength + bytes.byteLength);

    const authHeader = await deps.buildAuthHeader("POST", X_UPLOAD_URL, {});
    const uploadResponse = await fetchImpl(X_UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "User-Agent": "NORMA-CMO-Bot/1.0",
      },
      body: multipartBody,
    });
    const data = await parseUploadResponse(uploadResponse, log, "simple");
    const mediaId = data && mediaIdOf(data);
    if (!mediaId) {
      log(`Media upload returned no media_id for ${mediaUrl}`);
      return null;
    }
    return mediaId;
  } catch (err) {
    log(`Media upload threw: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
