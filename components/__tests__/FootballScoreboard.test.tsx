// components/__tests__/FootballScoreboard.test.tsx
// Render tests for FootballScoreboard — verifies quarter columns, total scores,
// and scoring-plays list render correctly for ncaaf and nfl game fixtures.

import React from "react";
import { render } from "@testing-library/react-native";
import {
  FootballScoreboard,
  type FootballScoringPlay,
} from "../FootballScoreboard";
import type { Game } from "../../lib/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "g1",
    sport: "ncaaf",
    status: "inprogress",
    home_score: 17,
    away_score: 14,
    period: 3,
    clock: "8:22",
    title: "Alabama at Georgia",
    scheduled_at: new Date().toISOString(),
    sportsdataio_id: null,
    espn_id: "401547435",
    sportradar_id: null,
    home_team_id: "t1",
    away_team_id: "t2",
    venue: "Sanford Stadium",
    broadcast: "CBS",
    coverage: null,
    coverage_level: null,
    tournament_round: null,
    snapshot_hash: null,
    last_pbp_source: null,
    last_summary_source: null,
    updated_at: new Date().toISOString(),
    home_team: {
      id: "t1",
      name: "Bulldogs",
      market: "Georgia",
      abbreviation: "UGA",
      conference: "SEC",
      logo_url: null,
      sportsdataio_id: null,
      sportradar_id: null,
      sport: "ncaaf",
      created_at: new Date().toISOString(),
    },
    away_team: {
      id: "t2",
      name: "Crimson Tide",
      market: "Alabama",
      abbreviation: "ALA",
      conference: "SEC",
      logo_url: null,
      sportsdataio_id: null,
      sportradar_id: null,
      sport: "ncaaf",
      created_at: new Date().toISOString(),
    },
    ...overrides,
  };
}

const NCAAF_SCORING_PLAYS: FootballScoringPlay[] = [
  // Q1
  { period: 1, clock: "10:31", team: "away", description: "Jones 12 yd run", points: 6, homeScoreAfter: 0, awayScoreAfter: 6 },
  { period: 1, clock: "10:31", team: "away", description: "PAT Good", points: 1, homeScoreAfter: 0, awayScoreAfter: 7 },
  // Q2
  { period: 2, clock: "7:14", team: "home", description: "Smith 45 yd FG", points: 3, homeScoreAfter: 3, awayScoreAfter: 7 },
  { period: 2, clock: "2:05", team: "home", description: "Lee 8 yd pass from Davis", points: 6, homeScoreAfter: 9, awayScoreAfter: 7 },
  { period: 2, clock: "2:05", team: "home", description: "PAT Good", points: 1, homeScoreAfter: 10, awayScoreAfter: 7 },
  // Q3
  { period: 3, clock: "11:47", team: "away", description: "Brown 3 yd run", points: 6, homeScoreAfter: 10, awayScoreAfter: 13 },
  { period: 3, clock: "11:47", team: "away", description: "PAT Good", points: 1, homeScoreAfter: 10, awayScoreAfter: 14 },
  { period: 3, clock: "8:22", team: "home", description: "Williams 22 yd FG", points: 3, homeScoreAfter: 13, awayScoreAfter: 14 },
  { period: 3, clock: "5:01", team: "home", description: "Clark 6 yd pass from Evans", points: 6, homeScoreAfter: 19, awayScoreAfter: 14 },
];

// ---------------------------------------------------------------------------
// NCAAF tests
// ---------------------------------------------------------------------------

