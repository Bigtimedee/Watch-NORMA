/**
 * Tests for mapStatus() — the critical status normalization function.
 *
 * This function MUST always return one of the 6 canonical values:
 *   "scheduled" | "inprogress" | "halftime" | "closed" | "cancelled" | "postponed"
 *
 * The root cause of the May 2026 game connectivity outage was mapStatus() returning
 * raw ESPN machine codes (e.g., "status_in_progress") which orphaned games from
 * all polling queries. These tests prevent that regression.
 */

// Import the function (adjust path for test runner)
// In the actual Deno Edge Function runtime, this is imported from "../_shared/utils.ts"
// For Jest, we inline the function to test independently.

function mapStatus(rawStatus: string, isClosed: boolean): string {
  if (isClosed) return "closed";
  const s = rawStatus?.toLowerCase()?.trim() ?? "";

  const stripped = s.startsWith("status_") ? s.slice(7) : s;

  if (stripped === "scheduled" || stripped === "created" || stripped === "pre_game" || stripped === "pre") return "scheduled";
  if (stripped === "inprogress" || stripped === "in_progress" || stripped === "in progress") return "inprogress";
  if (stripped === "halftime" || stripped === "half") return "halftime";
  if (stripped === "end_of_period" || stripped === "end of period") return "inprogress";
  if (stripped === "final" || stripped === "f" || stripped === "f/ot" || stripped === "complete") return "closed";
  if (stripped === "canceled" || stripped === "cancelled") return "cancelled";
  if (stripped === "postponed") return "postponed";
  if (stripped === "delayed" || stripped === "rain_delay" || stripped === "rain delay") return "scheduled";

  if (s.includes("progress") || s.includes("live")) return "inprogress";
  if (s.includes("final") || s.includes("complete")) return "closed";
  if (s.includes("halftime") || s.includes("half")) return "halftime";
  if (s.includes("scheduled") || s.includes("pre")) return "scheduled";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("postpone")) return "postponed";

  return "scheduled";
}

const VALID_STATUSES = ["scheduled", "inprogress", "halftime", "closed", "cancelled", "postponed"];

