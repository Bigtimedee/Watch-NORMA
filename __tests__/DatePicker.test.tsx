/**
 * Unit tests for the DatePicker component (11-day navigation: -5 through +5).
 *
 * Tests cover:
 *  - Renders exactly 11 chips (offsets -5 through +5)
 *  - Today chip (offset 0) is labeled "Today" and is the center chip
 *  - Past and future day chips show "Weekday M/D" format
 *  - Active chip reflects selectedOffset prop
 *  - onSelectOffset callback fires with the correct offset when a chip is pressed
 *  - Chips are ordered oldest-to-newest left-to-right (today is at index 5)
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import DatePicker, { offsetToDateStr } from "../components/DatePicker";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the Eastern-timezone date object for today + offset days. */
function getEasternDateForOffset(offset: number): Date {
  const now = new Date();
  const eastern = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parseInt(eastern.find((p) => p.type === "year")!.value);
  const m = parseInt(eastern.find((p) => p.type === "month")!.value);
  const d = parseInt(eastern.find((p) => p.type === "day")!.value);
  return new Date(y, m - 1, d + offset);
}

const WEEKDAY_ABBREVS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function expectedLabel(offset: number): string {
  if (offset === 0) return "Today";
  const target = getEasternDateForOffset(offset);
  return `${WEEKDAY_ABBREVS[target.getDay()]} ${target.getMonth() + 1}/${target.getDate()}`;
}

// offsets array is [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]
// index of offset N is N + 5
const TOTAL_CHIPS = 11;
const TODAY_INDEX = 5;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DatePicker", () => {
  describe("chip rendering", () => {
    it("renders exactly 11 chips", () => {
      const { getAllByRole } = render(
        <DatePicker selectedOffset={0} onSelectOffset={() => {}} />
      );
      const chips = getAllByRole("button");
      expect(chips).toHaveLength(TOTAL_CHIPS);
    });

    it("renders today chip with label 'Today'", () => {
      const { getByText } = render(
        <DatePicker selectedOffset={0} onSelectOffset={() => {}} />
      );
      expect(getByText("Today")).toBeTruthy();
    });

    it("renders past day chips with 'Weekday M/D' format", () => {
      const { getByText } = render(
        <DatePicker selectedOffset={0} onSelectOffset={() => {}} />
      );
      [-5, -4, -3, -2, -1].forEach((offset) => {
        expect(getByText(expectedLabel(offset))).toBeTruthy();
      });
    });

    it("renders future day chips with 'Weekday M/D' format", () => {
      const { getByText } = render(
        <DatePicker selectedOffset={0} onSelectOffset={() => {}} />
      );
      [1, 2, 3, 4, 5].forEach((offset) => {
        expect(getByText(expectedLabel(offset))).toBeTruthy();
      });
    });

    it("today chip is the center chip (index 5)", () => {
      const { getAllByRole } = render(
        <DatePicker selectedOffset={0} onSelectOffset={() => {}} />
      );
      const chips = getAllByRole("button");
      expect(chips[TODAY_INDEX].props.accessibilityLabel).toBe("Today");
    });

    it("the oldest chip (5 days ago) is first (leftmost)", () => {
      const { getAllByRole } = render(
        <DatePicker selectedOffset={0} onSelectOffset={() => {}} />
      );
      const chips = getAllByRole("button");
      expect(chips[0].props.accessibilityLabel).toBe(expectedLabel(-5));
    });

    it("the furthest future chip (5 days ahead) is last (rightmost)", () => {
      const { getAllByRole } = render(
        <DatePicker selectedOffset={0} onSelectOffset={() => {}} />
      );
      const chips = getAllByRole("button");
      expect(chips[TOTAL_CHIPS - 1].props.accessibilityLabel).toBe(expectedLabel(5));
    });
  });

  describe("active state", () => {
    it("marks the chip matching selectedOffset=0 as selected (index 5)", () => {
      const { getAllByRole } = render(
        <DatePicker selectedOffset={0} onSelectOffset={() => {}} />
      );
      const chips = getAllByRole("button");
      expect(chips[TODAY_INDEX].props.accessibilityState.selected).toBe(true);
      [0, 1, 2, 3, 4, 6, 7, 8, 9, 10].forEach((i) => {
        expect(chips[i].props.accessibilityState.selected).toBe(false);
      });
    });

    it("marks the correct chip as selected when selectedOffset is -2 (index 3)", () => {
      const { getAllByRole } = render(
        <DatePicker selectedOffset={-2} onSelectOffset={() => {}} />
      );
      const chips = getAllByRole("button");
      // offset -2 → index = -2 + 5 = 3
      expect(chips[3].props.accessibilityState.selected).toBe(true);
      [0, 1, 2, 4, 5, 6, 7, 8, 9, 10].forEach((i) => {
        expect(chips[i].props.accessibilityState.selected).toBe(false);
      });
    });

    it("marks the oldest chip (offset -5, index 0) as selected when selectedOffset is -5", () => {
      const { getAllByRole } = render(
        <DatePicker selectedOffset={-5} onSelectOffset={() => {}} />
      );
      const chips = getAllByRole("button");
      expect(chips[0].props.accessibilityState.selected).toBe(true);
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].forEach((i) => {
        expect(chips[i].props.accessibilityState.selected).toBe(false);
      });
    });

    it("marks a future chip as selected when selectedOffset is +3 (index 8)", () => {
      const { getAllByRole } = render(
        <DatePicker selectedOffset={3} onSelectOffset={() => {}} />
      );
      const chips = getAllByRole("button");
      // offset +3 → index = 3 + 5 = 8
      expect(chips[8].props.accessibilityState.selected).toBe(true);
      [0, 1, 2, 3, 4, 5, 6, 7, 9, 10].forEach((i) => {
        expect(chips[i].props.accessibilityState.selected).toBe(false);
      });
    });
  });

  describe("onSelectOffset callback", () => {
    it("calls onSelectOffset with 0 when today chip is pressed", () => {
      const onSelectOffset = jest.fn();
      const { getByText } = render(
        <DatePicker selectedOffset={-1} onSelectOffset={onSelectOffset} />
      );
      fireEvent.press(getByText("Today"));
      expect(onSelectOffset).toHaveBeenCalledTimes(1);
      expect(onSelectOffset).toHaveBeenCalledWith(0);
    });

    it("calls onSelectOffset with -1 when yesterday chip is pressed", () => {
      const onSelectOffset = jest.fn();
      const { getByText } = render(
        <DatePicker selectedOffset={0} onSelectOffset={onSelectOffset} />
      );
      fireEvent.press(getByText(expectedLabel(-1)));
      expect(onSelectOffset).toHaveBeenCalledTimes(1);
      expect(onSelectOffset).toHaveBeenCalledWith(-1);
    });

    it("calls onSelectOffset with -5 when the oldest chip is pressed", () => {
      const onSelectOffset = jest.fn();
      const { getByText } = render(
        <DatePicker selectedOffset={0} onSelectOffset={onSelectOffset} />
      );
      fireEvent.press(getByText(expectedLabel(-5)));
      expect(onSelectOffset).toHaveBeenCalledTimes(1);
      expect(onSelectOffset).toHaveBeenCalledWith(-5);
    });

    it("calls onSelectOffset with +1 when tomorrow chip is pressed", () => {
      const onSelectOffset = jest.fn();
      const { getByText } = render(
        <DatePicker selectedOffset={0} onSelectOffset={onSelectOffset} />
      );
      fireEvent.press(getByText(expectedLabel(1)));
      expect(onSelectOffset).toHaveBeenCalledTimes(1);
      expect(onSelectOffset).toHaveBeenCalledWith(1);
    });

    it("calls onSelectOffset with +5 when the furthest future chip is pressed", () => {
      const onSelectOffset = jest.fn();
      const { getByText } = render(
        <DatePicker selectedOffset={0} onSelectOffset={onSelectOffset} />
      );
      fireEvent.press(getByText(expectedLabel(5)));
      expect(onSelectOffset).toHaveBeenCalledTimes(1);
      expect(onSelectOffset).toHaveBeenCalledWith(5);
    });

    it("calls onSelectOffset exactly once per tap even on rapid taps", () => {
      const onSelectOffset = jest.fn();
      const { getByText } = render(
        <DatePicker selectedOffset={0} onSelectOffset={onSelectOffset} />
      );
      const label = expectedLabel(-2);
      fireEvent.press(getByText(label));
      fireEvent.press(getByText(label));
      fireEvent.press(getByText(label));
      expect(onSelectOffset).toHaveBeenCalledTimes(3);
      expect(onSelectOffset).toHaveBeenNthCalledWith(1, -2);
      expect(onSelectOffset).toHaveBeenNthCalledWith(2, -2);
      expect(onSelectOffset).toHaveBeenNthCalledWith(3, -2);
    });
  });
});

