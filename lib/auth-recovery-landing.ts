/**
 * Web admin / advertiser password-recovery landing.
 *
 * HARD RULE: hosted Auth `site_url` and web `resetPasswordForEmail` redirectTo
 * must NEVER be the marketing homepage (`https://getnorma.app/` or
 * `https://www.getnorma.app/`). Recovery verify must land on
 * `/auth/reset-password`. Mobile recovery stays on `norma://auth-callback`.
 *
 * Incident 2026-09-19: after PR #43 made the email CTA clickable, GoTrue still
 * redirected to site_url `https://getnorma.app` (and www was not allowlisted),
 * so users saw `/?error=access_denied&error_code=otp_expired` on the marketing
 * home with no set-password form.
 */

export const WEB_RECOVERY_PATH = "/auth/reset-password";
export const WEB_FORGOT_PASSWORD_PATH = "/auth/forgot-password";
export const WEB_AUTH_CALLBACK_PATH = "/auth/callback";

export const EXPIRED_RESET_HEADLINE = "This reset link expired or was already used";
export const EXPIRED_RESET_COPY =
  "This reset link expired or was already used — request a new one";

/** Apex + www. Production apex 307s to www; both must be allowlisted. */
export const WEB_AUTH_ORIGINS = [
  "https://getnorma.app",
  "https://www.getnorma.app",
] as const;

export const PRODUCTION_SITE_URL = `${WEB_AUTH_ORIGINS[0]}${WEB_RECOVERY_PATH}`;

export const FORBIDDEN_SITE_URLS = [
  "https://getnorma.app",
  "https://getnorma.app/",
  "https://www.getnorma.app",
  "https://www.getnorma.app/",
] as const;

export const MOBILE_RECOVERY_REDIRECTS = [
  "norma://",
  "norma://auth-callback",
  "exp://",
] as const;

export const REQUIRED_WEB_RECOVERY_REDIRECTS = [
  "https://getnorma.app/auth/reset-password",
  "https://getnorma.app/auth/callback",
  "https://getnorma.app/auth/callback?next=/auth/reset-password",
  "https://www.getnorma.app/auth/reset-password",
  "https://www.getnorma.app/auth/callback",
  "https://www.getnorma.app/auth/callback?next=/auth/reset-password",
] as const;

export type RecoveryUrlParams = {
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  type: string | null;
};

function readMergedParams(url: string): URLSearchParams {
  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  const hashPart = hashIndex >= 0 ? url.slice(hashIndex + 1) : "";
  const queryPart =
    queryIndex >= 0
      ? url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined)
      : "";

  const merged = new URLSearchParams(queryPart);
  const hashParams = new URLSearchParams(hashPart);
  hashParams.forEach((value, key) => {
    merged.set(key, value);
  });
  return merged;
}

export function parseRecoveryParams(url: string): RecoveryUrlParams {
  const merged = readMergedParams(url);
  return {
    error: merged.get("error"),
    errorCode: merged.get("error_code"),
    errorDescription: merged.get("error_description"),
    code: merged.get("code"),
    accessToken: merged.get("access_token"),
    refreshToken: merged.get("refresh_token"),
    type: merged.get("type"),
  };
}

export function isExpiredRecoveryError(params: RecoveryUrlParams): boolean {
  const code = (params.errorCode || "").toLowerCase();
  const err = (params.error || "").toLowerCase();
  const desc = decodeURIComponent(params.errorDescription || "").toLowerCase();
  return (
    code === "otp_expired" ||
    code === "otp_disabled" ||
    err === "access_denied" ||
    desc.includes("invalid or has expired") ||
    desc.includes("email link is invalid")
  );
}

export function isAuthRecoveryPayload(params: RecoveryUrlParams): boolean {
  if (isExpiredRecoveryError(params)) return true;
  if (params.type === "recovery") return true;
  if (params.accessToken && params.refreshToken) return true;
  if (params.code && params.code.length >= 16) return true;
  return false;
}

export function isBareMarketingHome(pathname: string): boolean {
  return pathname === "/" || pathname === "";
}

/**
 * Same-origin reset URL (no query). Query strings on redirectTo are often
 * rejected by GoTrue allowlist matching, which silently falls back to site_url.
 */
export function getWebRecoveryRedirectTo(origin: string): string {
  const normalized = origin.replace(/\/$/, "");
  return `${normalized}${WEB_RECOVERY_PATH}`;
}

export function isForbiddenSiteUrl(siteUrl: string): boolean {
  const trimmed = siteUrl.trim().replace(/\/$/, "");
  return FORBIDDEN_SITE_URLS.some(
    (forbidden) => forbidden.replace(/\/$/, "") === trimmed
  );
}

export function rewriteAuthDumpToResetPath(href: string): string {
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    parsed = new URL(href, "https://getnorma.app");
  }
  parsed.pathname = WEB_RECOVERY_PATH;
  return parsed.toString();
}

/**
 * Marketing `/` (or any non-reset path) that received a GoTrue recovery dump
 * must be rewritten to `/auth/reset-password`, never left on the homepage.
 */
export function shouldRouteToResetPassword(
  href: string,
  pathname: string
): boolean {
  if (pathname === WEB_RECOVERY_PATH) return false;
  if (pathname === WEB_AUTH_CALLBACK_PATH) return false;
  const params = parseRecoveryParams(href);
  if (isExpiredRecoveryError(params)) return true;
  if (params.type === "recovery") return true;
  if (params.accessToken && params.refreshToken) return true;
  if (params.code && params.code.length >= 16) {
    return isBareMarketingHome(pathname) || pathname === "/admin";
  }
  return false;
}

export function postResetDestination(isAdmin: boolean): string {
  return isAdmin ? "/admin" : "/dashboard";
}