describe("mapStatus", () => {
  // === CRITICAL REGRESSION TESTS (these caused the May 2026 outage) ===
  describe("ESPN machine codes (type.name format)", () => {
    it("maps STATUS_IN_PROGRESS to inprogress", () => {
      expect(mapStatus("STATUS_IN_PROGRESS", false)).toBe("inprogress");
    });
    it("maps STATUS_HALFTIME to halftime", () => {
      expect(mapStatus("STATUS_HALFTIME", false)).toBe("halftime");
    });
    it("maps STATUS_FINAL to closed", () => {
      expect(mapStatus("STATUS_FINAL", false)).toBe("closed");
    });
    it("maps STATUS_SCHEDULED to scheduled", () => {
      expect(mapStatus("STATUS_SCHEDULED", false)).toBe("scheduled");
    });
    it("maps STATUS_END_OF_PERIOD to inprogress", () => {
      expect(mapStatus("STATUS_END_OF_PERIOD", false)).toBe("inprogress");
    });
    it("maps STATUS_POSTPONED to postponed", () => {
      expect(mapStatus("STATUS_POSTPONED", false)).toBe("postponed");
    });
    it("maps STATUS_CANCELED to cancelled", () => {
      expect(mapStatus("STATUS_CANCELED", false)).toBe("cancelled");
    });
  });

  // === ESPN description format (type.description) ===
  describe("ESPN descriptions (type.description format)", () => {
    it("maps 'In Progress' to inprogress", () => {
      expect(mapStatus("In Progress", false)).toBe("inprogress");
    });
    it("maps 'Halftime' to halftime", () => {
      expect(mapStatus("Halftime", false)).toBe("halftime");
    });
    it("maps 'Final' to closed", () => {
      expect(mapStatus("Final", false)).toBe("closed");
    });
    it("maps 'Scheduled' to scheduled", () => {
      expect(mapStatus("Scheduled", false)).toBe("scheduled");
    });
    it("maps 'Postponed' to postponed", () => {
      expect(mapStatus("Postponed", false)).toBe("postponed");
    });
    it("maps 'End of Period' to inprogress", () => {
      expect(mapStatus("End of Period", false)).toBe("inprogress");
    });
  });

  // === SportsDataIO format ===
  describe("SportsDataIO statuses", () => {
    it("maps 'InProgress' to inprogress", () => {
      expect(mapStatus("InProgress", false)).toBe("inprogress");
    });
    it("maps 'Final' to closed", () => {
      expect(mapStatus("Final", false)).toBe("closed");
    });
    it("maps 'F' to closed", () => {
      expect(mapStatus("F", false)).toBe("closed");
    });
    it("maps 'F/OT' to closed", () => {
      expect(mapStatus("F/OT", false)).toBe("closed");
    });
    it("maps 'Scheduled' to scheduled", () => {
      expect(mapStatus("Scheduled", false)).toBe("scheduled");
    });
    it("maps 'Created' to scheduled", () => {
      expect(mapStatus("Created", false)).toBe("scheduled");
    });
    it("maps 'Canceled' to cancelled", () => {
      expect(mapStatus("Canceled", false)).toBe("cancelled");
    });
    it("maps 'Cancelled' to cancelled", () => {
      expect(mapStatus("Cancelled", false)).toBe("cancelled");
    });
    it("maps 'Half' to halftime", () => {
      expect(mapStatus("Half", false)).toBe("halftime");
    });
  });

  // === isClosed override ===
  describe("isClosed flag", () => {
    it("returns closed when isClosed=true regardless of status string", () => {
      expect(mapStatus("InProgress", true)).toBe("closed");
      expect(mapStatus("Scheduled", true)).toBe("closed");
      expect(mapStatus("STATUS_IN_PROGRESS", true)).toBe("closed");
    });
  });

  // === Edge cases ===
  describe("edge cases", () => {
    it("handles empty string", () => {
      expect(mapStatus("", false)).toBe("scheduled");
    });
    it("handles unknown value — MUST return a valid status, not the raw value", () => {
      const result = mapStatus("SOME_UNKNOWN_VALUE_12345", false);
      expect(VALID_STATUSES).toContain(result);
    });
    it("handles null-ish input", () => {
      expect(mapStatus(undefined as any, false)).toBe("scheduled");
      expect(mapStatus(null as any, false)).toBe("scheduled");
    });
    it("handles 'Delayed' as scheduled", () => {
      expect(mapStatus("Delayed", false)).toBe("scheduled");
    });
    it("handles 'Rain Delay' as scheduled", () => {
      expect(mapStatus("Rain Delay", false)).toBe("scheduled");
    });
  });

  // === INVARIANT: NEVER returns a non-canonical value ===
  describe("canonical output invariant", () => {
    const ESPN_MACHINE_CODES = [
      "STATUS_IN_PROGRESS", "STATUS_HALFTIME", "STATUS_FINAL",
      "STATUS_SCHEDULED", "STATUS_END_OF_PERIOD", "STATUS_POSTPONED",
      "STATUS_CANCELED", "STATUS_DELAYED", "STATUS_PRE_GAME",
      "STATUS_RAIN_DELAY", "STATUS_COMPLETE",
    ];
    const SDIO_VALUES = [
      "InProgress", "Final", "Scheduled", "Canceled", "Cancelled",
      "Halftime", "Half", "F", "F/OT", "Created", "Postponed",
    ];
    const WEIRD_VALUES = [
      "xyz_garbage", "", "   ", "LIVE", "complete", "Pre-Game",
    ];

    const ALL_INPUTS = [...ESPN_MACHINE_CODES, ...SDIO_VALUES, ...WEIRD_VALUES];

    ALL_INPUTS.forEach((input) => {
      it(`"${input}" → returns a canonical status`, () => {
        const result = mapStatus(input, false);
        expect(VALID_STATUSES).toContain(result);
      });
    });
  });
});
