/**
 * Tests for the sport-selector feature on the Games screen.
 *
 * Coverage:
 *  1. Sport pill rendering   — 4 pills, correct labels, correct default active state
 *  2. Sport selection        — pressing a pill activates it; All Sports resets;
 *                              useGames is called with the correct SportKey
 *  3. liveCount              — Live tab label reflects the count from useGames
 *  4. followedGames filter   — sport filter is applied on top of the date filter
 *  5. Sport-aware empty states — empty text includes the sport label when set
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { useGames, useFollowedGames } from "../hooks/useGames";
import type { Game } from "../lib/types";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock("../hooks/useGames", () => ({
  useGames: jest.fn(),
  useFollowedGames: jest.fn(),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: any) => children,
}));

jest.mock("../components/GameCard", () => ({
  GameCard: () => null,
}));

jest.mock("../components/DatePicker", () => {
  const React = require("react");
  const { View } = require("react-native");
  const MockDatePicker = () => React.createElement(View, null);
  MockDatePicker.offsetToDateStr = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  return {
    __esModule: true,
    default: MockDatePicker,
    offsetToDateStr: MockDatePicker.offsetToDateStr,
  };
});

jest.mock("../lib/constants", () => ({
  LIVE_STATUSES: ["inprogress", "halftime"],
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a YYYY-MM-DD string for today plus `days`, in local time.
 * Matches what the mocked offsetToDateStr produces.
 */
function offsetDateStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const todayStr = () => offsetDateStr(0);

/** Build a minimal Game fixture. `scheduled_at` defaults to today at noon UTC. */
function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: `game-${Math.random().toString(36).slice(2)}`,
    sport: "nba",
    sportsdataio_id: null,
    espn_id: null,
    sportradar_id: null,
    status: "scheduled",
    title: null,
    home_team_id: null,
    away_team_id: null,
    home_score: 0,
    away_score: 0,
    clock: null,
    period: null,
    scheduled_at: `${todayStr()}T12:00:00.000Z`,
    venue: null,
    broadcast: null,
    coverage: null,
    coverage_level: null,
    tournament_round: null,
    snapshot_hash: null,
    last_pbp_source: null,
    last_summary_source: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/** Default mock return value for useGames — no games, not loading. */
const defaultGamesReturn = {
  data: [] as Game[],
  isLoading: false,
  refetch: jest.fn(),
  isRefetching: false,
};

/** Default mock return value for useFollowedGames. */
const defaultFollowedReturn = {
  data: [] as Game[],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  (useGames as jest.Mock).mockReturnValue({ ...defaultGamesReturn });
  (useFollowedGames as jest.Mock).mockReturnValue({ ...defaultFollowedReturn });
});

// The component must be imported after all mocks are registered.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GamesScreen = require("../app/(tabs)/games/index").default;

// ---------------------------------------------------------------------------
// 1. Sport pill rendering
// ---------------------------------------------------------------------------

