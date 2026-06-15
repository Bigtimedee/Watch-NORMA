/**
 * Tests for ConversionIngestor scaffold (P2-08).
 * Key invariant: stubs MUST refuse to verify. Verification requires a live partner.
 *
 * The ConversionIngestor lives in a Deno Edge Function (_shared/conversion-ingestor.ts)
 * so we mirror its logic here in Jest-compatible TypeScript rather than importing it
 * directly (same pattern used in attribution.test.ts, pricing-engine.test.ts, etc.).
 */

// --- Mirrored types ---

type IngestResult = { accepted: boolean; reason: string; conversion_id?: number };

interface PartnerCallback {
  partner_key: string;
  impression_id: number;
  conversion_type: string;
  external_action_id: string;
  timestamp_ms: number;
  signature: string;
}

interface ConversionIngestor {
  partner_key: string;
  is_live: boolean;
  validateSignature(callback: PartnerCallback, secret: string): boolean;
  ingest(callback: PartnerCallback): Promise<IngestResult>;
}

// --- Mirrored stub adapters ---

class DraftKingsConversionIngestor implements ConversionIngestor {
  partner_key = "draftkings";
  is_live = false;

  validateSignature(_callback: PartnerCallback, _secret: string): boolean {
    return false;
  }

  async ingest(_callback: PartnerCallback): Promise<IngestResult> {
    return {
      accepted: false,
      reason:
        "not_live — DraftKings partner callback requires a signed BD agreement. No public sportsbook conversion API exists.",
    };
  }
}

class FanDuelConversionIngestor implements ConversionIngestor {
  partner_key = "fanduel";
  is_live = false;

  validateSignature(_callback: PartnerCallback, _secret: string): boolean {
    return false;
  }

  async ingest(_callback: PartnerCallback): Promise<IngestResult> {
    return {
      accepted: false,
      reason:
        "not_live — FanDuel partner callback requires a signed BD agreement. No public sportsbook conversion API exists.",
    };
  }
}

class FanaticsConversionIngestor implements ConversionIngestor {
  partner_key = "fanatics";
  is_live = false;

  validateSignature(_callback: PartnerCallback, _secret: string): boolean {
    return false;
  }

  async ingest(_callback: PartnerCallback): Promise<IngestResult> {
    return {
      accepted: false,
      reason: "not_live — Fanatics partner callback requires a signed BD agreement.",
    };
  }
}

// --- Mirror of verification_source constraint ---

const VALID_VERIFICATION_SOURCES = ["inferred", "partner_api"] as const;
type VerificationSource = (typeof VALID_VERIFICATION_SOURCES)[number];

function isValidVerificationSource(source: string): source is VerificationSource {
  return VALID_VERIFICATION_SOURCES.includes(source as VerificationSource);
}

function defaultVerificationSource(): VerificationSource {
  return "inferred";
}

// A conversion may only be marked partner_api if a live adapter returned accepted: true.
function resolveVerificationSource(
  ingestResult: IngestResult,
): VerificationSource {
  if (ingestResult.accepted) {
    return "partner_api";
  }
  return "inferred";
}

// --- Shared test fixture ---

const SAMPLE_CALLBACK: PartnerCallback = {
  partner_key: "draftkings",
  impression_id: 42,
  conversion_type: "wager_placed",
  external_action_id: "DK-WAGER-001",
  timestamp_ms: Date.now(),
  signature: "fake-sig",
};

// ============================================================
// Tests
// ============================================================

describe("ConversionIngestor scaffold — DraftKings stub", () => {
  const ingestor = new DraftKingsConversionIngestor();

  it("has partner_key = draftkings", () => {
    expect(ingestor.partner_key).toBe("draftkings");
  });

  it("is_live is false", () => {
    expect(ingestor.is_live).toBe(false);
  });

  it("ingest returns accepted=false", async () => {
    const result = await ingestor.ingest(SAMPLE_CALLBACK);
    expect(result.accepted).toBe(false);
  });

  it("ingest reason contains not_live", async () => {
    const result = await ingestor.ingest(SAMPLE_CALLBACK);
    expect(result.reason).toMatch(/not_live/);
  });

  it("ingest does not return a conversion_id", async () => {
    const result = await ingestor.ingest(SAMPLE_CALLBACK);
    expect(result.conversion_id).toBeUndefined();
  });

  it("validateSignature returns false", () => {
    expect(ingestor.validateSignature(SAMPLE_CALLBACK, "any-secret")).toBe(false);
  });
});

