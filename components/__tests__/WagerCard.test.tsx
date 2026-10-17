import React from "react";
import { render } from "@testing-library/react-native";
import { WagerCard } from "../WagerCard";
import type { Wager } from "../../lib/types";

const WAGER: Wager = {
  id: 1,
  user_id: "u1",
  game_id: "espn-ncaaf-401858488",
  sport: "ncaaf" as Wager["sport"],
  sportsbook: "betr",
  wager_type: "moneyline",
  description: "Ohio State moneyline",
  team_id: null,
  line: null,
  odds: "-150",
  status: "active",
  created_at: new Date().toISOString(),
  source: null,
  provider_key: null,
  external_bet_id: null,
  stake: null,
  potential_payout: null,
  legs: null,
  market_type: null,
  placed_at: null,
  parsed_target: null,
};

describe("WagerCard", () => {
  it("regression: does not render the sportsbook/book name even when sportsbook is set", () => {
    const { queryByText, toJSON } = render(<WagerCard wager={WAGER} />);
    expect(queryByText("Betr")).toBeNull();
    expect(queryByText("betr")).toBeNull();
    expect(JSON.stringify(toJSON())).not.toContain("Betr");
  });

  it("renders wager type, status, description and odds without a book name", () => {
    const { getByText } = render(<WagerCard wager={WAGER} />);
    expect(getByText("Moneyline")).toBeTruthy();
    expect(getByText("ACTIVE")).toBeTruthy();
    expect(getByText("Ohio State moneyline")).toBeTruthy();
    expect(getByText("Odds: -150")).toBeTruthy();
  });

  it("renders cleanly when sportsbook is null", () => {
    const { getByText, queryByText } = render(
      <WagerCard wager={{ ...WAGER, sportsbook: null }} />,
    );
    expect(getByText("Moneyline")).toBeTruthy();
    expect(queryByText("Betr")).toBeNull();
  });
});
