import { inferStateFromTimezone } from "../geo-compliance";

describe("inferStateFromTimezone", () => {
  it("returns a state for unambiguous sportsbook timezones", () => {
    expect(inferStateFromTimezone("America/Detroit")).toBe("MI");
    expect(inferStateFromTimezone("America/Phoenix")).toBe("AZ");
    expect(inferStateFromTimezone("Pacific/Honolulu")).toBe("HI");
  });

  it("returns NY for America/New_York to match auction-engine behavior", () => {
    expect(inferStateFromTimezone("America/New_York")).toBe("NY");
  });

  it("returns null for ambiguous or missing timezones", () => {
    expect(inferStateFromTimezone("America/Chicago")).toBeNull();
    expect(inferStateFromTimezone("America/Los_Angeles")).toBeNull();
    expect(inferStateFromTimezone(null)).toBeNull();
    expect(inferStateFromTimezone(undefined)).toBeNull();
  });
});
