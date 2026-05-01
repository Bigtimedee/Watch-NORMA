/**
 * Enforcement test: NORMA social pipeline must never use AI image generation.
 *
 * All images must come from real NORMA app screenshots stored in Supabase Storage.
 * This test suite guards against future re-introduction of AI image generation
 * (DALL-E, Stable Diffusion, Midjourney, Replicate, etc.) into the social pipeline.
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFile(relPath: string): string {
  const abs = path.resolve(__dirname, "../../", relPath);
  return fs.readFileSync(abs, "utf-8");
}

/** Strip TypeScript/JS comments from source before scanning for API patterns */
function stripComments(src: string): string {
  // Remove block comments /* ... */
  let out = src.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove single-line comments // ...
  out = out.replace(/\/\/[^\n]*/g, "");
  return out;
}

function readAllTsFiles(dir: string): Array<{ file: string; content: string }> {
  const abs = path.resolve(__dirname, "../../", dir);
  if (!fs.existsSync(abs)) return [];
  const entries = fs.readdirSync(abs, { withFileTypes: true });
  const results: Array<{ file: string; content: string }> = [];
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith(".ts")) {
      const full = path.join(abs, e.name);
      results.push({ file: path.join(dir, e.name), content: fs.readFileSync(full, "utf-8") });
    } else if (e.isDirectory()) {
      results.push(...readAllTsFiles(path.join(dir, e.name)));
    }
  }
  return results;
}

// Patterns that indicate AI image generation API usage
const AI_IMAGE_PATTERNS = [
  /dalle/i,
  /dall-e/i,
  /openai\.images/i,
  /images\.generate/i,
  /stable.?diffusion/i,
  /replicate\.run/i,
  /midjourney/i,
  /stability\.ai/i,
];

// Social pipeline source directories
const SOCIAL_DIRS = [
  "supabase/functions/generate-social-content",
  "supabase/functions/generate-recap-content",
  "supabase/functions/publish-social-posts",
  "supabase/functions/cmo-generate",
  "supabase/functions/cmo-publish",
  "supabase/functions/_shared",
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NORMA social pipeline: no AI image generation", () => {
  it("social pipeline TypeScript files must not import AI image APIs", () => {
    const violations: string[] = [];
    for (const dir of SOCIAL_DIRS) {
      const files = readAllTsFiles(dir);
      for (const { file, content } of files) {
        const codeOnly = stripComments(content);
        for (const pattern of AI_IMAGE_PATTERNS) {
          if (pattern.test(codeOnly)) {
            violations.push(`${file} matched pattern ${pattern}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("selectScreenshotUrl returns a Supabase Storage URL, not an AI image endpoint", () => {
    const content = readFile("supabase/functions/_shared/social-content-engine.ts");
    // Function must be present
    expect(content).toMatch(/export function selectScreenshotUrl/);
    // Must return a storage path — not an AI image service URL
    expect(content).toMatch(/\/storage\/v1\/object\/public\/social-images\//);
    // Must not call any AI image service inside (check code, not comments)
    for (const pattern of AI_IMAGE_PATTERNS) {
      const fnStart = content.indexOf("export function selectScreenshotUrl");
      const fnEnd = content.indexOf("\n}", fnStart);
      const fnBody = stripComments(content.slice(fnStart, fnEnd));
      expect(pattern.test(fnBody)).toBe(false);
    }
  });

  it("image_prompt field in GeneratedContent must carry enforcement comment", () => {
    const content = readFile("supabase/functions/_shared/social-content-engine.ts");
    // Both interface definitions must have the enforcement notice
    const enforcePattern = /NEVER pass this to an image generation API/g;
    const matches = content.match(enforcePattern);
    // Appears once in GeneratedContent, once in CarouselSlide
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("real NORMA screenshot files are present in assets/media", () => {
    const mediaDir = path.resolve(__dirname, "../../supabase/assets/media");
    expect(fs.existsSync(mediaDir)).toBe(true);
    const pngs = fs.readdirSync(mediaDir).filter((f) => f.endsWith(".png") || f.endsWith(".jpg"));
    // At least 5 approved screenshot assets must be present
    expect(pngs.length).toBeGreaterThanOrEqual(5);
    // Each file must be a plausible screenshot (> 50 KB)
    for (const png of pngs) {
      const { size } = fs.statSync(path.join(mediaDir, png));
      expect(size).toBeGreaterThan(50_000);
    }
  });

  it("migration 029 cron comment must not reference DALL-E", () => {
    const content = readFile("supabase/migrations/029_social_cron.sql");
    expect(content).not.toMatch(/dall-e/i);
    expect(content).not.toMatch(/dalle/i);
  });
});
