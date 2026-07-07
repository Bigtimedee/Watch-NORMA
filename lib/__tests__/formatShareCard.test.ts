import {
  formatAlertShareCard,
  formatGameShareCard,
} from "../formatShareCard";
import type { Alert, Game, WhyNow } from "../types";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "g1",
    sport: "ncaam",
    sportsdataio_id: null,
    espn_id: null,
    sportradar_id: null,
    status: "inprogress",
    title: "Duke vs Carolina",
    home_team_id: "team-duke",
    away_team_id: "team-carolina",
    home_score: 68,
    away_score: 65,
    clock: "4:30",
    period: 2,
    scheduled_at: "2026-03-15T19:00:00Z",
    venue: "Cameron Indoor",
    broadcast: "ESPN",
    coverage: null,
    coverage_level: null,
    tournament_round: null,
    snapshot_hash: null,
    last_pbp_source: null,
    last_summary_source: null,
    updated_at: "2026-03-15T20:30:00Z",
    home_team: { id: "team-duke", name: "Blue Devils", market: "Duke", abbreviation: "DUKE", conference: null, logo_url: null, sportsdataio_id: null, sportradar_id: null, sport: "ncaam", created_at: "" },
    away_team: { id: "team-carolina", name: "Tar Heels", market: "Carolina", abbreviation: "UNC", conference: null, logo_url: null, sportsdataio_id: null, sportradar_id: null, sport: "ncaam", created_at: "" },
    ...overrides,
  };
}

function makeAlert(overrides: Partial<Alert> = {}, explanation?: WhyNow | null): Alert {
  return {
    id: 1,
    user_id: "u1",
    game_id: "g1",
    sport: "ncaam",
    alert_type: "spread_alert",
    title: "Spread Alert",
    body: "Duke +3.5 in play",
    why: null,
    push_sent: true,
    read: false,
    created_at: "2026-03-15T20:30:00Z",
    score: 55,
    explanation: explanation !== undefined ? explanation : null,
    suppressed_reason: null,
    sponsor_bid_id: null,
    sponsor_text: null,
    sponsor_cta_url: null,
    sponsor_logo_url: null,
    clearing_price_cents: null,
    game: makeGame(),
    ...overrides,
  };
}

// ─── formatAlertShareCard ───────────────────────────────────────────────

test("alert: uses explanation headline when present", () => {
  const alert = makeAlert({}, {
    headline: "Your Spread Is Live",
    bullets: ["Duke trails by 3 with 4:30 left"],
    stats_used: {},
    confidence: 0.8,
  });
  const result = formatAlertShareCard(alert, false);
  expect(result.headline).toBe("Your Spread Is Live");
});

test("alert: falls back to alert.title when explanation is null", () => {
  const alert = makeAlert({}, null);
  const result = formatAlertShareCard(alert, false);
  expect(result.headline).toBe("Spread Alert");
});

test("alert: top bullet is first bullet in explanation", () => {
  const alert = makeAlert({}, {
    headline: "Close Game",
    bullets: ["Duke trails by 3 with 4:30 left", "They came back from 14 down"],
    stats_used: {},
    confidence: 0.7,
  });
  const result = formatAlertShareCard(alert, false);
  expect(result.topBullet).toBe("Duke trails by 3 with 4:30 left");
});

test("alert: topBullet is null when no bullets", () => {
  const alert = makeAlert({}, {
    headline: "Overtime",
    bullets: [],
    stats_used: {},
    confidence: 1.0,
  });
  const result = formatAlertShareCard(alert, false);
  expect(result.topBullet).toBeNull();
});

test("alert: wagerLine null when includeWagerLine=false even if wager_impact present", () => {
  const alert = makeAlert({}, {
    headline: "Spread Live",
    bullets: [],
    stats_used: {},
    confidence: 0.9,
    wager_impact: { wager_id: 1, wager_description: "Duke -3.5", status: "covering" },
  });
  const result = formatAlertShareCard(alert, false);
  expect(result.wagerLine).toBeNull();
});

test("alert: wagerLine set to wager_description when includeWagerLine=true", () => {
  const alert = makeAlert({}, {
    headline: "Spread Live",
    bullets: [],
    stats_used: {},
    confidence: 0.9,
    wager_impact: { wager_id: 1, wager_description: "Duke -3.5", status: "covering" },
  });
  const result = formatAlertShareCard(alert, true);
  expect(result.wagerLine).toBe("Duke -3.5");
});

test("alert: wagerLine null when includeWagerLine=true but no wager_impact", () => {
  const alert = makeAlert({}, {
    headline: "Close Game",
    bullets: [],
    stats_used: {},
    confidence: 0.7,
  });
  const result = formatAlertShareCard(alert, true);
  expect(result.wagerLine).toBeNull();
});

test("alert: scores are null when game status is scheduled", () => {
  const alert = makeAlert({ game: makeGame({ status: "scheduled", home_score: 0, away_score: 0 }) });
  const result = formatAlertShareCard(alert, false);
  expect(result.homeScore).toBeNull();
  expect(result.awayScore).toBeNull();
});

test("alert: scores populated when game is live", () => {
  const result = formatAlertShareCard(makeAlert(), false);
  expect(result.homeScore).toBe(68);
  expect(result.awayScore).toBe(65);
});

test("alert: team names from market field", () => {
  const result = formatAlertShareCard(makeAlert(), false);
  expect(result.homeTeam).toBe("Duke");
  expect(result.awayTeam).toBe("Carolina");
});

test("alert: clock display shows 'Final' for closed game", () => {
  const alert = makeAlert({ game: makeGame({ status: "closed" }) });
  const result = formatAlertShareCard(alert, false);
  expect(result.clockDisplay).toBe("Final");
});

test("alert: clock display shows 'Halftime' for halftime", () => {
  const alert = makeAlert({ game: makeGame({ status: "halftime" }) });
  const result = formatAlertShareCard(alert, false);
  expect(result.clockDisplay).toBe("Halftime");
});

test("alert: clock display shows clock and period for live game", () => {
  const result = formatAlertShareCard(makeAlert(), false);
  expect(result.clockDisplay).toBe("4:30 · P2");
});

test("alert: clock display is empty string for scheduled", () => {
  const alert = makeAlert({ game: makeGame({ status: "scheduled" }) });
  const result = formatAlertShareCard(alert, false);
  expect(result.clockDisplay).toBe("");
});

// ─── formatGameShareCard ────────────────────────────────────────────────

test("game: live headline is 'Watch Now'", () => {
  const result = formatGameShareCard(makeGame({ status: "inprogress" }));
  expect(result.headline).toBe("Watch Now");
});

test("game: halftime headline is 'Watch Now'", () => {
  const result = formatGameShareCard(makeGame({ status: "halftime" }));
  expect(result.headline).toBe("Watch Now");
});

test("game: closed headline is 'Final Score'", () => {
  const result = formatGameShareCard(makeGame({ status: "closed" }));
  expect(result.headline).toBe("Final Score");
});

test("game: scheduled headline is 'Upcoming Game'", () => {
  const result = formatGameShareCard(makeGame({ status: "scheduled" }));
  expect(result.headline).toBe("Upcoming Game");
});

test("game: wagerLine is always null", () => {
  const result = formatGameShareCard(makeGame());
  expect(result.wagerLine).toBeNull();
});

test("game: topBullet is always null", () => {
  const result = formatGameShareCard(makeGame());
  expect(result.topBullet).toBeNull();
});
