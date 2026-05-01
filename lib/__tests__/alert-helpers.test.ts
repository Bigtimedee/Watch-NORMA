import {
  alertTypeLabel,
  alertTypeColor,
  alertTypeIcon,
  isUrgent,
  timeAgo,
  formatClock,
  sortAlerts,
} from "../alert-helpers";
import type { Alert, AlertType, Game } from "../types";

// ─── alertTypeLabel ───

describe("alertTypeLabel", () => {
  it("returns 'Spread' for spread_alert", () => {
    expect(alertTypeLabel("spread_alert")).toBe("Spread");
  });

  it("returns 'Over/Under' for total_alert", () => {
    expect(alertTypeLabel("total_alert")).toBe("Over/Under");
  });

  it("returns 'Moneyline' for moneyline_alert", () => {
    expect(alertTypeLabel("moneyline_alert")).toBe("Moneyline");
  });

  it("returns 'Prop Bet' for prop_alert", () => {
    expect(alertTypeLabel("prop_alert")).toBe("Prop Bet");
  });

  it("returns 'Position' for position_alert", () => {
    expect(alertTypeLabel("position_alert")).toBe("Position");
  });

  it("returns 'Result' for bet_resolved", () => {
    expect(alertTypeLabel("bet_resolved")).toBe("Result");
  });
});

// ─── alertTypeColor ───

describe("alertTypeColor", () => {
  it("spread_alert → orange", () => {
    expect(alertTypeColor("spread_alert")).toBe("#f97316");
  });

  it("total_alert → yellow", () => {
    expect(alertTypeColor("total_alert")).toBe("#eab308");
  });

  it("moneyline_alert → red", () => {
    expect(alertTypeColor("moneyline_alert")).toBe("#ef4444");
  });

  it("prop_alert → blue", () => {
    expect(alertTypeColor("prop_alert")).toBe("#3b82f6");
  });

  it("position_alert → purple", () => {
    expect(alertTypeColor("position_alert")).toBe("#a855f7");
  });

  it("bet_resolved → green", () => {
    expect(alertTypeColor("bet_resolved")).toBe("#22c55e");
  });

  it("unknown type → fallback gray", () => {
    expect(alertTypeColor("nonexistent" as AlertType)).toBe("#94a3b8");
  });
});

// ─── isUrgent ───

describe("isUrgent", () => {
  it("returns true for spread_alert", () => {
    expect(isUrgent("spread_alert")).toBe(true);
  });

  it("returns true for moneyline_alert", () => {
    expect(isUrgent("moneyline_alert")).toBe(true);
  });

  it("returns false for bet_resolved", () => {
    expect(isUrgent("bet_resolved")).toBe(false);
  });
});

// ─── timeAgo ───

describe("timeAgo", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-01T20:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns 'just now' for <1 min ago", () => {
    const date = new Date("2026-03-01T19:59:45Z").toISOString();
    expect(timeAgo(date)).toBe("just now");
  });

  it("returns minutes ago", () => {
    const date = new Date("2026-03-01T19:55:00Z").toISOString();
    expect(timeAgo(date)).toBe("5m ago");
  });

  it("returns hours ago", () => {
    const date = new Date("2026-03-01T17:00:00Z").toISOString();
    expect(timeAgo(date)).toBe("3h ago");
  });

  it("returns days ago", () => {
    const date = new Date("2026-02-27T20:00:00Z").toISOString();
    expect(timeAgo(date)).toBe("2d ago");
  });
});

// ─── formatClock ───

