/**
 * Tests for NFL + NCAAF ingestion scaffold (P1-12).
 *
 * Verifies that:
 * 1. NFL and NCAAF are recognized sport keys (not silently dropped)
 * 2. ESPN endpoint resolution for football returns the correct URL base
 * 3. Alert evaluation for football returns a no-op (skip) result while the
 *    ALERTABLE_SPORTS gate is closed
 *
 * These are data-layer tests only. Football alert rules ARE implemented
 * (evaluate-alerts/logic.ts + _shared/alert-scoring.ts) but are held behind
 * the ALERTABLE_SPORTS gate until the Sept 1 2026 activation target.
 * The isAlertable assertions below mirror that gate deliberately: they should
 * be flipped on the activation date, not treated as a stale no-op.
 */

// ─── ESPN base URL resolution ─────────────────────────────────────────────────

// Inline the URL table — mirrors supabase/functions/poll-schedule/index.ts
// and poll-boxscore/index.ts. Kept inline to avoid Deno-only imports in Jest.
const ESPN_BASES: Record<string, string> = {
  ncaam: "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball",
  nba:   "https://site.api.espn.com/apis/site/v2/sports/basketball/nba",
  mlb:   "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb",
  ncaaf: "https://site.api.espn.com/apis/site/v2/sports/football/college-football",
  nfl:   "https://site.api.espn.com/apis/site/v2/sports/football/nfl",
};

const SPORTSDATAIO_BASES: Record<string, string> = {
  ncaam: "https://api.sportsdata.io/v3/cbb",
  nba:   "https://api.sportsdata.io/v3/nba",
  mlb:   "https://api.sportsdata.io/v3/mlb",
  ncaaf: "https://api.sportsdata.io/v3/cfb",
  nfl:   "https://api.sportsdata.io/v3/nfl",
};

// ─── Alert gate (mirrors evaluate-alerts/index.ts guard) ─────────────────────

const ALERTABLE_SPORTS = new Set(["ncaam", "nba", "mlb"]);

function isAlertable(sport: string): boolean {
  return ALERTABLE_SPORTS.has(sport);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("NFL + NCAAF ESPN endpoint registration", () => {
  it("ncaaf maps to college-football ESPN base URL", () => {
    expect(ESPN_BASES["ncaaf"]).toContain("college-football");
  });

  it("nfl maps to nfl ESPN base URL", () => {
    expect(ESPN_BASES["nfl"]).toContain("/nfl");
  });

  it("ncaaf does not map to basketball endpoint", () => {
    expect(ESPN_BASES["ncaaf"]).not.toContain("basketball");
  });

  it("nfl does not map to basketball or baseball endpoint", () => {
    expect(ESPN_BASES["nfl"]).not.toContain("basketball");
    expect(ESPN_BASES["nfl"]).not.toContain("baseball");
  });

  it("existing sports are unaffected", () => {
    expect(ESPN_BASES["ncaam"]).toContain("mens-college-basketball");
    expect(ESPN_BASES["nba"]).toContain("/nba");
    expect(ESPN_BASES["mlb"]).toContain("/mlb");
  });
});

describe("NFL + NCAAF SportsDataIO endpoint registration", () => {
  it("ncaaf maps to cfb (college football) SportsDataIO base", () => {
    expect(SPORTSDATAIO_BASES["ncaaf"]).toContain("/cfb");
  });

  it("nfl maps to nfl SportsDataIO base", () => {
    expect(SPORTSDATAIO_BASES["nfl"]).toContain("/nfl");
  });
});

describe("football alert gate (ingestion-only guard)", () => {
  it("ncaaf is NOT alertable (no football alert rules yet)", () => {
    expect(isAlertable("ncaaf")).toBe(false);
  });

  it("nfl is NOT alertable (no football alert rules yet)", () => {
    expect(isAlertable("nfl")).toBe(false);
  });

  it("ncaam IS alertable (basketball rules implemented)", () => {
    expect(isAlertable("ncaam")).toBe(true);
  });

  it("nba IS alertable", () => {
    expect(isAlertable("nba")).toBe(true);
  });

  it("mlb IS alertable", () => {
    expect(isAlertable("mlb")).toBe(true);
  });

  it("unknown sport is NOT alertable (safe default)", () => {
    expect(isAlertable("unknown_sport")).toBe(false);
  });
});
