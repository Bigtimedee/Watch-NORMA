/**
 * Unit tests for the DatePicker component (updated for past-5-days feature).
 *
 * Tests cover:
 *  - Renders exactly 5 chips (offsets -4 through 0)
 *  - Today chip (offset 0) is always labeled "Today"
 *  - Past day chips show "Weekday M/D" format (e.g. "Mon 3/24")
 *  - Active chip reflects selectedOffset prop
 *  - onSelectOffset callback fires with the correct offset when a chip is pressed
 *  - Chips are ordered oldest-to-newest left-to-right (today is rightmost)
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DatePicker", () => {
  describe("chip rendering", () => {
    it("renders exactly 5 chips", () => {
      const { getAllByRole } = render(
        <DatePicker selectedOffset={0} onSelectOffset={() => {}} />
      );
      // Each chip is a Pressable, exposed as 'button' role in RNTL
      const chips = getAllByRole("button");
      expect(chips).toHaveLength(5);
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
      // Check all 4 past-day chips
      [-4, -3, -2, -1].forEach((offset) => {
        const label = expectedLabel(offset);
        expect(getByText(label)).toBeTruthy();
      });
    });

    it("today chip is the last (rightmost) chip", () => {
      const { getAllByRole } = render(
        <DatePicker selectedOffset={0} onSelectOffset={() => {}} />
      );
      const chips = getAllByRole("button");
      const lastChip = chips[chips.length - 1];
      // The last chip's accessibility label should be "Today"
      expect(lastChip.props.accessibilityLabel).toBe("Today");
    });

    it("the oldest chip (4 days ago) is first (leftmost)", () => {
      const { getAllByRole } = render(
        <DatePicker selectedOffset={0} onSelectOffset={() => {}} />
      );
      const chips = getAllByRole("button");
      const firstChip = chips[0];
      expect(firstChip.props.accessibilityLabel).toBe(expectedLabel(-4));
    });
  });

  describe("active state", () => {
    it("marks the chip matching selectedOffset as selected", () => {
      const { getAllByRole } = render(
        <DatePicker selectedOffset={0} onSelectOffset={() => {}} />
      );
      const chips = getAllByRole("button");
      // offset 0 is the last chip (index 4)
      expect(chips[4].props.accessibilityState.selected).toBe(true);
      // All other chips are not selected
      [0, 1, 2, 3].forEach((i) => {
        expect(chips[i].props.accessibilityState.selected).toBe(false);
      });
    });

    it("marks a past day chip as selected when selectedOffset is -2", () => {
      const { getAllByRole } = render(
        <DatePicker selectedOffset={-2} onSelectOffset={() => {}} />
      );
      const chips = getAllByRole("button");
      // offsets array is [-4, -3, -2, -1, 0], so offset -2 is index 2
      expect(chips[2].props.accessibilityState.selected).toBe(true);
      [0, 1, 3, 4].forEach((i) => {
        expect(chips[i].props.accessibilityState.selected).toBe(false);
      });
    });

    it("marks the oldest chip (offset -4) as selected when selectedOffset is -4", () => {
      const { getAllByRole } = render(
        <DatePicker selectedOffset={-4} onSelectOffset={() => {}} />
      );
      const chips = getAllByRole("button");
      expect(chips[0].props.accessibilityState.selected).toBe(true);
      [1, 2, 3, 4].forEach((i) => {
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

    it("calls onSelectOffset with -4 when the oldest chip is pressed", () => {
      const onSelectOffset = jest.fn();
      const { getByText } = render(
        <DatePicker selectedOffset={0} onSelectOffset={onSelectOffset} />
      );
      fireEvent.press(getByText(expectedLabel(-4)));
      expect(onSelectOffset).toHaveBeenCalledTimes(1);
      expect(onSelectOffset).toHaveBeenCalledWith(-4);
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

  it("returns a date 4 days before today for offset -4", () => {
    const todayStr = offsetToDateStr(0);
    const fourDaysAgo = offsetToDateStr(-4);

    const today = new Date(todayStr + "T12:00:00");
    const past = new Date(fourDaysAgo + "T12:00:00");
    const diffDays = Math.round(
      (today.getTime() - past.getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(diffDays).toBe(4);
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

  it("does not return a future date for any negative offset", () => {
    const todayStr = offsetToDateStr(0);
    const today = new Date(todayStr + "T12:00:00");

    [-4, -3, -2, -1].forEach((offset) => {
      const dateStr = offsetToDateStr(offset);
      const date = new Date(dateStr + "T12:00:00");
      expect(date.getTime()).toBeLessThan(today.getTime());
    });
  });
});
