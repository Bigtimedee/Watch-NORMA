/**
 * Mocked push-primer outcomes. Not an iOS permission sheet.
 * requestPermissionsAsync is replaced; nothing is sent to Expo or Supabase.
 * There is no client scheduleNotification API in this screen.
 */

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import PushPrimerScreen from "../push-primer";
import { supabase } from "../../lib/supabase";

const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    push: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({ game: "FAL at FHT" }),
}));

const requestPermissionsAsync = Notifications.requestPermissionsAsync as jest.Mock;
const getExpoPushTokenAsync = Notifications.getExpoPushTokenAsync as jest.Mock;

beforeEach(() => {
  mockBack.mockClear();
  mockReplace.mockClear();
  requestPermissionsAsync.mockReset();
  getExpoPushTokenAsync.mockReset();
  getExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[mock]" });
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: "11111111-1111-1111-1111-111111111111" } },
  });
  (supabase.from as jest.Mock).mockImplementation(() => ({
    insert: jest.fn().mockResolvedValue({ error: null }),
    update: jest.fn(() => ({
      eq: jest.fn().mockResolvedValue({ error: null }),
    })),
  }));
});

function profileUpdates(): unknown[] {
  return (supabase.from as jest.Mock).mock.calls
    .filter((call) => call[0] === "profiles");
}

it("Not now leaves without asking for permission or a push token", async () => {
  const { getByLabelText } = render(<PushPrimerScreen />);
  fireEvent.press(getByLabelText("Not now"));
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
  expect(requestPermissionsAsync).not.toHaveBeenCalled();
  expect(getExpoPushTokenAsync).not.toHaveBeenCalled();
  expect(profileUpdates()).toEqual([]);
});

it("a denied permission does not fetch a token or write a profile", async () => {
  requestPermissionsAsync.mockResolvedValue({ status: "denied" });
  const { getByLabelText } = render(<PushPrimerScreen />);
  fireEvent.press(getByLabelText("Turn on alerts"));
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
  expect(getExpoPushTokenAsync).not.toHaveBeenCalled();
  expect(profileUpdates()).toEqual([]);
});

it("a granted permission asks for a mock token and writes that token only", async () => {
  requestPermissionsAsync.mockResolvedValue({ status: "granted" });
  const eq = jest.fn().mockResolvedValue({ error: null });
  const update = jest.fn(() => ({ eq }));
  (supabase.from as jest.Mock).mockImplementation((table: string) => ({
    insert: jest.fn().mockResolvedValue({ error: null }),
    update: table === "profiles" ? update : jest.fn(() => ({ eq: jest.fn() })),
  }));
  const { getByLabelText } = render(<PushPrimerScreen />);
  fireEvent.press(getByLabelText("Turn on alerts"));
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
  expect(getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith({ push_token: "ExponentPushToken[mock]" });
  expect(eq).toHaveBeenCalledWith("id", "11111111-1111-1111-1111-111111111111");
});

it("a permission request that never settles does not navigate or fetch a token", async () => {
  requestPermissionsAsync.mockReturnValue(new Promise(() => {}));
  const { getByLabelText } = render(<PushPrimerScreen />);
  fireEvent.press(getByLabelText("Turn on alerts"));
  await new Promise((r) => setTimeout(r, 30));
  expect(mockBack).not.toHaveBeenCalled();
  expect(getExpoPushTokenAsync).not.toHaveBeenCalled();
});
