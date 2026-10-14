import { readFileSync } from "fs";
import { join } from "path";
import { getBroadcastProviderKeys } from "../deep-links";

const sql = readFileSync(
  join(__dirname, "../../supabase/migrations/20261014190000_restore_missing_streaming_providers.sql"),
  "utf8"
);

describe("restore missing streaming providers migration", () => {
  it.each([
    "prime_video", "mlb_tv", "fox_sports", "apple_tv_plus", "nfl_network",
    "nba_tv", "nhl_network", "dazn", "youtube_primetime_channels", "nfl_plus",
  ])("inserts %s", (key) => {
    expect(sql).toMatch(new RegExp(`\\('${key}',`));
  });

  it("is idempotent and never overwrites existing rows", () => {
    expect(sql).toMatch(/ON CONFLICT \(key\) DO NOTHING;/);
    expect(sql).not.toMatch(/DO UPDATE/);
  });

  it("only sets verified app universal links, without clobbering", () => {
    expect(sql).toMatch(/app_universal_link = 'https:\/\/app\.primevideo\.com\/'\s+WHERE key = 'prime_video' AND app_universal_link IS NULL/);
    expect(sql).not.toMatch(/app_universal_link = 'https:\/\/www\.fox\.com/);
  });

  it("does not seed the placeholder Amazon tag and clears the ESPN placeholder", () => {
    expect(sql).not.toMatch(/SET affiliate_tag = 'norma-20'/);
    expect(sql).toMatch(/SET affiliate_tag = NULL\s+WHERE key = 'espn_plus' AND affiliate_tag = 'NORMA_ESPN_TAG'/);
  });

  it("every provider key the broadcast mapper emits for TNF/MLB/FOX is seeded", () => {
    for (const b of ["Prime Video", "MLB.TV", "FOX", "NFL Network", "Apple TV"]) {
      for (const k of getBroadcastProviderKeys(b).filter((k) =>
        ["prime_video", "mlb_tv", "fox_sports", "nfl_network", "apple_tv_plus"].includes(k)
      )) {
        expect(sql).toContain(`('${k}',`);
      }
    }
  });
});
