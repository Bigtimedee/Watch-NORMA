/**
 * Mocked Alert card routing. Not a native runtime check.
 * The Watch control calls the shared stream engine. The card body routes
 * to the game. Sportsbook text is not part of the Why Now fixture.
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { AlertCard } from "../AlertCard";
import type { Alert, Game } from "../../lib/types";

const mockTriggerStream = jest.fn();
const mockPush = jest.fn();

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("../../hooks/useAlerts", () => ({
  useMarkAlertRead: () => ({ mutate: jest.fn() }),
}));

jest.mock("../../hooks/useConnections", () => ({
  useConnectedProviderKeys: () => ["youtube_tv"],
  useStreamingProviders: () => ({
    data: [
      {
        key: "youtube_tv",
        name: "YouTube TV",
        provider_type: "tv",
        logo_url: null,
        ios_scheme: "youtube-tv://",
        ios_app_store_url: null,
        android_package: null,
        android_deep_link: null,
        web_url: "https://tv.youtube.com/",
        active: true,
        universal_link: "https://tv.youtube.com/",
      },
    ],
  }),
}));

jest.mock("../../lib/tap-to-stream-context", () => ({
  useTapToStream: () => ({ triggerStream: mockTriggerStream, phase: { value: 0 } }),
}));

jest.mock("../../lib/sport-context", () => ({
  SPORT_LABELS: { ncaaf: "NCAAF", ncaam: "NCAAM", nba: "NBA", mlb: "MLB", nfl: "NFL" },
}));

jest.mock("../../hooks/useAlertFeedback", () => ({
  useSubmitAlertFeedback: () => ({ mutate: jest.fn() }),
}));

jest.mock("../../lib/analytics", () => ({ trackEvent: jest.fn() }));
jest.mock("../../lib/review-prompt", () => ({ maybeRequestReview: jest.fn() }));

const game = {
  id: "fixture-local-ncaaf-1",
  sport: "ncaaf",
  status: "inprogress",
  broadcast: "ESPN",
  title: "LOCAL FIXTURE — not a live game",
  home_score: 21,
  away_score: 18,
  scheduled_at: "2026-11-07T21:00:00.000Z",
} as Game;

const alert = {
  id: 8001,
  user_id: "11111111-1111-1111-1111-111111111111",
  game_id: game.id,
  sport: "ncaaf",
  alert_type: "spread_alert",
  title: "LOCAL FIXTURE alert",
  body: "Fixture Away Lions trail by 3",
  why: null,
  push_sent: false,
  read: true,
  created_at: "2026-11-07T21:30:00.000Z",
  score: 55,
  explanation: {
    headline: "Your Spread Is Live",
    bullets: ["Fixture Away Lions trail by 3 with 4:12 left"],
    stats_used: {},
    confidence: 0.8,
    wager_impact: {
      wager_id: 9001,
      wager_description: "Fixture Away Lions +3.5",
      status: "at_risk",
    },
  },
  suppressed_reason: null,
  sponsor_bid_id: null,
  sponsor_text: null,
  sponsor_logo_url: null,
  sponsor_cta_url: null,
  clearing_price_cents: null,
  game,
} as Alert;

beforeEach(() => {
  mockTriggerStream.mockClear();
  mockPush.mockClear();
});

it("Watch calls the stream engine with YouTube TV and does not print the sportsbook", () => {
  const { getByLabelText, queryByText, getByText } = render(<AlertCard alert={alert} />);
  expect(getByText("Your Spread Is Live")).toBeTruthy();
  expect(queryByText(/draftkings/i)).toBeNull();
  fireEvent.press(getByLabelText("Watch on YouTube TV"));
  expect(mockTriggerStream).toHaveBeenCalledTimes(1);
  expect(mockTriggerStream.mock.calls[0][0].key).toBe("youtube_tv");
  expect(mockTriggerStream.mock.calls[0][0].universal_link).toBe("https://tv.youtube.com/");
});

it("pressing the card routes to the fixture game", () => {
  const { getByLabelText } = render(<AlertCard alert={alert} />);
  fireEvent.press(getByLabelText("Spread: LOCAL FIXTURE alert"));
  expect(mockPush).toHaveBeenCalledWith("/games/fixture-local-ncaaf-1");
});
