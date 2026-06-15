// NORMA Advertising — Conversion Ingestor Interface (P2-08)
// Server-to-server partner callback contract for upgrading inferred → verified conversions.
//
// STATUS: Interface defined. No live partners as of 2026.
// Activating requires: BD partnership + signed callback endpoint + secret management per doc 07.
// NEVER mark a conversion verified without a real signed callback from a live partner.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Auth model (defined, not yet live) ---
//
// Partner callbacks must be signed with HMAC-SHA256 using a shared secret stored as a
// Supabase secret (never in the database, never logged). The signature covers:
//   timestamp + partner_key + impression_id + conversion_type
// Replay window: reject any callback where |now - timestamp| > 300 seconds.
// Secret issuance: generated per-partner, stored via `supabase secrets set PARTNER_KEY_<NAME>`.
// Revocation: rotate the secret (supabase secrets set) — old callbacks instantly invalid.

export interface PartnerCallback {
  partner_key: string;        // e.g. "draftkings", "fanduel", "fanatics"
  impression_id: number;      // NORMA impression that triggered the journey
  conversion_type: string;    // "wager_placed" | "commerce_open" (partner confirms outcome)
  external_action_id: string; // partner's idempotency key
  timestamp_ms: number;       // Unix ms — for replay window check
  signature: string;          // HMAC-SHA256(secret, timestamp_ms + partner_key + impression_id + conversion_type)
}

export interface IngestResult {
  accepted: boolean;
  reason: string;
  conversion_id?: number;
}

export interface ConversionIngestor {
  partner_key: string;
  is_live: boolean; // MUST be false for all stub adapters

  /** Validate signature. Returns false for all stub adapters (not live). */
  validateSignature(callback: PartnerCallback, secret: string): boolean;

  /** Ingest a partner callback and mark the conversion as partner_api-verified.
   *  Stubs MUST return { accepted: false, reason: "not_live — requires partnership" }.
   *  Only a live adapter with a real signed callback may return accepted: true.
   */
  ingest(supabase: SupabaseClient, callback: PartnerCallback): Promise<IngestResult>;
}

// --- Disabled stub adapters ---

export class DraftKingsConversionIngestor implements ConversionIngestor {
  partner_key = "draftkings";
  is_live = false;

  validateSignature(_callback: PartnerCallback, _secret: string): boolean {
    console.log("[ConversionIngestor] DraftKings validateSignature called — not live. Returning false.");
    return false;
  }

  async ingest(_supabase: SupabaseClient, _callback: PartnerCallback): Promise<IngestResult> {
    console.log("[ConversionIngestor] DraftKings ingest called — not live. No conversion written.");
    return {
      accepted: false,
      reason: "not_live — DraftKings partner callback requires a signed BD agreement. No public sportsbook conversion API exists.",
    };
  }
}

export class FanDuelConversionIngestor implements ConversionIngestor {
  partner_key = "fanduel";
  is_live = false;

  validateSignature(_callback: PartnerCallback, _secret: string): boolean {
    console.log("[ConversionIngestor] FanDuel validateSignature called — not live. Returning false.");
    return false;
  }

  async ingest(_supabase: SupabaseClient, _callback: PartnerCallback): Promise<IngestResult> {
    console.log("[ConversionIngestor] FanDuel ingest called — not live. No conversion written.");
    return {
      accepted: false,
      reason: "not_live — FanDuel partner callback requires a signed BD agreement. No public sportsbook conversion API exists.",
    };
  }
}

export class FanaticsConversionIngestor implements ConversionIngestor {
  partner_key = "fanatics";
  is_live = false;

  validateSignature(_callback: PartnerCallback, _secret: string): boolean {
    console.log("[ConversionIngestor] Fanatics validateSignature called — not live. Returning false.");
    return false;
  }

  async ingest(_supabase: SupabaseClient, _callback: PartnerCallback): Promise<IngestResult> {
    console.log("[ConversionIngestor] Fanatics ingest called — not live. No conversion written.");
    return {
      accepted: false,
      reason: "not_live — Fanatics partner callback requires a signed BD agreement.",
    };
  }
}

export const CONVERSION_INGESTORS: Record<string, ConversionIngestor> = {
  draftkings: new DraftKingsConversionIngestor(),
  fanduel: new FanDuelConversionIngestor(),
  fanatics: new FanaticsConversionIngestor(),
};

export function getConversionIngestor(partnerKey: string): ConversionIngestor | null {
  return CONVERSION_INGESTORS[partnerKey] ?? null;
}
