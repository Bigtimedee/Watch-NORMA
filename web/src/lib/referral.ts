import { createHash } from "crypto";

export const REF_COOKIE = "norma_ref";
export const REF_CODE_RE = /^[A-Za-z0-9_-]{4,32}$/;

export function hashPart(v: string | null | undefined): string | null {
  if (!v) return null;
  return createHash("sha256").update(`norma-ref-v1:${v}`).digest("hex").slice(0, 32);
}

/** First hop of x-forwarded-for (Vercel sets it), else x-real-ip. */
export function clientIp(h: Headers): string | null {
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return h.get("x-real-ip");
}