// ---------------------------------------------------------------------------
// offsetToDateStr utility
// ---------------------------------------------------------------------------

describe("offsetToDateStr", () => {
  it("returns a YYYY-MM-DD string for offset 0", () => {
    const result = offsetToDateStr(0);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns a date 5 days before today for offset -5", () => {
    const todayStr = offsetToDateStr(0);
    const fiveDaysAgo = offsetToDateStr(-5);

    const today = new Date(todayStr + "T12:00:00");
    const past = new Date(fiveDaysAgo + "T12:00:00");
    const diffDays = Math.round(
      (today.getTime() - past.getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(diffDays).toBe(5);
  });

  it("returns a date 1 day before today for offset -1", () => {
    const todayStr = offsetToDateStr(0);
    const yesterdayStr = offsetToDateStr(-1);

    const today = new Date(todayStr + "T12:00:00");
    const yesterday = new Date(yesterdayStr + "T12:00:00");
    const diffDays = Math.round(
      (today.getTime() - yesterday.getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(diffDays).toBe(1);
  });

  it("returns a date 1 day after today for offset +1", () => {
    const todayStr = offsetToDateStr(0);
    const tomorrowStr = offsetToDateStr(1);

    const today = new Date(todayStr + "T12:00:00");
    const tomorrow = new Date(tomorrowStr + "T12:00:00");
    const diffDays = Math.round(
      (tomorrow.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(diffDays).toBe(1);
  });

  it("returns a date 5 days after today for offset +5", () => {
    const todayStr = offsetToDateStr(0);
    const fiveDaysAhead = offsetToDateStr(5);

    const today = new Date(todayStr + "T12:00:00");
    const future = new Date(fiveDaysAhead + "T12:00:00");
    const diffDays = Math.round(
      (future.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(diffDays).toBe(5);
  });

  it("does not return a future date for any negative offset", () => {
    const todayStr = offsetToDateStr(0);
    const today = new Date(todayStr + "T12:00:00");

    [-5, -4, -3, -2, -1].forEach((offset) => {
      const dateStr = offsetToDateStr(offset);
      const date = new Date(dateStr + "T12:00:00");
      expect(date.getTime()).toBeLessThan(today.getTime());
    });
  });

  it("does not return a past date for any positive offset", () => {
    const todayStr = offsetToDateStr(0);
    const today = new Date(todayStr + "T12:00:00");

    [1, 2, 3, 4, 5].forEach((offset) => {
      const dateStr = offsetToDateStr(offset);
      const date = new Date(dateStr + "T12:00:00");
      expect(date.getTime()).toBeGreaterThan(today.getTime());
    });
  });
});
