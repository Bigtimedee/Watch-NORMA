import React from "react";
import { render } from "@testing-library/react-native";
import { WatchNowButton } from "../WatchNowButton";
import type { Game } from "../../lib/types";

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name, ...props }: { name: string; [k: string]: unknown }) => {
    const { createElement } = require("react");
    const { View } = require("react-native");
    return createElement(View, { testID: `icon-${name}`, ...props });
  },
}));

jest.mock("../../hooks/useConnections", () => ({
  useConnectedProviderKeys: () => [],
  useStreamingProviders: () => ({ data: [] }),
}));

jest.mock("../../lib/tap-to-stream-context", () => ({
  useTapToStream: () => ({
    triggerStream: jest.fn(),
    phase: { value: 0 },
  }),
}));

jest.mock("../../hooks/useTapToStream", () => ({
  PHASE_ANTICIPATION: 1,
  PHASE_COMMITMENT: 2,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "g1",
    sport: "nba",
    home_team_id: "t1",
    away_team_id: "t2",
    status: "inprogress",
    home_score: 55,
    away_score: 52,
    clock: "8:32",
    period: 3,
    scheduled_at: new Date().toISOString(),
    broadcast: "ESPN",
    venue: null,
    title: "Team A at Team B",
    source: "espn",
    payload_hash: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    home_team: null,
    away_team: null,
    ...overrides,
  } as Game;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

it("shows 'Broadcast TBD' when broadcast is null and game is live", () => {
  const game = makeGame({ broadcast: null, status: "inprogress" });
  const { getByText } = render(<WatchNowButton game={game} />);
  expect(getByText("Broadcast TBD")).toBeTruthy();
});

it("shows blackout caveat for regional broadcast (Bally Sports Ohio)", () => {
  const game = makeGame({ broadcast: "Bally Sports Ohio", status: "inprogress" });
  const { getByTestId } = render(<WatchNowButton game={game} />);
  expect(getByTestId("blackout-caveat")).toBeTruthy();
});

it("does NOT show blackout caveat for national broadcast (ESPN)", () => {
  const game = makeGame({ broadcast: "ESPN", status: "inprogress" });
  const { queryByTestId } = render(<WatchNowButton game={game} />);
  expect(queryByTestId("blackout-caveat")).toBeNull();
});