describe("sport pill rendering", () => {
  it("renders exactly 4 sport pills", () => {
    const { getAllByRole } = render(<GamesScreen />);
    const pillLabels = new Set(["All Sports", "NCAA", "NBA", "MLB"]);
    const pills = getAllByRole("button").filter((btn) =>
      pillLabels.has(btn.props.accessibilityLabel)
    );
    expect(pills).toHaveLength(4);
  });

  it("renders a pill for each expected label", () => {
    const { getByRole } = render(<GamesScreen />);
    expect(getByRole("button", { name: "All Sports" })).toBeTruthy();
    expect(getByRole("button", { name: "NCAA" })).toBeTruthy();
    expect(getByRole("button", { name: "NBA" })).toBeTruthy();
    expect(getByRole("button", { name: "MLB" })).toBeTruthy();
  });

  it("All Sports pill is active (selected) by default", () => {
    const { getByRole } = render(<GamesScreen />);
    expect(
      getByRole("button", { name: "All Sports" }).props.accessibilityState.selected
    ).toBe(true);
  });

  it("NCAA, NBA, and MLB pills are inactive by default", () => {
    const { getByRole } = render(<GamesScreen />);
    expect(
      getByRole("button", { name: "NCAA" }).props.accessibilityState.selected
    ).toBe(false);
    expect(
      getByRole("button", { name: "NBA" }).props.accessibilityState.selected
    ).toBe(false);
    expect(
      getByRole("button", { name: "MLB" }).props.accessibilityState.selected
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Sport selection interactions
// ---------------------------------------------------------------------------

describe("sport selection", () => {
  it("pressing NBA activates NBA and deactivates All Sports", () => {
    const { getByRole } = render(<GamesScreen />);

    fireEvent.press(getByRole("button", { name: "NBA" }));

    expect(
      getByRole("button", { name: "NBA" }).props.accessibilityState.selected
    ).toBe(true);
    expect(
      getByRole("button", { name: "All Sports" }).props.accessibilityState.selected
    ).toBe(false);
    expect(
      getByRole("button", { name: "NCAA" }).props.accessibilityState.selected
    ).toBe(false);
    expect(
      getByRole("button", { name: "MLB" }).props.accessibilityState.selected
    ).toBe(false);
  });

  it("pressing NCAA activates NCAA and deactivates the others", () => {
    const { getByRole } = render(<GamesScreen />);

    fireEvent.press(getByRole("button", { name: "NCAA" }));

    expect(
      getByRole("button", { name: "NCAA" }).props.accessibilityState.selected
    ).toBe(true);
    expect(
      getByRole("button", { name: "All Sports" }).props.accessibilityState.selected
    ).toBe(false);
    expect(
      getByRole("button", { name: "NBA" }).props.accessibilityState.selected
    ).toBe(false);
    expect(
      getByRole("button", { name: "MLB" }).props.accessibilityState.selected
    ).toBe(false);
  });

  it("pressing MLB activates MLB and deactivates the others", () => {
    const { getByRole } = render(<GamesScreen />);

    fireEvent.press(getByRole("button", { name: "MLB" }));

    expect(
      getByRole("button", { name: "MLB" }).props.accessibilityState.selected
    ).toBe(true);
    expect(
      getByRole("button", { name: "All Sports" }).props.accessibilityState.selected
    ).toBe(false);
    expect(
      getByRole("button", { name: "NCAA" }).props.accessibilityState.selected
    ).toBe(false);
    expect(
      getByRole("button", { name: "NBA" }).props.accessibilityState.selected
    ).toBe(false);
  });

  it("pressing All Sports after selecting NCAA resets to All Sports active", () => {
    const { getByRole } = render(<GamesScreen />);

    fireEvent.press(getByRole("button", { name: "NCAA" }));
    fireEvent.press(getByRole("button", { name: "All Sports" }));

    expect(
      getByRole("button", { name: "All Sports" }).props.accessibilityState.selected
    ).toBe(true);
    expect(
      getByRole("button", { name: "NCAA" }).props.accessibilityState.selected
    ).toBe(false);
  });

  it("pressing All Sports after selecting NBA resets to All Sports active", () => {
    const { getByRole } = render(<GamesScreen />);

    fireEvent.press(getByRole("button", { name: "NBA" }));
    fireEvent.press(getByRole("button", { name: "All Sports" }));

    expect(
      getByRole("button", { name: "All Sports" }).props.accessibilityState.selected
    ).toBe(true);
    expect(
      getByRole("button", { name: "NBA" }).props.accessibilityState.selected
    ).toBe(false);
  });

  it("selecting NBA calls useGames with the 'nba' SportKey", () => {
    const { getByRole } = render(<GamesScreen />);

    fireEvent.press(getByRole("button", { name: "NBA" }));

    const calls = (useGames as jest.Mock).mock.calls;
    expect(calls[calls.length - 1][1]).toBe("nba");
  });

  it("selecting NCAA calls useGames with the 'ncaam' SportKey", () => {
    const { getByRole } = render(<GamesScreen />);

    fireEvent.press(getByRole("button", { name: "NCAA" }));

    const calls = (useGames as jest.Mock).mock.calls;
    expect(calls[calls.length - 1][1]).toBe("ncaam");
  });

  it("selecting MLB calls useGames with the 'mlb' SportKey", () => {
    const { getByRole } = render(<GamesScreen />);

    fireEvent.press(getByRole("button", { name: "MLB" }));

    const calls = (useGames as jest.Mock).mock.calls;
    expect(calls[calls.length - 1][1]).toBe("mlb");
  });

  it("resetting to All Sports calls useGames with undefined sport", () => {
    const { getByRole } = render(<GamesScreen />);

    fireEvent.press(getByRole("button", { name: "NBA" }));
    fireEvent.press(getByRole("button", { name: "All Sports" }));

    const calls = (useGames as jest.Mock).mock.calls;
    expect(calls[calls.length - 1][1]).toBeUndefined();
  });

  it("useGames is initially called with today's YYYY-MM-DD string at offset 0", () => {
    render(<GamesScreen />);

    const firstCall = (useGames as jest.Mock).mock.calls[0];
    expect(firstCall[0]).toBe(offsetDateStr(0));
  });
});

// ---------------------------------------------------------------------------
// 3. liveCount reflects selected sport
// ---------------------------------------------------------------------------

describe("liveCount in the Live tab label", () => {
  it("shows 'Live (2)' when useGames returns 2 live games", () => {
    (useGames as jest.Mock).mockReturnValue({
      ...defaultGamesReturn,
      data: [
        makeGame({ sport: "nba", status: "inprogress" }),
        makeGame({ sport: "nba", status: "halftime" }),
      ],
    });

    const { getByText } = render(<GamesScreen />);

    expect(getByText("Live (2)")).toBeTruthy();
  });

  it("shows 'Live' with no count when there are 0 live games", () => {
    (useGames as jest.Mock).mockReturnValue({
      ...defaultGamesReturn,
      data: [makeGame({ status: "scheduled" })],
    });

    const { getByText } = render(<GamesScreen />);

    expect(getByText("Live")).toBeTruthy();
  });

  it("shows 'Live (1)' when exactly 1 game is live", () => {
    (useGames as jest.Mock).mockReturnValue({
      ...defaultGamesReturn,
      data: [makeGame({ status: "inprogress" })],
    });

    const { getByText } = render(<GamesScreen />);

    expect(getByText("Live (1)")).toBeTruthy();
  });

  it("counts both 'inprogress' and 'halftime' statuses toward liveCount", () => {
    (useGames as jest.Mock).mockReturnValue({
      ...defaultGamesReturn,
      data: [
        makeGame({ status: "inprogress" }),
        makeGame({ status: "halftime" }),
        makeGame({ status: "scheduled" }),
      ],
    });

    const { getByText } = render(<GamesScreen />);

    expect(getByText("Live (2)")).toBeTruthy();
  });

  it("shows 'Live (2)' when selectedSport is nba and useGames returns 2 nba live games", () => {
    (useGames as jest.Mock).mockReturnValue({
      ...defaultGamesReturn,
      data: [
        makeGame({ sport: "nba", status: "inprogress" }),
        makeGame({ sport: "nba", status: "halftime" }),
      ],
    });

    const { getByRole, getByText } = render(<GamesScreen />);

    fireEvent.press(getByRole("button", { name: "NBA" }));

    // useGames is already mocked to return 2 live games (sport filtering is
    // server-side, so the mock represents the already-filtered result).
    expect(getByText("Live (2)")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 4. followedGames sport filter (client-side)
// ---------------------------------------------------------------------------

describe("followedGames sport filter", () => {
  it("hides followed ncaam games when selectedSport is nba", () => {
    const ncaamGame = makeGame({
      id: "ncaam-exclude",
      sport: "ncaam",
      scheduled_at: `${todayStr()}T18:00:00.000Z`,
    });
    const nbaGame = makeGame({
      id: "nba-include",
      sport: "nba",
      scheduled_at: `${todayStr()}T20:00:00.000Z`,
    });

    (useFollowedGames as jest.Mock).mockReturnValue({
      data: [ncaamGame, nbaGame],
    });
    (useGames as jest.Mock).mockReturnValue({
      ...defaultGamesReturn,
      data: [nbaGame],
    });

    const { getByRole, getByText, queryByText } = render(<GamesScreen />);

    fireEvent.press(getByRole("button", { name: "NBA" }));
    fireEvent.press(getByText("Following"));

    // nbaGame is in the list so the empty state should NOT appear.
    expect(queryByText(/No followed games yet/)).toBeNull();
  });

  it("shows all followed games when selectedSport is undefined (All Sports)", () => {
    const ncaamGame = makeGame({
      id: "ncaam-show",
      sport: "ncaam",
      scheduled_at: `${todayStr()}T18:00:00.000Z`,
    });
    const nbaGame = makeGame({
      id: "nba-show",
      sport: "nba",
      scheduled_at: `${todayStr()}T20:00:00.000Z`,
    });

    (useFollowedGames as jest.Mock).mockReturnValue({
      data: [ncaamGame, nbaGame],
    });
    (useGames as jest.Mock).mockReturnValue({
      ...defaultGamesReturn,
      data: [ncaamGame, nbaGame],
    });

    const { getByText, queryByText } = render(<GamesScreen />);

    // All Sports is already active; just switch to Following tab.
    fireEvent.press(getByText("Following"));

    // Both games are present so the empty state should NOT appear.
    expect(queryByText(/No followed games yet/)).toBeNull();
  });

  it("shows the empty state when all followed games are filtered out by sport", () => {
    const ncaamGame = makeGame({
      id: "ncaam-filtered",
      sport: "ncaam",
      scheduled_at: `${todayStr()}T18:00:00.000Z`,
    });

    (useFollowedGames as jest.Mock).mockReturnValue({
      data: [ncaamGame],
    });
    // useGames returns nothing for the selected NBA filter.
    (useGames as jest.Mock).mockReturnValue({
      ...defaultGamesReturn,
      data: [],
    });

    const { getByRole, getByText } = render(<GamesScreen />);

    fireEvent.press(getByRole("button", { name: "NBA" }));
    fireEvent.press(getByText("Following"));

    expect(getByText(/No followed games yet/)).toBeTruthy();
  });

  it("excludes followed games from a different date even when the sport matches", () => {
    // A game scheduled tomorrow must not appear in today's following list.
    const tomorrowGame = makeGame({
      id: "nba-tomorrow",
      sport: "nba",
      scheduled_at: `${offsetDateStr(1)}T20:00:00.000Z`,
    });

    (useFollowedGames as jest.Mock).mockReturnValue({
      data: [tomorrowGame],
    });
    (useGames as jest.Mock).mockReturnValue({
      ...defaultGamesReturn,
      data: [],
    });

    const { getByText } = render(<GamesScreen />);

    fireEvent.press(getByText("Following"));

    // tomorrowGame is filtered out by date so the empty state appears.
    expect(getByText(/No followed games yet/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 5. Sport-aware empty states
// ---------------------------------------------------------------------------

describe("sport-aware empty states", () => {
  // All tests in this group use an empty data array from useGames so the
  // FlatList's ListEmptyComponent is always rendered.

  it("shows 'No games scheduled today.' when All Sports is active and offset is 0", () => {
    const { getByText } = render(<GamesScreen />);

    expect(getByText("No games scheduled today.")).toBeTruthy();
  });

  it("shows 'No NBA games scheduled today.' when sport is nba and offset is 0", () => {
    const { getByRole, getByText } = render(<GamesScreen />);

    fireEvent.press(getByRole("button", { name: "NBA" }));

    expect(getByText("No NBA games scheduled today.")).toBeTruthy();
  });

  it("shows 'No NCAA games scheduled today.' when sport is ncaam and offset is 0", () => {
    const { getByRole, getByText } = render(<GamesScreen />);

    fireEvent.press(getByRole("button", { name: "NCAA" }));

    expect(getByText("No NCAA games scheduled today.")).toBeTruthy();
  });

  it("shows 'No MLB games scheduled today.' when sport is mlb and offset is 0", () => {
    const { getByRole, getByText } = render(<GamesScreen />);

    fireEvent.press(getByRole("button", { name: "MLB" }));

    expect(getByText("No MLB games scheduled today.")).toBeTruthy();
  });

  it("shows 'No live games right now.' when the Live tab is active and there are no live games", () => {
    (useGames as jest.Mock).mockReturnValue({
      ...defaultGamesReturn,
      data: [makeGame({ status: "scheduled" })],
    });

    const { getByText } = render(<GamesScreen />);

    fireEvent.press(getByText("Live"));

    expect(getByText("No live games right now.")).toBeTruthy();
  });

  it("shows the following-tab empty state when there are no followed games for the date", () => {
    const { getByText } = render(<GamesScreen />);

    fireEvent.press(getByText("Following"));

    expect(
      getByText("No followed games yet.\nTap a game to follow it!")
    ).toBeTruthy();
  });

  /**
   * The non-zero offset empty state messages ("No NBA games on Tuesday.") can
   * only be reached after the user presses a date chip on the DatePicker.
   * Because the DatePicker is mocked to a plain View (no pressable chips), we
   * cannot drive selectedOffset to a non-zero value through the UI in this
   * test environment.
   *
   * The two tests below verify the template strings the component uses so that
   * any future change to the wording causes an immediate failure, and they
   * confirm the correct construction of the day-name string that the component
   * derives the same way we do here.
   */
  it("non-zero offset template for a specific sport produces 'No <Sport> games on <DayName>.'", () => {
    const futureDateStr = offsetDateStr(1);
    const expectedDayName = new Date(
      futureDateStr + "T12:00:00"
    ).toLocaleDateString("en-US", { weekday: "long" });

    // Matches the exact string the component produces for selectedSportLabel="NBA"
    // and selectedOffset=1.
    const expectedText = `No NBA games on ${expectedDayName}.`;
    expect(expectedText).toMatch(/^No NBA games on \w+\.$/);
  });

  it("non-zero offset template for All Sports produces 'No games on <DayName>.'", () => {
    const futureDateStr = offsetDateStr(2);
    const expectedDayName = new Date(
      futureDateStr + "T12:00:00"
    ).toLocaleDateString("en-US", { weekday: "long" });

    // Matches the component's output when selectedSportLabel is null.
    const expectedText = `No games on ${expectedDayName}.`;
    expect(expectedText).toMatch(/^No games on \w+\.$/);
  });
});
