/**
 * Source guard: no committed script, SQL, cron, or Edge Function may insert
 * `demo-%` games or `DEMO SCREENSHOT` alerts. Screenshot fixtures are
 * local/staging only and must pass `assertDemoSeedAllowed`.
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

const SCAN_DIRS = ["scripts", "supabase/functions", "supabase/migrations"];
const SCAN_FILES = ["supabase/seed.sql"];

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(rel));
    } else if (/\.(ts|tsx|js|mjs|sql)$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

const INSERT_DEMO_GAME = /insert\s+into\s+(?:public\.)?games[\s\S]{0,800}demo-/i;
const INSERT_DEMO_ALERT =
  /insert\s+into\s+(?:public\.)?alerts[\s\S]{0,800}DEMO SCREENSHOT/i;
const LITERAL_DEMO_ID = /['"`]demo-(?:ncaaf|nfl|ncaam|nba|mlb|slate)/i;

describe("no committed demo seed / cron re-insert path", () => {
  const files = [
    ...SCAN_DIRS.flatMap(walk),
    ...SCAN_FILES.filter((rel) => fs.existsSync(path.join(ROOT, rel))),
  ].filter((rel) => !rel.includes("__tests__") && !rel.endsWith("_test.ts"));

  it("finds no INSERT of demo-% games or DEMO SCREENSHOT alerts", () => {
    const offenders: string[] = [];
    for (const rel of files) {
      if (rel.endsWith("seed-demo-screenshot.ts")) continue;
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      if (
        INSERT_DEMO_GAME.test(src) ||
        INSERT_DEMO_ALERT.test(src) ||
        LITERAL_DEMO_ID.test(src)
      ) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("official seed script refuses writes and calls assertDemoSeedAllowed", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "scripts/seed-demo-screenshot.ts"),
      "utf8"
    );
    expect(src).toContain("assertDemoSeedAllowed(");
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.upsert\s*\(/);
    expect(src).toMatch(/does not insert/i);
  });

  it("local seed.sql does not insert screenshot-fixture game ids", () => {
    const src = fs.readFileSync(path.join(ROOT, "supabase/seed.sql"), "utf8");
    expect(src).not.toMatch(/VALUES\s*\(\s*'demo-/i);
    expect(src).not.toMatch(/'DEMO SCREENSHOT/i);
    expect(src).toMatch(/game-1/);
  });

  it("migration trigger rejects demo inserts and does not delete rows", () => {
    const rel = "supabase/migrations/20260905215500_reject_demo_consumer_seed.sql";
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    expect(src).toContain("reject_demo_consumer_seed");
    expect(src).toContain("trg_reject_demo_games");
    expect(src).toContain("trg_reject_demo_alerts");
    expect(src).toMatch(/ILIKE 'demo-%'/);
    expect(src).toMatch(/DEMO SCREENSHOT/);
    expect(src).not.toMatch(/DELETE\s+FROM\s+(?:public\.)?(games|alerts)/i);
    expect(src).toMatch(/Does NOT delete/i);
  });
});

describe("consumer hooks apply demo exclusion", () => {
  it("useGames and useGameDetail import the shared demo guard", () => {
    const games = fs.readFileSync(path.join(ROOT, "hooks/useGames.ts"), "utf8");
    const detail = fs.readFileSync(
      path.join(ROOT, "hooks/useGameDetail.ts"),
      "utf8"
    );
    expect(games).toContain("applyConsumerGameIdFilter");
    expect(games).toContain("excludeDemoGames");
    expect(games).toContain("gamesQueryKey");
    expect(detail).toContain("isDemoGameId");
    expect(detail).toContain("gameDetailQueryKey");
  });

  it("useAlerts applies the shared alert exclusion on list and unread count", () => {
    const src = fs.readFileSync(path.join(ROOT, "hooks/useAlerts.ts"), "utf8");
    expect(src).toContain("applyConsumerAlertFilter");
    expect(src).toContain("excludeDemoAlerts");
    expect(src).toContain("alertsQueryKey");
    expect(src.match(/applyConsumerAlertFilter/g)?.length).toBeGreaterThanOrEqual(
      2
    );
  });

  it("does not keep pre-filter React Query key prefixes", () => {
    const files = [
      "hooks/useGames.ts",
      "hooks/useAlerts.ts",
      "hooks/useGameDetail.ts",
      "hooks/useFollows.ts",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      expect(src).not.toMatch(/queryKey:\s*\[\s*["']games["']/);
      expect(src).not.toMatch(/queryKey:\s*\[\s*["']alerts["']/);
      expect(src).not.toMatch(/queryKey:\s*\[\s*["']followed-games["']/);
      expect(src).not.toMatch(/queryKey:\s*\[\s*["']game["']/);
    }
  });
});
