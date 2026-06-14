// Pure classification logic — no side effects, no network, no DB.
// Imported by both index.ts (server) and the test file.

// ---------------------------------------------------------------------------
// Path classification rules
// ---------------------------------------------------------------------------

// Path fragments that indicate a marketing/sign-up page (not a watch destination).
// Match is checked against the final URL pathname (lowercased), both as prefix and contains.
// Extend this list when new marketing path patterns are discovered.
export const SUSPECT_PATH_FRAGMENTS = [
  "/welcome",
  "/signup",
  "/sign-up",
  "/register",
  "/get-started",
  "/start",
  "/join",
  "/subscribe",
  "/pricing",
  "/plans",
  "/try",
  "/free-trial",
  "/freetrial",
  "/upsell",
  "/upgrade",
  "/onboarding",
] as const;

// Path fragments that confirm a valid watch/player destination.
// These take precedence over SUSPECT_PATH_FRAGMENTS if both would match.
export const OK_PATH_FRAGMENTS = [
  "/watch",
  "/player",
  "/live",
  "/stream",
  "/login",
  "/signin",
  "/sign-in",
  "/account",
  "/home",
  "/browse",
  "/sports",
  "/channels",
] as const;

export type LinkStatus = "ok" | "suspect" | "broken";

export interface ClassifyResult {
  status: LinkStatus;
  finalUrl: string;
  httpStatus: number | null;
  reason: string;
}

export function classifyUrl(
  finalUrl: string,
  httpStatus: number | null,
  fetchError?: string,
): ClassifyResult {
  if (fetchError || httpStatus === null || httpStatus >= 400) {
    return {
      status: "broken",
      finalUrl,
      httpStatus,
      reason: fetchError ?? `HTTP ${httpStatus}`,
    };
  }

  let pathname = "";
  try {
    pathname = new URL(finalUrl).pathname.toLowerCase();
  } catch {
    return { status: "broken", finalUrl, httpStatus, reason: "invalid final URL" };
  }

  // Explicit ok-path check takes precedence over suspect
  if (OK_PATH_FRAGMENTS.some((frag) => pathname.startsWith(frag) || pathname.includes(frag))) {
    return { status: "ok", finalUrl, httpStatus, reason: "watch/login path confirmed" };
  }

  // Marketing/sign-up path → suspect
  if (SUSPECT_PATH_FRAGMENTS.some((frag) => pathname.startsWith(frag) || pathname.includes(frag))) {
    return {
      status: "suspect",
      finalUrl,
      httpStatus,
      reason: `marketing path detected: ${pathname}`,
    };
  }

  // Root path with 200 → ok (most streaming homepages serve the app from "/")
  if ((pathname === "/" || pathname === "") && httpStatus === 200) {
    return { status: "ok", finalUrl, httpStatus, reason: "root path with 200" };
  }

  // Any other 2xx → ok
  if (httpStatus >= 200 && httpStatus < 300) {
    return { status: "ok", finalUrl, httpStatus, reason: `HTTP ${httpStatus}` };
  }

  return { status: "broken", finalUrl, httpStatus, reason: `HTTP ${httpStatus}` };
}
