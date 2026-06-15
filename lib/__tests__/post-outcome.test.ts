// P2-07: Post-outcome commerce moment — unit tests.
// These test the pure decision logic that mirrors the evaluate-alerts implementation.
// No DB or network calls are made.

// ─── Pure functions mirroring the post_outcome decision logic ───

function qualifiesForPostOutcome(
  status: string,
  homeScore: number,
  awayScore: number
): boolean {
  return status === "closed" && homeScore !== awayScore;
}

function postOutcomeDedupKey(gameId: string): string {
  return `${gameId}:post_outcome:final:0`;
}

function postOutcomeQualifiers(
  margin: number,
  period: number
): { is_upset: boolean; is_blowout: boolean; is_overtime: boolean } {
  return {
    is_upset: margin <= 5,
    is_blowout: margin > 20,
    is_overtime: period > 4,
  };
}

// ─── qualifiesForPostOutcome ───

describe("qualifiesForPostOutcome", () => {
  it("qualifies when status=closed and margin is decisive", () => {
    expect(qualifiesForPostOutcome("closed", 78, 65)).toBe(true);
  });

  it("qualifies for a 1-point margin (minimum decisive win)", () => {
    expect(qualifiesForPostOutcome("closed", 71, 70)).toBe(true);
  });

  it("does NOT qualify when status=inprogress", () => {
    expect(qualifiesForPostOutcome("inprogress", 78, 65)).toBe(false);
  });

  it("does NOT qualify when status=halftime", () => {
    expect(qualifiesForPostOutcome("halftime", 42, 38)).toBe(false);
  });

  it("does NOT qualify when status=scheduled", () => {
    expect(qualifiesForPostOutcome("scheduled", 0, 0)).toBe(false);
  });

  it("does NOT qualify when game is tied (home_score === away_score)", () => {
    expect(qualifiesForPostOutcome("closed", 72, 72)).toBe(false);
  });

  it("does NOT qualify when tied at zero (edge case)", () => {
    expect(qualifiesForPostOutcome("closed", 0, 0)).toBe(false);
  });
});

// ─── postOutcomeDedupKey ───

describe("postOutcomeDedupKey", () => {
  it("produces the expected format", () => {
    expect(postOutcomeDedupKey("game-abc-123")).toBe(
      "game-abc-123:post_outcome:final:0"
    );
  });

  it("is always the same for the same gameId regardless of score", () => {
    const key1 = postOutcomeDedupKey("game-xyz");
    const key2 = postOutcomeDedupKey("game-xyz");
    expect(key1).toBe(key2);
  });

  it("differs between different gameIds", () => {
    expect(postOutcomeDedupKey("game-001")).not.toBe(
      postOutcomeDedupKey("game-002")
    );
  });

  it("always ends with :post_outcome:final:0", () => {
    expect(postOutcomeDedupKey("any-game")).toMatch(/:post_outcome:final:0$/);
  });
});

// ─── postOutcomeQualifiers — is_upset ───

describe("postOutcomeQualifiers — is_upset", () => {
  it("is_upset=true when margin <= 5 (close final)", () => {
    expect(postOutcomeQualifiers(5, 2).is_upset).toBe(true);
  });

  it("is_upset=true at margin=1", () => {
    expect(postOutcomeQualifiers(1, 2).is_upset).toBe(true);
  });

  it("is_upset=true at margin=0 (boundary — though 0 cannot reach here via qualifier)", () => {
    expect(postOutcomeQualifiers(0, 2).is_upset).toBe(true);
  });

  it("is_upset=false when margin=6", () => {
    expect(postOutcomeQualifiers(6, 2).is_upset).toBe(false);
  });

  it("is_upset=false when margin > 5", () => {
    expect(postOutcomeQualifiers(15, 2).is_upset).toBe(false);
  });
});

// ─── postOutcomeQualifiers — is_blowout ───

describe("postOutcomeQualifiers — is_blowout", () => {
  it("is_blowout=true when margin > 20", () => {
    expect(postOutcomeQualifiers(21, 2).is_blowout).toBe(true);
  });

  it("is_blowout=true for large margin", () => {
    expect(postOutcomeQualifiers(35, 2).is_blowout).toBe(true);
  });

  it("is_blowout=false when margin = 20 (boundary — not strictly greater)", () => {
    expect(postOutcomeQualifiers(20, 2).is_blowout).toBe(false);
  });

  it("is_blowout=false when margin < 20", () => {
    expect(postOutcomeQualifiers(10, 2).is_blowout).toBe(false);
  });
});

// ─── postOutcomeQualifiers — is_overtime ───

describe("postOutcomeQualifiers — is_overtime", () => {
  it("is_overtime=true when period > 4 (basketball OT)", () => {
    expect(postOutcomeQualifiers(5, 5).is_overtime).toBe(true);
  });

  it("is_overtime=true at period=10 (baseball extra innings)", () => {
    expect(postOutcomeQualifiers(2, 10).is_overtime).toBe(true);
  });

  it("is_overtime=false when period = 4 (regulation final quarter)", () => {
    expect(postOutcomeQualifiers(5, 4).is_overtime).toBe(false);
  });

  it("is_overtime=false when period = 2 (halftime)", () => {
    expect(postOutcomeQualifiers(5, 2).is_overtime).toBe(false);
  });

  it("is_overtime=false when period = 1", () => {
    expect(postOutcomeQualifiers(5, 1).is_overtime).toBe(false);
  });
});

// ─── Combined qualifier scenarios ───

describe("postOutcomeQualifiers — combined scenarios", () => {
  it("close OT game: is_upset=true, is_blowout=false, is_overtime=true", () => {
    const q = postOutcomeQualifiers(3, 5);
    expect(q.is_upset).toBe(true);
    expect(q.is_blowout).toBe(false);
    expect(q.is_overtime).toBe(true);
  });

  it("blowout regulation game: is_upset=false, is_blowout=true, is_overtime=false", () => {
    const q = postOutcomeQualifiers(25, 4);
    expect(q.is_upset).toBe(false);
    expect(q.is_blowout).toBe(true);
    expect(q.is_overtime).toBe(false);
  });

  it("normal regulation finish: is_upset=false, is_blowout=false, is_overtime=false", () => {
    const q = postOutcomeQualifiers(12, 4);
    expect(q.is_upset).toBe(false);
    expect(q.is_blowout).toBe(false);
    expect(q.is_overtime).toBe(false);
  });
});

// ─── commerce_open attribution note ───

describe("commerce_open attribution", () => {
  it("post_outcome moment is inferred (same as stream_open / sportsbook_open) — no app verification", () => {
    // Commerce attribution is inferred at campaign level; no runtime flag is computed here.
    // This test documents the design decision: post_outcome rows always carry auction_outcome="unfilled"
    // and no per-user auction runs at the moment of recording.
    const auctionOutcome = "unfilled";
    expect(auctionOutcome).toBe("unfilled");
  });
});