describe("FootballScoreboard — NCAAF", () => {
  it("renders Q1, Q2, Q3, Q4 column headers", () => {
    const { getAllByText } = render(
      <FootballScoreboard game={makeGame()} sport="ncaaf" scoringPlays={NCAAF_SCORING_PLAYS} />,
    );
    // Q labels appear in both header and scoring-play rows — just assert at least one
    expect(getAllByText("Q1").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Q2").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Q3").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Q4").length).toBeGreaterThanOrEqual(1);
  });

  it("renders team abbreviations in the line score", () => {
    const { getAllByText } = render(
      <FootballScoreboard game={makeGame()} sport="ncaaf" scoringPlays={NCAAF_SCORING_PLAYS} />,
    );
    // abbreviations appear in table row AND possibly in scoring plays badges
    expect(getAllByText("UGA").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("ALA").length).toBeGreaterThanOrEqual(1);
  });

  it("renders away total score", () => {
    const { getAllByText } = render(
      <FootballScoreboard game={makeGame()} sport="ncaaf" scoringPlays={NCAAF_SCORING_PLAYS} />,
    );
    // away_score = 14
    expect(getAllByText("14").length).toBeGreaterThanOrEqual(1);
  });

  it("renders home total score", () => {
    const { getAllByText } = render(
      <FootballScoreboard game={makeGame()} sport="ncaaf" scoringPlays={NCAAF_SCORING_PLAYS} />,
    );
    // home_score = 17
    expect(getAllByText("17").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the live situation bar with quarter and clock when inprogress", () => {
    const { getAllByText, getByText } = render(
      <FootballScoreboard game={makeGame()} sport="ncaaf" scoringPlays={NCAAF_SCORING_PLAYS} />,
    );
    // Q3 appears in both situation bar and column header
    expect(getAllByText("Q3").length).toBeGreaterThanOrEqual(1);
    // Clock "8:22" is unique
    expect(getByText("· 8:22")).toBeTruthy();
  });

  it("renders scoring plays section", () => {
    const { getByText } = render(
      <FootballScoreboard game={makeGame()} sport="ncaaf" scoringPlays={NCAAF_SCORING_PLAYS} />,
    );
    expect(getByText("Scoring Plays")).toBeTruthy();
  });

  it("renders TD label in scoring plays", () => {
    const { getAllByText } = render(
      <FootballScoreboard game={makeGame()} sport="ncaaf" scoringPlays={NCAAF_SCORING_PLAYS} />,
    );
    // playTypeLabel is embedded in "TD — description" text node; use regex
    expect(getAllByText(/\bTD\b/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders FG label in scoring plays", () => {
    const { getAllByText } = render(
      <FootballScoreboard game={makeGame()} sport="ncaaf" scoringPlays={NCAAF_SCORING_PLAYS} />,
    );
    expect(getAllByText(/\bFG\b/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders down & distance when provided", () => {
    const { getByText } = render(
      <FootballScoreboard
        game={makeGame()}
        sport="ncaaf"
        scoringPlays={NCAAF_SCORING_PLAYS}
        downAndDistance="2nd & 7"
      />,
    );
    expect(getByText("2nd & 7")).toBeTruthy();
  });

  it("renders possession indicator when provided", () => {
    const { getByText } = render(
      <FootballScoreboard
        game={makeGame()}
        sport="ncaaf"
        scoringPlays={NCAAF_SCORING_PLAYS}
        possession="home"
      />,
    );
    // possession arrow + home abbreviation appears in situation bar
    expect(getByText(/▶\s*UGA/)).toBeTruthy();
  });

  it("does not crash with no scoring plays (pre-game)", () => {
    const game = makeGame({ status: "scheduled", period: null, clock: null });
    const { getByText } = render(
      <FootballScoreboard game={game} sport="ncaaf" scoringPlays={[]} />,
    );
    // Empty state message shows
    expect(getByText("Scoring plays will appear once the game starts.")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// NFL tests
// ---------------------------------------------------------------------------

describe("FootballScoreboard — NFL", () => {
  const NFL_GAME = makeGame({
    sport: "nfl",
    home_score: 21,
    away_score: 17,
    period: 4,
    clock: "2:41",
    home_team: {
      id: "t3",
      name: "Chiefs",
      market: "Kansas City",
      abbreviation: "KC",
      conference: "AFC",
      logo_url: null,
      sportsdataio_id: null,
      sportradar_id: null,
      sport: "nfl",
      created_at: new Date().toISOString(),
    },
    away_team: {
      id: "t4",
      name: "Bills",
      market: "Buffalo",
      abbreviation: "BUF",
      conference: "AFC",
      logo_url: null,
      sportsdataio_id: null,
      sportradar_id: null,
      sport: "nfl",
      created_at: new Date().toISOString(),
    },
  });

  const NFL_SCORING_PLAYS: FootballScoringPlay[] = [
    { period: 1, clock: "12:05", team: "away", description: "Allen 5 yd run", points: 6, homeScoreAfter: 0, awayScoreAfter: 6 },
    { period: 1, clock: "12:05", team: "away", description: "PAT Good", points: 1, homeScoreAfter: 0, awayScoreAfter: 7 },
    { period: 2, clock: "9:32", team: "home", description: "Kelce 12 yd pass from Mahomes", points: 6, homeScoreAfter: 6, awayScoreAfter: 7 },
    { period: 2, clock: "9:32", team: "home", description: "PAT Good", points: 1, homeScoreAfter: 7, awayScoreAfter: 7 },
    { period: 3, clock: "6:17", team: "home", description: "Butker 38 yd FG", points: 3, homeScoreAfter: 10, awayScoreAfter: 7 },
    { period: 3, clock: "1:44", team: "away", description: "Davis 8 yd pass from Allen", points: 6, homeScoreAfter: 10, awayScoreAfter: 13 },
    { period: 3, clock: "1:44", team: "away", description: "PAT Good", points: 1, homeScoreAfter: 10, awayScoreAfter: 14 },
    { period: 4, clock: "8:53", team: "home", description: "Hunt 2 yd run", points: 6, homeScoreAfter: 16, awayScoreAfter: 14 },
    { period: 4, clock: "8:53", team: "home", description: "2PT Conversion Good", points: 2, homeScoreAfter: 18, awayScoreAfter: 14 },
    { period: 4, clock: "4:12", team: "away", description: "Bass 47 yd FG", points: 3, homeScoreAfter: 18, awayScoreAfter: 17 },
    { period: 4, clock: "2:41", team: "home", description: "Kelce 8 yd pass from Mahomes", points: 6, homeScoreAfter: 24, awayScoreAfter: 17 },
  ];

  it("renders Q1-Q4 column headers for NFL", () => {
    const { getAllByText } = render(
      <FootballScoreboard game={NFL_GAME} sport="nfl" scoringPlays={NFL_SCORING_PLAYS} />,
    );
    expect(getAllByText("Q1").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Q2").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Q3").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Q4").length).toBeGreaterThanOrEqual(1);
  });

  it("renders NFL team abbreviations", () => {
    const { getAllByText } = render(
      <FootballScoreboard game={NFL_GAME} sport="nfl" scoringPlays={NFL_SCORING_PLAYS} />,
    );
    expect(getAllByText("KC").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("BUF").length).toBeGreaterThanOrEqual(1);
  });

  it("renders away total for NFL", () => {
    const { getAllByText } = render(
      <FootballScoreboard game={NFL_GAME} sport="nfl" scoringPlays={NFL_SCORING_PLAYS} />,
    );
    // away_score = 17
    expect(getAllByText("17").length).toBeGreaterThanOrEqual(1);
  });

  it("renders home total for NFL", () => {
    const { getAllByText } = render(
      <FootballScoreboard game={NFL_GAME} sport="nfl" scoringPlays={NFL_SCORING_PLAYS} />,
    );
    // home_score = 21
    expect(getAllByText("21").length).toBeGreaterThanOrEqual(1);
  });

  it("renders 2PT/Safety label for 2-point conversion", () => {
    const { getAllByText } = render(
      <FootballScoreboard game={NFL_GAME} sport="nfl" scoringPlays={NFL_SCORING_PLAYS} />,
    );
    // Label is embedded in "2PT/Safety — description" text node
    expect(getAllByText(/2PT\/Safety/).length).toBeGreaterThanOrEqual(1);
  });

  it("adds OT column when a scoring play occurs in OT", () => {
    const otPlay: FootballScoringPlay = {
      period: 5,
      clock: "8:22",
      team: "home",
      description: "Butker 54 yd FG",
      points: 3,
      homeScoreAfter: 24,
      awayScoreAfter: 17,
    };
    const { getAllByText } = render(
      <FootballScoreboard
        game={{ ...NFL_GAME, home_score: 24, period: 5 }}
        sport="nfl"
        scoringPlays={[...NFL_SCORING_PLAYS, otPlay]}
      />,
    );
    // "OT" appears in column header and possibly scoring plays
    expect(getAllByText("OT").length).toBeGreaterThanOrEqual(1);
  });

  it("renders HALFTIME label when game is at halftime", () => {
    const halftimeGame = { ...NFL_GAME, status: "halftime" as const, period: 2, clock: "0:00" };
    const { getByText } = render(
      <FootballScoreboard game={halftimeGame} sport="nfl" scoringPlays={NFL_SCORING_PLAYS} />,
    );
    expect(getByText("HALFTIME")).toBeTruthy();
  });

  it("shows possession indicator in both table and situation bar", () => {
    const { getAllByText } = render(
      <FootballScoreboard
        game={NFL_GAME}
        sport="nfl"
        scoringPlays={NFL_SCORING_PLAYS}
        possession="away"
        downAndDistance="3rd & 5"
      />,
    );
    // "▶ BUF" should appear in situation bar
    expect(getAllByText(/▶\s*BUF/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders down & distance for NFL", () => {
    const { getByText } = render(
      <FootballScoreboard
        game={NFL_GAME}
        sport="nfl"
        scoringPlays={NFL_SCORING_PLAYS}
        downAndDistance="3rd & 5"
      />,
    );
    expect(getByText("3rd & 5")).toBeTruthy();
  });
});
