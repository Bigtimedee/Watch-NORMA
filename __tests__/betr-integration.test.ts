/**
 * Betr Phase A–E — reads live source, not copied snapshots.
 * Mirrors __tests__/prizepicks-integration.test.ts.
 */

import fs from "fs";
import path from "path";
import { SPORTSBOOK_NAMES } from "../lib/constants";
import {
  FANTASY_PLATFORMS,
  PICKEM_PROVIDER_KEYS,
  isPickEmProvider,
} from "../lib/fantasy-platforms";
import { SPORTSBOOK_BRAND_COLORS, defaultCtaLabel } from "../lib/sportsbook-brands";

const root = path.join(__dirname, "..");

function readRepo(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const BETR_MIGRATION = "supabase/migrations/20260914210000_betr_dfs_pickem.sql";

describe("Betr Phase A constants", () => {
  it("SPORTSBOOK_NAMES.betr is Betr", () => {
    expect(SPORTSBOOK_NAMES.betr).toBe("Betr");
  });

  it("FANTASY_PLATFORMS lists Betr Picks", () => {
    expect(FANTASY_PLATFORMS.map((p) => p.value)).toEqual(
      expect.arrayContaining(["betr"]),
    );
    expect(FANTASY_PLATFORMS.find((p) => p.value === "betr")?.label).toBe(
      "Betr Picks",
    );
  });

  it("PICKEM_PROVIDER_KEYS includes betr", () => {
    expect(PICKEM_PROVIDER_KEYS).toEqual(
      expect.arrayContaining(["prizepicks", "underdog", "betr"]),
    );
    expect(isPickEmProvider("betr")).toBe(true);
    expect(isPickEmProvider("betrivers")).toBe(false);
  });

  it("pick'em CTA is Open Betr, never Bet Now on Betr", () => {
    expect(defaultCtaLabel("betr", true)).toBe("Open Betr");
    expect(defaultCtaLabel("betr", true)).not.toMatch(/Bet Now/);
    expect(defaultCtaLabel("betr", false)).toBe("Not available in your region");
  });
});

describe("Betr brand hex parity client ↔ edge", () => {
  const edgeLinks = readRepo("supabase/functions/_shared/sportsbook-links.ts");

  it("client brand map uses cited Betr magenta, not PrizePicks purple", () => {
    expect(SPORTSBOOK_BRAND_COLORS.betr.bg).toBe("#A444E4");
    expect(SPORTSBOOK_BRAND_COLORS.betr.text).toBe("#FFFFFF");
    expect(SPORTSBOOK_BRAND_COLORS.betr.bg).not.toBe(
      SPORTSBOOK_BRAND_COLORS.prizepicks.bg,
    );
  });

  it("edge SPORTSBOOK_BRAND_COLORS uses the same betr hex", () => {
    expect(edgeLinks).toContain('betr: { primary: "#A444E4"');
    expect(edgeLinks).toContain('betr: "Betr"');
  });
});

describe("Betr provider registry + geo migration", () => {
  const sql = readRepo(BETR_MIGRATION);

  it("seeds betr as dfs_pickem with OneLink, no invented scheme", () => {
    expect(sql).toContain("'betr'");
    expect(sql).toContain("'dfs_pickem'");
    expect(sql).toContain("'deep_link_only'");
    expect(sql).toContain("app.instabet.betr");
    expect(sql).toContain("https://betr.onelink.me/VZxy/betrapp");
    expect(sql).toContain("https://www.betr.app/picks");
    expect(sql).toContain("id1635215598");
    expect(sql).toContain("ON CONFLICT (key) DO UPDATE");
    // ios_scheme is the NULL after provider_type. Quoted 'betr://' must not appear
    // (the comment may mention betr:// in backticks).
    expect(sql).toMatch(/'sportsbook',\s*NULL,/);
    expect(sql).not.toMatch(/'betr:\/\//);
  });

  it("does not edit 092 or 20260904183000", () => {
    expect(BETR_MIGRATION).toContain("20260914210000");
    const ninetyTwo = readRepo(
      "supabase/migrations/092_prizepicks_underdog_dfs_pickem.sql",
    );
    expect(ninetyTwo).not.toContain("'betr'");
  });

  it("seeds sportsbook_restrictions for betr including TN, excluding NY", () => {
    expect(sql).toContain("sportsbook_restrictions");
    expect(sql).toMatch(/'betr'[\s\S]*ARRAY\[/);
    expect(sql).toContain("'TN'");
    const betrBlock = sql.slice(sql.indexOf("'betr'"));
    const arrayBlock = betrBlock.slice(
      betrBlock.indexOf("ARRAY["),
      betrBlock.indexOf("]"),
    );
    expect(arrayBlock).toContain("'TN'");
    expect(arrayBlock).not.toContain("'NY'");
    expect(arrayBlock).not.toContain("'NJ'");
    expect(sql).toMatch(/help\.betr\.app/);
    expect(sql).toMatch(/play\.google\.com\/store\/apps\/details\?id=app\.instabet\.betr/);
  });
});

describe("Betr connections UI sweep", () => {
  it("connections index uses isPickEmProvider, not hardcoded prizepicks||underdog", () => {
    const src = readRepo("app/(tabs)/connections/index.tsx");
    expect(src).toContain("isPickEmProvider");
    expect(src).toContain("Betr");
    expect(src).not.toMatch(
      /provider_key === ["']prizepicks["'] \|\| .*underdog/,
    );
  });

  it("pickem.tsx body copy mentions Betr", () => {
    const src = readRepo("app/(tabs)/connections/pickem.tsx");
    expect(src).toContain("Betr");
    expect(src).toContain('category: "dfs_pickem"');
  });

  it("ReviewScannedWagersSheet ALL_BOOKS derives pick'em keys", () => {
    const src = readRepo("components/ReviewScannedWagersSheet.tsx");
    expect(src).toContain("...PICKEM_PROVIDER_KEYS");
    expect(src).toContain("isPickEmProvider");
  });
});

describe("Betr iOS scheme is not registered", () => {
  it("app.json LSApplicationQueriesSchemes does not include betr", () => {
    const appJson = JSON.parse(readRepo("app.json"));
    const schemes: string[] =
      appJson.expo?.ios?.infoPlist?.LSApplicationQueriesSchemes ?? [];
    expect(schemes).not.toContain("betr");
  });
});

describe("Betr Phase B — slip enum + gated email", () => {
  it("parse-bet-slip vision prompt enumerates betr and warns about BetRivers", () => {
    const src = readRepo("supabase/functions/parse-bet-slip/index.ts");
    expect(src).toContain('"betr"');
    expect(src).toContain("Betr Picks");
    expect(src).toContain("BetRivers");
  });

  it("ReviewScannedWagersSheet can assign provider betr via PICKEM_PROVIDER_KEYS", () => {
    expect(PICKEM_PROVIDER_KEYS).toEqual(expect.arrayContaining(["betr"]));
    const src = readRepo("components/ReviewScannedWagersSheet.tsx");
    expect(src).toContain("...PICKEM_PROVIDER_KEYS");
  });

  it("email-parser leaves Betr domains unmapped and keeps BetRivers on betrivers.com", () => {
    const src = readRepo("supabase/functions/_shared/email-parser.ts");
    expect(src).toContain('"betrivers.com"');
    expect(src).toMatch(/BLOCKED ON FIXTURE/);
    expect(src).not.toMatch(/"[^"\n]*"\s*:\s*"betr"/);
    expect(src).not.toMatch(/^\s*case "betr"/m);
  });
});

describe("Betr Phase C — roster / fantasy_source", () => {
  it("follows.fantasy_source comment in the Betr migration includes betr", () => {
    const sql = readRepo(BETR_MIGRATION);
    expect(sql).toMatch(/COMMENT ON COLUMN public\.follows\.fantasy_source/);
    expect(sql).toMatch(/fantasy_source[\s\S]*betr/);
  });

  it("ImportRosterSheet picker is FANTASY_PLATFORMS including Betr Picks", () => {
    const src = readRepo("components/ImportRosterSheet.tsx");
    expect(src).toContain("FANTASY_PLATFORMS");
    expect(FANTASY_PLATFORMS.find((p) => p.value === "betr")?.label).toBe(
      "Betr Picks",
    );
  });
});

describe("Betr Phase D — auction rewrite + compliance copy", () => {
  it("edge detectPickEmProviderFromUrl is host-specific (no betrivers steal)", () => {
    const src = readRepo("supabase/functions/_shared/sportsbook-links.ts");
    expect(src).toContain("betr.app");
    expect(src).toContain("betr.onelink.me");
    expect(src).toContain("betrivers.com");
    expect(src).toContain("contextualizeSponsorCtaUrl");
  });

  it("creative-prescreen hard-flags pick'em Bet Now and exempts BetRivers", () => {
    const src = readRepo("supabase/functions/creative-prescreen/rubric.ts");
    expect(src).toContain("flagPickEmBetNowCopy");
    expect(src).toContain("detectPickEmProviderFromUrl");
    expect(src).toContain("betrivers");
  });
});
