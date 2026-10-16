import React from "react";
import { Linking } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { WatchNowButton } from "../WatchNowButton";
import type { Game } from "../../lib/types";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("@expo/vector-icons", () => ({
  Ionicons: (props: Record<string, unknown>) => {
    const { createElement } = require("react");
    const { View } = require("react-native");
    return createElement(View, props);
  },
}));
let mockConnected: string[] = [];
let mockProviders: unknown[] = [];
let mockInstalled: Record<string, boolean> = {};
jest.mock("../../hooks/useConnections", () => ({
  useConnectedProviderKeys: () => mockConnected,
  useStreamingProviders: () => ({ data: mockProviders }),
}));
jest.mock("../../hooks/useInstalledApps", () => ({ useInstalledApps: () => mockInstalled }));
jest.mock("../../lib/analytics", () => ({ trackEvent: jest.fn() }));
jest.mock("../../lib/tap-to-stream-context", () => ({
  useTapToStream: () => ({ triggerStream: jest.fn(), phase: { value: 0 } }),
}));
jest.mock("../../hooks/useTapToStream", () => ({ PHASE_ANTICIPATION: 1, PHASE_COMMITMENT: 2 }));

const game = { id: "g", sport: "nfl", status: "scheduled", broadcast: "Prime Video", title: "SEA at DEN" } as unknown as Game;
const PRIME = {
  key: "prime_video", name: "Prime Video", provider_type: "streaming", logo_url: null, ios_scheme: "aiv://",
  ios_app_store_url: "https://apps.apple.com/app/prime-video/id545519333", android_package: null,
  android_deep_link: null, web_url: "https://www.amazon.com/gp/video/storefront", active: true,
};

afterEach(() => { mockConnected = []; mockProviders = []; mockInstalled = {}; });

it("shows Watch when Prime is connected and installed", () => {
  mockConnected = ["prime_video"]; mockProviders = [PRIME]; mockInstalled = { prime_video: true };
  expect(render(<WatchNowButton game={game} />).getByLabelText("Watch on Prime Video")).toBeTruthy();
});

it("shows Get <Provider> and opens the App Store when not installed", async () => {
  mockConnected = ["prime_video"]; mockProviders = [PRIME]; mockInstalled = { prime_video: false };
  const spy = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
  const { getByLabelText } = render(<WatchNowButton game={game} />);
  fireEvent.press(getByLabelText("Get Prime Video"));
  await waitFor(() => expect(spy).toHaveBeenCalledWith(PRIME.ios_app_store_url));
});

it("unknown install state (android/web) keeps Watch", () => {
  mockConnected = ["prime_video"]; mockProviders = [PRIME]; mockInstalled = {};
  expect(render(<WatchNowButton game={game} />).getByLabelText("Watch on Prime Video")).toBeTruthy();
});
