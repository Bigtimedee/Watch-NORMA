/**
 * StrymTV handoff. The shipped gate and contract block this before any launch
 * URL is built and before `open` is called.
 *
 * `handoffAccepted` means the injected opener resolved. For iOS that is
 * "the system accepted the URL", not playback, not the right video, and not
 * proof that StrymTV was the app that received it.
 */

import {
  contractUsable,
  productionHandoffPermitted,
  type EncodingEmbed,
  type EncodingGate,
  type VerifiedEncodingContract,
} from "./encoding-gate";
import { validateStreamUrl } from "./url-validation";

export type HandoffOutcome =
  | "blocked_unverified_encoding"
  | "handoff_accepted"
  | "handoff_rejected"
  | "invalid_stream";

export interface HandoffResult {
  outcome: HandoffOutcome;
  /** OS acceptance only. Never playback. */
  handoffAccepted: boolean;
}

export function embedStreamUrl(url: string, embed: EncodingEmbed): string {
  if (embed === "percent-encoded") return `strymtv://player/${encodeURIComponent(url)}`;
  if (embed === "raw-nested") return `strymtv://player/${url}`;
  throw new Error("unsupported encoding contract");
}

export async function attemptStrymTvHandoff(
  streamUrl: string,
  deps: {
    gate: EncodingGate;
    contract: VerifiedEncodingContract | null;
    platform: string;
    open: (launchUrl: string) => Promise<boolean>;
    /** Fresh remote decision immediately before a launch URL is built. */
    confirmAllowed?: () => Promise<boolean>;
  }
): Promise<HandoffResult> {
  if (!productionHandoffPermitted(deps.gate) || !contractUsable(deps.contract)) {
    return { outcome: "blocked_unverified_encoding", handoffAccepted: false };
  }
  const validated = validateStreamUrl(streamUrl);
  if (!validated.ok) return { outcome: "invalid_stream", handoffAccepted: false };
  if (deps.platform !== "ios") return { outcome: "handoff_rejected", handoffAccepted: false };
  if (deps.confirmAllowed) {
    let allowed = false;
    try {
      allowed = await deps.confirmAllowed();
    } catch {
      allowed = false;
    }
    if (!allowed) return { outcome: "handoff_rejected", handoffAccepted: false };
  }
  const launchUrl = embedStreamUrl(validated.url, deps.contract.embed);
  try {
    const accepted = await deps.open(launchUrl);
    return accepted
      ? { outcome: "handoff_accepted", handoffAccepted: true }
      : { outcome: "handoff_rejected", handoffAccepted: false };
  } catch {
    return { outcome: "handoff_rejected", handoffAccepted: false };
  }
}
