import {
  SPORTSBOOK_BRAND_COLORS,
  detectSportsbookProvider,
  defaultCtaLabel,
  sportsbookDisplayName,
} from "../sportsbook-brands";
import { SPORTSBOOK_NAMES } from "../constants";

describe("sportsbook-brands", () => {
  it("includes prizepicks and underdog", () => {
    expect(SPORTSBOOK_BRAND_COLORS.prizepicks.bg).toBe("#6C2BD9");
    expect(SPORTSBOOK_BRAND_COLORS.underdog.bg).toBe("#E8F54A");
  });

  it("detects pick'em providers from URL hosts", () => {
    expect(detectSportsbookProvider("https://app.prizepicks.com/board")).toBe(
      "prizepicks",
    );
    expect(detectSportsbookProvider("https://app.underdogfantasy.com/picks")).toBe(
      "underdog",
    );
    expect(detectSportsbookProvider("https://sportsbook.draftkings.com/x")).toBe(
      "draftkings",
    );
  });

  it("prefers an explicit providerKey", () => {
    expect(
      detectSportsbookProvider("https://app.prizepicks.com", "underdog"),
    ).toBe("underdog");
  });

  it("display names come from SPORTSBOOK_NAMES", () => {
    expect(sportsbookDisplayName("prizepicks")).toBe(SPORTSBOOK_NAMES.prizepicks);
    expect(sportsbookDisplayName("underdog")).toBe(SPORTSBOOK_NAMES.underdog);
  });

  it("pick'em default label is Open, never Bet Now", () => {
    expect(defaultCtaLabel("prizepicks", true)).toBe("Open PrizePicks");
    expect(defaultCtaLabel("underdog", true)).toBe("Open Underdog");
    expect(defaultCtaLabel("draftkings", true)).toBe("Bet Now on DraftKings");
    expect(defaultCtaLabel("prizepicks", false)).toBe(
      "Not available in your region",
    );
  });

  it("SponsorCTAButton style=open never says Bet Now", () => {
    expect(defaultCtaLabel("draftkings", true, { style: "open" })).toBe(
      "Open DraftKings",
    );
  });
});
