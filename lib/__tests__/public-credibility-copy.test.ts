/**
 * Guards public marketing / developer surfaces against unverified claims
 * (2026-11-07 credibility pass):
 *  - no self-reported App Store star rating on the homepage
 *  - no hardcoded CTR ranges (never measured) in the site, discovery
 *    manifests, OpenAPI spec, moment-types API, or marketing docs
 *  - no stale "Q3 2025" OpenRTB roadmap promise or "registered in AAMP" claim
 *    while AAMP seller registration is still in progress
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const UNMEASURED_CTR = /1[12][-–]1[78]\s?%|\b9[-–]1[58]\s?%/;

describe("public credibility copy", () => {
  it("homepage has no star rating and counts every live league", () => {
    const src = read("web/src/app/page.tsx");
    expect(src).not.toMatch(/★/);
    expect(src).not.toMatch(/5\.0 App Store/);
    expect(src).not.toMatch(/3 Sports Covered/);
    expect(src).not.toMatch(/Live Now — NBA · MLB · NCAA</);
    expect(src).toMatch(/Live Now — NFL · NCAAF · NBA · NCAAM · MLB/);
  });

  it("/developers has no stale roadmap date and no completed-AAMP claim", () => {
    const src = read("web/src/app/developers/page.tsx");
    expect(src).not.toMatch(/Q3 2025/);
    expect(src).not.toMatch(/is registered in the IAB AAMP/);
    expect(src).not.toMatch(/2025-\d\d-\d\d/);
    expect(src).toMatch(/AAMP seller registration is in progress/);
  });

  it("moment-types API and discovery manifests publish no CTR ranges", () => {
    const route = read("web/src/app/api/ads/moment-types/route.ts");
    expect(route).not.toMatch(/typical_ctr_(low|high):\s*\d/);
    for (const rel of ["web/public/adagents.json", "web/public/.well-known/adagents.json"]) {
      const manifest = JSON.parse(read(rel));
      expect(JSON.stringify(manifest)).not.toMatch(/typical_ctr_range/);
      expect(manifest.protocols_supported).not.toContain("openrtb@2.6");
    }
    const spec = read("web/public/.well-known/openapi.json");
    expect(spec).not.toMatch(/"typical_ctr_(low|high)":\s*\d/);
  });

  it("marketing and partner docs carry no unmeasured CTR ranges", () => {
    const files = [
      "docs/marketing/agentic-launch-post.md",
      "docs/marketing/agentic-social-thread.md",
      "docs/partner-api/mcp-server-brief.md",
      "docs/partnerships/sportsbook-advertiser-package.md",
      "docs/agentic-ads/outreach/email-yahoo-dsp.md",
      "docs/agentic-ads/outreach/email-kochava.md",
      "docs/agentic-ads/outreach/email-admaven.md",
      "packages/norma-ads-mcp/README.md",
    ];
    for (const rel of files) {
      expect({ rel, hit: UNMEASURED_CTR.test(read(rel)) }).toEqual({ rel, hit: false });
    }
  });
});
