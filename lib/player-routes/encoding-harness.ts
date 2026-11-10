/**
 * DEVELOPMENT-ONLY StrymTV encoding candidates.
 *
 * These strings are hypotheses. They are not a device result, and production
 * handoff does not import this module. App and component source must not
 * import it (enforced by test). Calling a candidate does not open a URL and
 * does not assert that StrymTV decodes it.
 */

import { validateStreamUrl } from "./url-validation";

export const ENCODING_HARNESS_STATUS = "unverified_candidate" as const;

export interface EncodingCandidate {
  id: "raw-nested" | "percent-encoded" | "reserved-encoded";
  unverified: true;
  deviceVerified: false;
  launchUrl: string;
}

export type CandidateBuildResult =
  | { ok: true; candidates: EncodingCandidate[] }
  | { ok: false; reason: "invalid_stream" };

function reservedEncoded(url: string): string {
  const embedded = url
    .replace(/%/g, "%25")
    .replace(/\?/g, "%3F")
    .replace(/&/g, "%26")
    .replace(/#/g, "%23");
  return `strymtv://player/${embedded}`;
}

export function buildEncodingCandidates(streamUrl: string): CandidateBuildResult {
  const validated = validateStreamUrl(streamUrl);
  if (!validated.ok) return { ok: false, reason: "invalid_stream" };
  const url = validated.url;
  return {
    ok: true,
    candidates: [
      {
        id: "raw-nested",
        unverified: true,
        deviceVerified: false,
        launchUrl: `strymtv://player/${url}`,
      },
      {
        id: "percent-encoded",
        unverified: true,
        deviceVerified: false,
        launchUrl: `strymtv://player/${encodeURIComponent(url)}`,
      },
      {
        id: "reserved-encoded",
        unverified: true,
        deviceVerified: false,
        launchUrl: reservedEncoded(url),
      },
    ],
  };
}