describe("formatClock", () => {
  const baseGame: Game = {
    id: "g1",
    sportsdataio_id: 1,
    sportradar_id: null,
    sport: "ncaam",
    espn_id: null,
    status: "inprogress",
    title: null,
    home_team_id: null,
    away_team_id: null,
    home_score: 68,
    away_score: 65,
    clock: "4:30",
    period: 2,
    scheduled_at: "2026-03-01T19:00:00Z",
    venue: null,
    broadcast: null,
    coverage: null,
    coverage_level: null,
    tournament_round: null,
    snapshot_hash: null,
    last_pbp_source: null,
    last_summary_source: null,
    updated_at: "2026-03-01T20:00:00Z",
  };

  it("scheduled → time string", () => {
    const game = { ...baseGame, status: "scheduled" as const };
    const result = formatClock(game);
    // Should return a localized time string
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("halftime → HALF", () => {
    const game = { ...baseGame, status: "halftime" as const };
    expect(formatClock(game)).toBe("HALF");
  });

  it("closed → FINAL", () => {
    const game = { ...baseGame, status: "closed" as const };
    expect(formatClock(game)).toBe("FINAL");
  });

  it("inprogress → clock + period", () => {
    const result = formatClock(baseGame);
    expect(result).toBe("4:30 H2");
  });

  it("OT period label (NCAA)", () => {
    const game = { ...baseGame, period: 3, clock: "2:00" };
    expect(formatClock(game)).toBe("2:00 OT1");
  });

  it("second OT for NCAA uses OT2", () => {
    const game = { ...baseGame, period: 4, clock: "1:00" };
    expect(formatClock(game)).toBe("1:00 OT2");
  });
});

// ─── formatClock — NBA ───

describe("formatClock — NBA quarter labels", () => {
  const baseNBAGame: Game = {
    id: "g2",
    sportsdataio_id: 2,
    sportradar_id: null,
    sport: "nba",
    espn_id: null,
    status: "inprogress",
    title: null,
    home_team_id: null,
    away_team_id: null,
    home_score: 104,
    away_score: 101,
    clock: "3:15",
    period: 4,
    scheduled_at: "2026-04-01T19:00:00Z",
    venue: null,
    broadcast: null,
    coverage: null,
    coverage_level: null,
    tournament_round: null,
    snapshot_hash: null,
    last_pbp_source: null,
    last_summary_source: null,
    updated_at: "2026-04-01T21:00:00Z",
  };

  it("Q4 with clock", () => {
    expect(formatClock(baseNBAGame)).toBe("3:15 Q4");
  });

  it("Q1 in first quarter", () => {
    expect(formatClock({ ...baseNBAGame, period: 1, clock: "11:42" })).toBe("11:42 Q1");
  });

  it("OT (5th period) shows OT", () => {
    expect(formatClock({ ...baseNBAGame, period: 5, clock: "2:00" })).toBe("2:00 OT");
  });

  it("double OT (6th period) shows OT2", () => {
    expect(formatClock({ ...baseNBAGame, period: 6, clock: "1:30" })).toBe("1:30 OT2");
  });

  it("closed NBA game shows FINAL", () => {
    expect(formatClock({ ...baseNBAGame, status: "closed" })).toBe("FINAL");
  });
});

// ─── formatClock — MLB ───

describe("formatClock — MLB inning labels", () => {
  const baseMLBGame: Game = {
    id: "g3",
    sportsdataio_id: 3,
    sportradar_id: null,
    sport: "mlb",
    espn_id: null,
    status: "inprogress",
    title: null,
    home_team_id: null,
    away_team_id: null,
    home_score: 3,
    away_score: 2,
    clock: "T7",
    period: 7,
    scheduled_at: "2026-04-07T19:05:00Z",
    venue: null,
    broadcast: null,
    coverage: null,
    coverage_level: null,
    tournament_round: null,
    snapshot_hash: null,
    last_pbp_source: null,
    last_summary_source: null,
    updated_at: "2026-04-07T21:00:00Z",
  };

  it("T7 → Top 7th", () => {
    expect(formatClock(baseMLBGame)).toBe("Top 7th");
  });

  it("B9 → Bot 9th", () => {
    expect(formatClock({ ...baseMLBGame, clock: "B9", period: 9 })).toBe("Bot 9th");
  });

  it("T1 → Top 1st", () => {
    expect(formatClock({ ...baseMLBGame, clock: "T1", period: 1 })).toBe("Top 1st");
  });

  it("B2 → Bot 2nd", () => {
    expect(formatClock({ ...baseMLBGame, clock: "B2", period: 2 })).toBe("Bot 2nd");
  });

  it("T3 → Top 3rd", () => {
    expect(formatClock({ ...baseMLBGame, clock: "T3", period: 3 })).toBe("Top 3rd");
  });

  it("extra innings T11 → Top 11th", () => {
    expect(formatClock({ ...baseMLBGame, clock: "T11", period: 11 })).toBe("Top 11th");
  });

  it("null clock falls back to inning number", () => {
    expect(formatClock({ ...baseMLBGame, clock: null, period: 7 })).toBe("Inn 7");
  });

  it("null clock and null period → LIVE", () => {
    expect(formatClock({ ...baseMLBGame, clock: null, period: null })).toBe("LIVE");
  });

  it("closed MLB game → FINAL", () => {
    expect(formatClock({ ...baseMLBGame, status: "closed" })).toBe("FINAL");
  });

  it("scheduled MLB game → time string", () => {
    const result = formatClock({ ...baseMLBGame, status: "scheduled" });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── sortAlerts ───

describe("sortAlerts", () => {
  const makeAlert = (id: number, read: boolean, dateStr: string): Alert => ({
    id,
    user_id: "u1",
    game_id: "g1",
    sport: "ncaam",
    alert_type: "spread_alert",
    title: "Test",
    body: "Test",
    why: null,
    push_sent: false,
    read,
    created_at: dateStr,
    score: null,
    explanation: null,
    suppressed_reason: null,
    sponsor_bid_id: null,
    sponsor_text: null,
    sponsor_cta_url: null,
    sponsor_logo_url: null,
    clearing_price_cents: null,
  });

  it("unread alerts come first", () => {
    const alerts = [
      makeAlert(1, true, "2026-03-01T20:00:00Z"),
      makeAlert(2, false, "2026-03-01T19:00:00Z"),
    ];
    const sorted = sortAlerts(alerts);
    expect(sorted[0].id).toBe(2); // unread first
    expect(sorted[1].id).toBe(1);
  });

  it("within same read status, sorts by date desc", () => {
    const alerts = [
      makeAlert(1, false, "2026-03-01T18:00:00Z"),
      makeAlert(2, false, "2026-03-01T20:00:00Z"),
      makeAlert(3, false, "2026-03-01T19:00:00Z"),
    ];
    const sorted = sortAlerts(alerts);
    expect(sorted.map((a) => a.id)).toEqual([2, 3, 1]);
  });

  it("does not mutate original array", () => {
    const alerts = [
      makeAlert(1, true, "2026-03-01T20:00:00Z"),
      makeAlert(2, false, "2026-03-01T19:00:00Z"),
    ];
    const original = [...alerts];
    sortAlerts(alerts);
    expect(alerts).toEqual(original);
  });
});
