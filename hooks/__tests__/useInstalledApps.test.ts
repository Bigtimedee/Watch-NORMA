import { AppState, Linking, Platform } from "react-native";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { useInstalledApps, __resetInstalledAppsCache } from "../useInstalledApps";

const PRIME = { key: "prime_video", name: "Prime Video", ios_scheme: "aiv://" } as any;

beforeEach(() => { __resetInstalledAppsCache(); (Platform as any).OS = "ios"; });

it("caches canOpenURL results and refreshes on foreground", async () => {
  let installed = false;
  jest.spyOn(Linking, "canOpenURL").mockImplementation(async () => installed);
  let handler: ((s: string) => void) | undefined;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_e: any, h: any) => { handler = h; return { remove: jest.fn() } as any; });
  const { result } = renderHook(() => useInstalledApps([PRIME]));
  await waitFor(() => expect(result.current).toEqual({ prime_video: false }));
  installed = true;
  await act(async () => { handler?.("active"); });
  await waitFor(() => expect(result.current).toEqual({ prime_video: true }));
});
