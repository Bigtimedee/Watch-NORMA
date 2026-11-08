/**
 * Characterization of the shared tap-to-stream engine.
 * Maps to the Expo web fixture run where the second Watch tap emitted no URL.
 * These are mocks. They are not a device or VoiceOver check.
 *
 * The color pilot does not edit this hook. The same file blob is on
 * 3e5fe42 and 93cc1a9.
 */

import { renderHook, act } from "@testing-library/react-native";
import { useTapToStreamEngine, PHASE_IDLE } from "../useTapToStream";
import { openStreamingApp } from "../../lib/deep-links";

jest.mock("react-native-reanimated", () => {
  const { useRef } = require("react");
  return {
    useSharedValue: (init: number) => {
      const ref = useRef({ value: init });
      return ref.current;
    },
    withTiming: (to: number) => to,
    withDelay: (_ms: number, value: unknown) => value,
    Easing: { bezier: () => (t: number) => t },
    runOnJS: (fn: unknown) => fn,
  };
});

jest.mock("../../lib/deep-links", () => ({
  resolveDeepLinkUrl: jest.fn(async () => ({
    url: "https://tv.youtube.com/",
    method: "universal_link",
    level: "app_universal",
  })),
  openStreamingApp: jest.fn(async () => ({
    opened: true,
    fallback: true,
    method: "universal_link",
    level: "app_universal",
  })),
}));

jest.mock("../../lib/review-prompt", () => ({ maybeRequestReview: jest.fn() }));
jest.mock("../../lib/store-links", () => ({ storeName: () => "App Store" }));

const provider = {
  key: "youtube_tv",
  name: "YouTube TV",
  provider_type: "tv" as const,
  logo_url: null,
  ios_scheme: "youtube-tv://",
  ios_app_store_url: null,
  android_package: null,
  android_deep_link: null,
  web_url: "https://tv.youtube.com/",
  active: true,
  universal_link: "https://tv.youtube.com/",
};

const openMock = openStreamingApp as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  openMock.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

async function flushLaunch() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(450 + 180 + 420);
  });
}

it("opens the stream once after the anticipation, commitment, and collapse delays", async () => {
  const { result } = renderHook(() => useTapToStreamEngine());
  await act(async () => {
    await result.current.triggerStream(provider, {
      game: { sport: "ncaaf", espnEventId: "9000001" },
    });
  });
  expect(openMock).not.toHaveBeenCalled();
  await flushLaunch();
  expect(openMock).toHaveBeenCalledTimes(1);
  expect(openMock.mock.calls[0][0].key).toBe("youtube_tv");
});

it("ignores a second trigger until the engine returns to idle", async () => {
  const { result } = renderHook(() => useTapToStreamEngine());
  await act(async () => {
    await result.current.triggerStream(provider);
  });
  await flushLaunch();
  expect(openMock).toHaveBeenCalledTimes(1);

  await act(async () => {
    await result.current.triggerStream(provider);
    await jest.advanceTimersByTimeAsync(2000);
  });
  expect(openMock).toHaveBeenCalledTimes(1);
  expect(result.current.phase.value).not.toBe(PHASE_IDLE);

  await act(async () => {
    await jest.advanceTimersByTimeAsync(5000);
  });
  expect(result.current.phase.value).toBe(PHASE_IDLE);

  await act(async () => {
    await result.current.triggerStream(provider);
  });
  await flushLaunch();
  expect(openMock).toHaveBeenCalledTimes(2);
});