describe("ConversionIngestor scaffold — FanDuel stub", () => {
  const ingestor = new FanDuelConversionIngestor();

  it("has partner_key = fanduel", () => {
    expect(ingestor.partner_key).toBe("fanduel");
  });

  it("is_live is false", () => {
    expect(ingestor.is_live).toBe(false);
  });

  it("ingest returns accepted=false", async () => {
    const result = await ingestor.ingest({ ...SAMPLE_CALLBACK, partner_key: "fanduel" });
    expect(result.accepted).toBe(false);
  });

  it("ingest reason contains not_live", async () => {
    const result = await ingestor.ingest({ ...SAMPLE_CALLBACK, partner_key: "fanduel" });
    expect(result.reason).toMatch(/not_live/);
  });

  it("validateSignature returns false", () => {
    expect(ingestor.validateSignature(SAMPLE_CALLBACK, "any-secret")).toBe(false);
  });
});

describe("ConversionIngestor scaffold — Fanatics stub", () => {
  const ingestor = new FanaticsConversionIngestor();

  it("has partner_key = fanatics", () => {
    expect(ingestor.partner_key).toBe("fanatics");
  });

  it("is_live is false", () => {
    expect(ingestor.is_live).toBe(false);
  });

  it("ingest returns accepted=false", async () => {
    const result = await ingestor.ingest({ ...SAMPLE_CALLBACK, partner_key: "fanatics" });
    expect(result.accepted).toBe(false);
  });

  it("ingest reason contains not_live", async () => {
    const result = await ingestor.ingest({ ...SAMPLE_CALLBACK, partner_key: "fanatics" });
    expect(result.reason).toMatch(/not_live/);
  });

  it("validateSignature returns false", () => {
    expect(ingestor.validateSignature(SAMPLE_CALLBACK, "any-secret")).toBe(false);
  });
});

describe("verification_source schema constraint", () => {
  it("default verification_source is inferred", () => {
    expect(defaultVerificationSource()).toBe("inferred");
  });

  it("inferred is a valid verification source", () => {
    expect(isValidVerificationSource("inferred")).toBe(true);
  });

  it("partner_api is a valid verification source", () => {
    expect(isValidVerificationSource("partner_api")).toBe(true);
  });

  it("arbitrary strings are not valid verification sources", () => {
    expect(isValidVerificationSource("verified")).toBe(false);
    expect(isValidVerificationSource("manual")).toBe(false);
    expect(isValidVerificationSource("")).toBe(false);
    expect(isValidVerificationSource("INFERRED")).toBe(false);
  });
});

describe("verification_source — stub adapters cannot produce partner_api", () => {
  const stubs: ConversionIngestor[] = [
    new DraftKingsConversionIngestor(),
    new FanDuelConversionIngestor(),
    new FanaticsConversionIngestor(),
  ];

  it.each(stubs.map((s) => [s.partner_key, s]))(
    "%s stub: resolveVerificationSource yields inferred (not partner_api)",
    async (_key, ingestor) => {
      const result = await (ingestor as ConversionIngestor).ingest(SAMPLE_CALLBACK);
      const source = resolveVerificationSource(result);
      expect(source).toBe("inferred");
      expect(source).not.toBe("partner_api");
    },
  );

  it("a conversion cannot be marked partner_api when accepted=false", () => {
    const notAccepted: IngestResult = { accepted: false, reason: "not_live" };
    expect(resolveVerificationSource(notAccepted)).toBe("inferred");
  });

  it("a conversion is marked partner_api only when accepted=true (live adapter)", () => {
    // Simulates what a real live adapter would return — never reachable from stubs.
    const liveResult: IngestResult = { accepted: true, reason: "ok", conversion_id: 99 };
    expect(resolveVerificationSource(liveResult)).toBe("partner_api");
  });
});
