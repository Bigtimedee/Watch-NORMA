import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { Share } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AlertCard, FOOTBALL_SHARE_NUDGE_KEY } from "../AlertCard";
import type { Alert } from "../../lib/types";

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
  SPORT_LABELS: {
    ncaam: "NCAAM",
    nba: "NBA",
    mlb: "MLB",
    ncaaf: "NCAAF",
    nfl: "NFL",
  },
}));

jest.mock("../../hooks/useAlertFeedback", () => ({
  useSubmitAlertFeedback: jest.fn(() => ({
    mutate: jest.fn(),
    isSuccess: false,
    isError: false,
  })),
}));

jest.mock("../../lib/analytics", () => ({
  trackEvent: jest.fn(),
}));

jest.mock("../../lib/review-prompt", () => ({
  maybeRequestReview: jest.fn(),
}));

jest.mock("../../lib/deep-links", () => ({
  getBestWatchProvider: jest.fn(() => null),
}));

jest.mock("react-native-view-shot", () => ({
  captureRef: jest.fn().mockResolvedValue("file:///mock.jpg"),
}));

jest.mock("../../components/SponsorCTAButton", () => ({
  SponsorCTAButton: () => null,
}));

jest.mock("../../components/MomentShareCard", () => ({
  MomentShareCard: () => null,
}));

jest.mock("../../lib/formatShareCard", () => ({
  formatAlertShareCard: jest.fn(() => ({})),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 1,
    user_id: "u1",
    game_id: "g1",
    alert_type: "football_close_game",
    title: "Auburn vs Alabama",
    body: "This game is close!",
    read: false,
    push_sent: false,
    created_at: new Date().toISOString(),
    sport: "ncaaf",
    score: null,
    explanation: null,
    suppressed_reason: null,
    sponsor_bid_id: null,
    sponsor_text: null,
    sponsor_logo_url: null,
    sponsor_cta_url: null,
    clearing_price_cents: null,
    why: null,
    ...overrides,
  };
}

const FOOTBALL_NCAAF_ALERT = makeAlert({ sport: "ncaaf" });
const FOOTBALL_NFL_ALERT = makeAlert({
  sport: "nfl",
  alert_type: "football_two_minute",
  title: "Chiefs vs Bills",
});
const BASKETBALL_ALERT = makeAlert({
  sport: "ncaam",
  alert_type: "close_game",
  title: "Duke vs UNC",
});
const MLB_ALERT = makeAlert({
  sport: "mlb",
  alert_type: "follow_alert",
  title: "Yankees vs Red Sox",
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

function resetAsyncStorage() {
  mockAsyncStorage.getItem.mockResolvedValue(null);
  mockAsyncStorage.setItem.mockResolvedValue(undefined);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  resetAsyncStorage();
});

describe("Football share nudge — appearance", () => {
  it("shows the nudge for an NCAAF alert when the flag is not set", async () => {
    mockAsyncStorage.getItem.mockResolvedValue(null);
    const { findByTestId } = render(<AlertCard alert={FOOTBALL_NCAAF_ALERT} />);
    expect(await findByTestId("football-share-nudge")).toBeTruthy();
  });

  it("shows the nudge for an NFL alert when the flag is not set", async () => {
    mockAsyncStorage.getItem.mockResolvedValue(null);
    const { findByTestId } = render(<AlertCard alert={FOOTBALL_NFL_ALERT} />);
    expect(await findByTestId("football-share-nudge")).toBeTruthy();
  });

  it("does NOT show the nudge for a basketball alert", async () => {
    mockAsyncStorage.getItem.mockResolvedValue(null);
    const { queryByTestId } = render(<AlertCard alert={BASKETBALL_ALERT} />);
    // Wait a tick for any async effects
    await act(async () => {});
    expect(queryByTestId("football-share-nudge")).toBeNull();
  });

  it("does NOT show the nudge for an MLB alert", async () => {
    mockAsyncStorage.getItem.mockResolvedValue(null);
    const { queryByTestId } = render(<AlertCard alert={MLB_ALERT} />);
    await act(async () => {});
    expect(queryByTestId("football-share-nudge")).toBeNull();
  });

  it("does NOT show the nudge for an NCAAF alert when the flag is already set", async () => {
    mockAsyncStorage.getItem.mockResolvedValue("1");
    const { queryByTestId } = render(<AlertCard alert={FOOTBALL_NCAAF_ALERT} />);
    await act(async () => {});
    expect(queryByTestId("football-share-nudge")).toBeNull();
  });
});

describe("Football share nudge — share action", () => {
  it("calls Share.share when the share button is tapped", async () => {
    const shareSpy = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: Share.sharedAction });
    mockAsyncStorage.getItem.mockResolvedValue(null);

    const { findByTestId } = render(<AlertCard alert={FOOTBALL_NCAAF_ALERT} />);
    const shareBtn = await findByTestId("football-share-nudge-btn");

    await act(async () => {
      fireEvent.press(shareBtn);
    });

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const shareArg = shareSpy.mock.calls[0][0];
    expect(shareArg.message).toContain("NORMA alert");
    expect(shareArg.message).toContain(FOOTBALL_NCAAF_ALERT.title);
  });

  it("sets the AsyncStorage flag after sharing", async () => {
    jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: Share.sharedAction });
    mockAsyncStorage.getItem.mockResolvedValue(null);

    const { findByTestId } = render(<AlertCard alert={FOOTBALL_NCAAF_ALERT} />);
    const shareBtn = await findByTestId("football-share-nudge-btn");

    await act(async () => {
      fireEvent.press(shareBtn);
    });

    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
      FOOTBALL_SHARE_NUDGE_KEY,
      "1"
    );
  });

  it("hides the nudge after sharing", async () => {
    jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: Share.sharedAction });
    mockAsyncStorage.getItem.mockResolvedValue(null);

    const { findByTestId, queryByTestId } = render(
      <AlertCard alert={FOOTBALL_NCAAF_ALERT} />
    );
    const shareBtn = await findByTestId("football-share-nudge-btn");

    await act(async () => {
      fireEvent.press(shareBtn);
    });

    await waitFor(() => {
      expect(queryByTestId("football-share-nudge")).toBeNull();
    });
  });

  it("sets the AsyncStorage flag even when Share.share is dismissed", async () => {
    jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: Share.dismissedAction });
    mockAsyncStorage.getItem.mockResolvedValue(null);

    const { findByTestId } = render(<AlertCard alert={FOOTBALL_NCAAF_ALERT} />);
    const shareBtn = await findByTestId("football-share-nudge-btn");

    await act(async () => {
      fireEvent.press(shareBtn);
    });

    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
      FOOTBALL_SHARE_NUDGE_KEY,
      "1"
    );
  });
});

