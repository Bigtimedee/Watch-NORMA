/**
 * DFS / fantasy integration — reads live source, not copied snapshots.
 */

import fs from "fs";
import path from "path";
import { SPORTSBOOK_NAMES } from "../lib/constants";
import {
  FANTASY_PLATFORMS,
  isFantasyPlatform,
  isPickEmProvider,
} from "../lib/fantasy-platforms";

const root = path.join(__dirname, "..");

function readRepo(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("SPORTSBOOK_NAMES", () => {
  it("includes prizepicks and underdog", () => {
    expect(SPORTSBOOK_NAMES.prizepicks).toBe("PrizePicks");
    expect(SPORTSBOOK_NAMES.underdog).toBe("Underdog");
  });

  it("includes season-long fantasy display names", () => {
    expect(SPORTSBOOK_NAMES.sleeper).toBe("Sleeper");
    expect(SPORTSBOOK_NAMES.yahoo_fantasy).toBe("Yahoo Fantasy");
    expect(SPORTSBOOK_NAMES.espn_fantasy).toBe("ESPN Fantasy");
    expect(SPORTSBOOK_NAMES.draftkings_dfs).toBe("DraftKings DFS");
  });

  it("preserves existing sportsbook entries", () => {
    expect(SPORTSBOOK_NAMES.draftkings).toBe("DraftKings");
    expect(SPORTSBOOK_NAMES.fanduel).toBe("FanDuel");
    expect(SPORTSBOOK_NAMES.betmgm).toBe("BetMGM");
  });
});

describe("FANTASY_PLATFORMS", () => {
  const values = FANTASY_PLATFORMS.map((p) => p.value);

  it("contains every intended platform", () => {
    expect(values).toEqual(
      expect.arrayContaining([
        "draftkings_dfs",
        "yahoo_fantasy",
        "sleeper",
        "espn_fantasy",
        "prizepicks",
        "underdog",
        "other",
      ]),
    );
  });

  it("ImportRosterSheet consumes the shared constant", () => {
    const src = readRepo("components/ImportRosterSheet.tsx");
    expect(src).toContain("FANTASY_PLATFORMS");
    expect(src).toContain("buildRosterFollowRows(playerNames, user.id, platform)");
  });

  it("isPickEmProvider / isFantasyPlatform helpers", () => {
    expect(isPickEmProvider("prizepicks")).toBe(true);
    expect(isPickEmProvider("draftkings")).toBe(false);
    expect(isFantasyPlatform("sleeper")).toBe(true);
    expect(isFantasyPlatform("youtube_tv")).toBe(false);
  });
});

describe("app.json LSApplicationQueriesSchemes", () => {
  const appJson = JSON.parse(readRepo("app.json"));
  const schemes: string[] =
    appJson.expo?.ios?.infoPlist?.LSApplicationQueriesSchemes ?? [];

  it("registers prizepicks and underdog", () => {
    expect(schemes).toEqual(expect.arrayContaining(["prizepicks", "underdog"]));
  });

  it("registers sleeper and yahoosports for season-long fantasy", () => {
    expect(schemes).toEqual(expect.arrayContaining(["sleeper", "yahoosports"]));
  });
});

describe("parse-bet-slip live source", () => {
  const src = readRepo("supabase/functions/parse-bet-slip/index.ts");

  it("enumerates prizepicks and underdog", () => {
    expect(src).toContain("prizepicks");
    expect(src).toContain("underdog");
  });

  it("asks vision for pick'em legs", () => {
    expect(src).toContain("entry_fee");
    expect(src).toContain("payout_multiplier");
  });
});

describe("email-parser live source", () => {
  const src = readRepo("supabase/functions/_shared/email-parser.ts");

  it("maps prizepicks and underdog sender domains", () => {
    expect(src).toContain('"prizepicks.com"');
    expect(src).toContain('"underdogfantasy.com"');
  });

  it("has a dedicated pick'em regex parser", () => {
    expect(src).toContain("parsePickEmEntry");
    expect(src).toContain('case "prizepicks"');
    expect(src).toContain('case "underdog"');
  });
});

describe("provider registry migration 092 + 20260904", () => {
  const pickem = readRepo(
    "supabase/migrations/092_prizepicks_underdog_dfs_pickem.sql",
  );
  const fantasy = readRepo(
    "supabase/migrations/20260904183000_dfs_fantasy_integration_fixes.sql",
  );

  it("seeds prizepicks and underdog as dfs_pickem", () => {
    expect(pickem).toContain("'prizepicks'");
    expect(pickem).toContain("'underdog'");
    expect(pickem).toContain("'dfs_pickem'");
  });

  it("adds fantasy_source + unique follows constraint", () => {
    expect(fantasy).toContain("fantasy_source");
    expect(fantasy).toContain("follows_user_entity_unique");
  });

  it("seeds sleeper / yahoo_fantasy / espn_fantasy", () => {
    expect(fantasy).toContain("'sleeper'");
    expect(fantasy).toContain("'yahoo_fantasy'");
    expect(fantasy).toContain("'espn_fantasy'");
    expect(fantasy).toContain("'fantasy'");
  });
});
