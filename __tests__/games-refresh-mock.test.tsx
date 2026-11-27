/**
 * Mocked Games list refresh. The pull gesture was not operable in Expo web.
 * This only checks that the list's refresh control calls the query refetch.
 */

import React from "react";
import { render } from "@testing-library/react-native";
import { FlatList } from "react-native";
import { useGames, useFollowedGames } from "../hooks/useGames";
import { SportProvider } from "../lib/sport-context";

jest.mock("../hooks/useGames", () => ({
  useGames: jest.fn(),
  useFollowedGames: jest.fn(),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

jest.mock("../components/GameCard", () => ({
  GameCard: () => null,
}));

jest.mock("../components/DatePicker", () => {
  const React = require("react");
  const { View } = require("react-native");
  const MockDatePicker = () => React.createElement(View, null);
  return {
    __esModule: true,
    default: MockDatePicker,
    offsetToDateStr: () => "2026-11-07",
  };
});

jest.mock("../lib/constants", () => ({
  LIVE_STATUSES: ["inprogress", "halftime"],
}));

const GamesScreen = require("../app/(tabs)/games/index").default;

it("the list refresh control calls refetch", () => {
  const refetch = jest.fn();
  (useGames as jest.Mock).mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch,
  });
  (useFollowedGames as jest.Mock).mockReturnValue({ data: [] });
  const { UNSAFE_getByType } = render(
    <SportProvider>
      <GamesScreen />
    </SportProvider>
  );
  const list = UNSAFE_getByType(FlatList);
  list.props.refreshControl.props.onRefresh();
  expect(refetch).toHaveBeenCalledTimes(1);
});
