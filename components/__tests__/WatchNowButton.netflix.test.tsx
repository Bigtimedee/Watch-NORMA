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

let mockConnected: string[] = [];
let mockProviders: unknown[] = [];
jest.mock("../../hooks/useConnections", () => ({
  useConnectedProviderKeys: () => mockConnected,
  useStreamingProviders: () => ({ data: mockProviders }),
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

const NETFLIX = {
  key: "netflix", name: "Netflix", provider_type: "streaming", logo_url: null,
  ios_scheme: "nflx://", ios_app_store_url: "https://apps.apple.com/app/netflix/id363590051",
  android_package: null, android_deep_link: null, web_url: "https://www.netflix.com",
  active: true, universal_link: "https://www.netflix.com/",
  fallback_store_url: "https://apps.apple.com/app/netflix/id363590051",
  auth_mode: "deep_link_only", category: "streaming",
};

afterEach(() => { mockConnected = []; mockProviders = []; });

it("connected Netflix user sees 'Watch on Netflix' for a Netflix game", () => {
  mockConnected = ["netflix"];
  mockProviders = [NETFLIX];
  const { getByLabelText } = render(<WatchNowButton game={makeGame({ broadcast: "Netflix", status: "scheduled" })} />);
  expect(getByLabelText("Watch on Netflix")).toBeTruthy();
});

it("non-connected user sees the 'On Netflix' info button", () => {
  mockProviders = [NETFLIX];
  const { getByLabelText } = render(<WatchNowButton game={makeGame({ broadcast: "Netflix", status: "scheduled" })} />);
  expect(getByLabelText("On Netflix")).toBeTruthy();
});
