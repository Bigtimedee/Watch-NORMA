import {
  SPORTSBOOK_BRAND_COLORS,
  detectSportsbookProvider,
  defaultCtaLabel,
  sportsbookDisplayName,
} from "../sportsbook-brands";
import { SPORTSBOOK_NAMES } from "../constants";

describe("sportsbook-brands", () => {
  it("includes prizepicks, underdog, and betr", () => {
    expect(SPORTSBOOK_BRAND_COLORS.prizepicks.bg).toBe("#6C2BD9");
    expect(SPORTSBOOK_BRAND_COLORS.underdog.bg).toBe("#E8F54A");
    expect(SPORTSBOOK_BRAND_COLORS.betr.bg).toBe("#A444E4");
  });

  it("detects pick'em providers from URL hosts", () => {
    expect(detectSportsbookProvider("https://app.prizepicks.com/board")).toBe(
      "prizepicks",
    );
    expect(detectSportsbookProvider("https://app.underdogfantasy.com/picks")).toBe(
      "underdog",
    );
    expect(detectSportsbookProvider("https://www.betr.app/picks")).toBe("betr");
    expect(detectSportsbookProvider("https://picks.betr.app")).toBe("betr");
    expect(detectSportsbookProvider("https://betr.onelink.me/VZxy/betrapp")).toBe(
      "betr",
    );
    expect(detectSportsbookProvider("https://www.betrivers.com/sports")).toBe(
      null,
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
    expect(sportsbookDisplayName("betr")).toBe(SPORTSBOOK_NAMES.betr);
  });

  it("pick'em default label is Open, never Bet Now", () => {
    expect(defaultCtaLabel("prizepicks", true)).toBe("Open PrizePicks");
    expect(defaultCtaLabel("underdog", true)).toBe("Open Underdog");
    expect(defaultCtaLabel("betr", true)).toBe("Open Betr");
    expect(defaultCtaLabel("draftkings", true)).toBe("Bet Now on DraftKings");
    expect(defaultCtaLabel("prizepicks", false)).toBe(
      "Not available in your region",
    );
  });

  it("Betr keeps Open Betr even when style or ctaText says Bet Now", () => {
    expect(defaultCtaLabel("betr", true, { style: "bet_now" })).toBe("Open Betr");
    expect(defaultCtaLabel("betr", true, { ctaText: "Bet Now on Betr" })).toBe(
      "Open Betr",
    );
    expect(defaultCtaLabel("betr", true, { ctaText: "Bet Now on Betr" })).not.toBe(
      "Bet Now on Betr",
    );
    expect(defaultCtaLabel("betr", true, { ctaText: "Play on Betr" })).toBe(
      "Play on Betr",
    );
  });

  it("detectSportsbookProvider never maps BetRivers hosts to betr", () => {
    expect(detectSportsbookProvider("https://www.betrivers.com")).toBe(null);
    expect(detectSportsbookProvider("https://sports.betrivers.com/sportsbook")).toBe(
      null,
    );
    expect(detectSportsbookProvider("https://betrivers.com")).toBe(null);
  });

  it("SponsorCTAButton style=open never says Bet Now", () => {
    expect(defaultCtaLabel("draftkings", true, { style: "open" })).toBe(
      "Open DraftKings",
    );
  });
});