describe("Football share nudge — dismiss action", () => {
  it("hides the nudge when dismissed without sharing", async () => {
    mockAsyncStorage.getItem.mockResolvedValue(null);
    const { findByTestId, queryByTestId } = render(
      <AlertCard alert={FOOTBALL_NCAAF_ALERT} />
    );
    const dismissBtn = await findByTestId("football-share-nudge-dismiss");

    await act(async () => {
      fireEvent.press(dismissBtn);
    });

    await waitFor(() => {
      expect(queryByTestId("football-share-nudge")).toBeNull();
    });
  });

  it("sets the AsyncStorage flag when dismissed without sharing", async () => {
    mockAsyncStorage.getItem.mockResolvedValue(null);
    const { findByTestId } = render(<AlertCard alert={FOOTBALL_NCAAF_ALERT} />);
    const dismissBtn = await findByTestId("football-share-nudge-dismiss");

    await act(async () => {
      fireEvent.press(dismissBtn);
    });

    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
      FOOTBALL_SHARE_NUDGE_KEY,
      "1"
    );
  });

  it("does NOT call Share.share when dismissed", async () => {
    const shareSpy = jest.spyOn(Share, "share");
    mockAsyncStorage.getItem.mockResolvedValue(null);

    const { findByTestId } = render(<AlertCard alert={FOOTBALL_NCAAF_ALERT} />);
    const dismissBtn = await findByTestId("football-share-nudge-dismiss");

    await act(async () => {
      fireEvent.press(dismissBtn);
    });

    expect(shareSpy).not.toHaveBeenCalled();
  });
});
