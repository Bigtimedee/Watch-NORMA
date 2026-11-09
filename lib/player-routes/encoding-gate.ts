/**
 * Production StrymTV handoff stays blocked until a real iPhone records an
 * encoding contract. This object is the gate. Comments alone do not block
 * `attemptStrymTvHandoff`; `productionHandoffPermitted` does.
 *
 * Linux unit tests are not an iPhone or StrymTV trial and cannot open this gate.
 */

export interface EncodingGate {
  status: "blocked" | "open";
  verified: boolean;
  contractId: string | null;
  blockedReason: string;
}

export const STRYMTV_ENCODING_GATE: EncodingGate = {
  status: "blocked",
  verified: false,
  contractId: null,
  blockedReason:
    "No iPhone and StrymTV encoding trial is recorded. Unit tests on Linux do not open the scheme and are not playback evidence.",
};

export type EncodingEmbed = "percent-encoded" | "raw-nested";

export interface VerifiedEncodingContract {
  id: string;
  embed: EncodingEmbed;
  deviceVerified: boolean;
}

/** No verified contract ships with this revision. */
export const SHIPPED_STRYMTV_CONTRACT: VerifiedEncodingContract | null = null;

export function productionHandoffPermitted(gate: EncodingGate): boolean {
  return (
    gate.status === "open" &&
    gate.verified === true &&
    typeof gate.contractId === "string" &&
    gate.contractId.length > 0
  );
}

export function contractUsable(contract: VerifiedEncodingContract | null): contract is VerifiedEncodingContract {
  return (
    contract != null &&
    contract.deviceVerified === true &&
    (contract.embed === "percent-encoded" || contract.embed === "raw-nested") &&
    contract.id.length > 0
  );
}
