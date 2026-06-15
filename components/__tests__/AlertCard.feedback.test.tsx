import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { AlertCard } from "../AlertCard";
import type { Alert } from "../../lib/types";
import { useSubmitAlertFeedback } from "../../hooks/useAlertFeedback";

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name, ...props }: { name: string; [k: string]: unknown }) => {
    const { createElement } = require("react");
    const { View } = require("react-native");
    return createElement(View, { testID: `icon-${name}`, ...props });
  },
}));

jest.mock("../../hooks/useAlerts", () => ({
  useMarkAlertRead: () => ({ mutate: jest.fn() }),
}));

jest.mock("../../hooks/useConnections", () => ({
  useConnectedProviderKeys: () => [],
  useStreamingProviders: () => ({ data: [] }),
}));

jest.mock("../../lib/tap-to-stream-context", () => ({
  useTapToStream: () => ({ triggerStream: jest.fn() }),
}));

jest.mock("../../lib/sport-context", () => ({
  SPORT_LABELS: { ncaam: "NCAAM", nba: "NBA", mlb: "MLB" },
}));

const mockMutate = jest.fn();
jest.mock("../../hooks/useAlertFeedback", () => ({
  useSubmitAlertFeedback: jest.fn(() => ({
    mutate: mockMutate,
    isSuccess: false,
    isError: false,
  })),
}));

// ─── Fixture ─────────────────────────────────────────────────────────────────

const ALERT: Alert = {
  id: 100,
  user_id: "u1",
  game_id: "g1",
  alert_type: "close_game",
  title: "Test Alert",
  body: "Game is close",
  read: false,
  push_sent: false,
  created_at: new Date().toISOString(),
  sport: "ncaam",
  score: null,
  explanation: null,
  suppressed_reason: null,
  sponsor_bid_id: null,
  sponsor_text: null,
  sponsor_logo_url: null,
  sponsor_cta_url: null,
  clearing_price_cents: null,
  why: null,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockMutate.mockClear();
  (useSubmitAlertFeedback as jest.Mock).mockReturnValue({
    mutate: mockMutate,
    isSuccess: false,
    isError: false,
  });
});

it("renders thumbs-up and thumbs-down feedback buttons", () => {
  const { getByLabelText } = render(<AlertCard alert={ALERT} />);
  expect(getByLabelText("Alert was useful")).toBeTruthy();
  expect(getByLabelText("Alert was not useful")).toBeTruthy();
});

it("pressing thumbs-up calls mutate with rating=up", () => {
  const { getByLabelText } = render(<AlertCard alert={ALERT} />);
  fireEvent.press(getByLabelText("Alert was useful"));
  expect(mockMutate).toHaveBeenCalledWith({ alertId: 100, rating: "up" });
});

it("pressing thumbs-down calls mutate with rating=down", () => {
  const { getByLabelText } = render(<AlertCard alert={ALERT} />);
  fireEvent.press(getByLabelText("Alert was not useful"));
  expect(mockMutate).toHaveBeenCalledWith({ alertId: 100, rating: "down" });
});

it("pressing the active rating again deselects it without re-mutating", () => {
  const { getByLabelText } = render(<AlertCard alert={ALERT} />);
  fireEvent.press(getByLabelText("Alert was useful")); // select up
  expect(mockMutate).toHaveBeenCalledTimes(1);
  fireEvent.press(getByLabelText("Alert was useful")); // deselect — no mutate
  expect(mockMutate).toHaveBeenCalledTimes(1);
});

it("switching from up to down fires mutate with down", () => {
  const { getByLabelText } = render(<AlertCard alert={ALERT} />);
  fireEvent.press(getByLabelText("Alert was useful"));   // up
  fireEvent.press(getByLabelText("Alert was not useful")); // down
  expect(mockMutate).toHaveBeenNthCalledWith(1, { alertId: 100, rating: "up" });
  expect(mockMutate).toHaveBeenNthCalledWith(2, { alertId: 100, rating: "down" });
});
