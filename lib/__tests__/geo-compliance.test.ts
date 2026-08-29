import { inferStateFromTimezone } from "../geo-compliance";

describe("inferStateFromTimezone", () => {
  it("returns a state for unambiguous sportsbook timezones", () => {
    expect(inferStateFromTimezone("America/Detroit")).toBe("MI");
    expect(inferStateFromTimezone("America/Phoenix")).toBe("AZ");
    expect(inferStateFromTimezone("Pacific/Honolulu")).toBe("HI");
  });

  it("returns NY for America/New_York (Eastern band representative)", () => {
    expect(inferStateFromTimezone("America/New_York")).toBe("NY");
  });

  // FX3 (2026-08-23 audit BL-8): STATE_BY_TIMEZONE was expanded to cover the
  // Central and Pacific IANA zones the majority of US devices actually
  // report. Prior to this, Pacific/Mountain/Central users all fell through
  // to null and the fail-closed CTA hid every sportsbook.
  it("returns IL for America/Chicago (Central band representative)", () => {
    expect(inferStateFromTimezone("America/Chicago")).toBe("IL");
  });

  it("returns WA for America/Los_Angeles (Pacific band representative)", () => {
    expect(inferStateFromTimezone("America/Los_Angeles")).toBe("WA");
  });

  it("returns CO for America/Denver (Mountain band representative)", () => {
    expect(inferStateFromTimezone("America/Denver")).toBe("CO");
  });

  it("returns null for UTC (device misconfigured — fail-closed)", () => {
    expect(inferStateFromTimezone("UTC")).toBeNull();
    expect(inferStateFromTimezone("Etc/UTC")).toBeNull();
  });

  it("returns null for missing or unrecognized timezones", () => {
    expect(inferStateFromTimezone(null)).toBeNull();
    expect(inferStateFromTimezone(undefined)).toBeNull();
    expect(inferStateFromTimezone("Not/A_Real_Zone")).toBeNull();
    expect(inferStateFromTimezone("")).toBeNull();
  });
});
