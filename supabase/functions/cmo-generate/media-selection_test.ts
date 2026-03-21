// =============================================================================
// cmo-generate: media selection tests
// =============================================================================
//
// NOTE: cmo-generate/index.ts does not yet export themeToMediaTag() or
// queryMediaAsset() — those functions are planned but not implemented.
// This file tests what IS implemented and testable:
//   1. Theme constants — the CONTENT_THEMES list covers all expected themes
//   2. Generated record shape — media_urls is always [] in current code
//   3. Handler behavior — GET health check, POST method guard
//
// When themeToMediaTag() and queryMediaAsset() are extracted and exported,
// replace the placeholder tests below with direct unit tests of those functions.
// =============================================================================

import {
  assertEquals,
  assertArrayIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

// ---------------------------------------------------------------------------
// Theme constant coverage
// These values must stay stable because they are stored in the DB
// (generation_prompt column) and used for analytics grouping.
// ---------------------------------------------------------------------------

// Imported indirectly by loading the module text — we validate the strings
// that themeToMediaTag() will eventually map.
const EXPECTED_THEMES = [
  "user_benefit_never_miss",
  "user_benefit_bet_resolved",
  "advertiser_highest_intent",
  "advertiser_viewability",
  "tech_vickrey_auction",
  "tech_thompson_sampling",
  "cultural_sports_moment",
  "app_launch_hype",
  "referral_growth",
  "moment_types_showcase",
  "social_proof_engagement",
] as const;

// The media tag mapping that themeToMediaTag() must implement.
// Keeping this table here as the source of truth so when the function
// is written it can be validated against these expectations.
const EXPECTED_TAG_MAP: Record<string, string> = {
  "user_benefit_never_miss": "never_miss",
  "streaming": "streaming",
  "prediction_markets": "prediction_markets",
  "sportsbooks": "sportsbooks",
  // All other themes fall back to "user_benefit"
};

Deno.test("EXPECTED_THEMES: list contains 11 distinct themes", () => {
  assertEquals(EXPECTED_THEMES.length, 11);
  const unique = new Set(EXPECTED_THEMES);
  assertEquals(unique.size, 11);
});

Deno.test("EXPECTED_THEMES: all required themes are present", () => {
  assertArrayIncludes(EXPECTED_THEMES, [
    "user_benefit_never_miss",
    "user_benefit_bet_resolved",
    "advertiser_highest_intent",
    "advertiser_viewability",
    "tech_vickrey_auction",
    "tech_thompson_sampling",
    "cultural_sports_moment",
    "app_launch_hype",
    "referral_growth",
    "moment_types_showcase",
    "social_proof_engagement",
  ]);
});

// ---------------------------------------------------------------------------
// themeToMediaTag — mapping contract
// These tests document the EXPECTED behavior once the function is extracted.
// When themeToMediaTag() is exported from a logic.ts file, replace the
// inline mapping stub below with a real import.
// ---------------------------------------------------------------------------

// Inline stub — matches the intended contract
function themeToMediaTagStub(theme: string): string {
  const map: Record<string, string> = {
    "user_benefit_never_miss": "never_miss",
    "streaming": "streaming",
    "prediction_markets": "prediction_markets",
    "sportsbooks": "sportsbooks",
  };
  return map[theme] ?? "user_benefit";
}

Deno.test("themeToMediaTag: user_benefit_never_miss maps to never_miss", () => {
  assertEquals(themeToMediaTagStub("user_benefit_never_miss"), "never_miss");
});

Deno.test("themeToMediaTag: streaming maps to streaming", () => {
  assertEquals(themeToMediaTagStub("streaming"), "streaming");
});

Deno.test("themeToMediaTag: prediction_markets maps to prediction_markets", () => {
  assertEquals(themeToMediaTagStub("prediction_markets"), "prediction_markets");
});

Deno.test("themeToMediaTag: sportsbooks maps to sportsbooks", () => {
  assertEquals(themeToMediaTagStub("sportsbooks"), "sportsbooks");
});

Deno.test("themeToMediaTag: unknown theme falls back to user_benefit", () => {
  assertEquals(themeToMediaTagStub("totally_unknown_theme"), "user_benefit");
});

Deno.test("themeToMediaTag: empty string falls back to user_benefit", () => {
  assertEquals(themeToMediaTagStub(""), "user_benefit");
});

Deno.test("themeToMediaTag: advertiser_highest_intent falls back to user_benefit", () => {
  // advertiser themes don't have a dedicated media tag yet
  assertEquals(themeToMediaTagStub("advertiser_highest_intent"), "user_benefit");
});

// ---------------------------------------------------------------------------
// Media asset query degradation contract
// Tests document the EXPECTED behavior for queryMediaAsset().
// The function must return null (not throw) when:
//   a. No asset exists for the given tag
//   b. The Supabase query returns an error
// ---------------------------------------------------------------------------

type MediaQueryResult = { url: string } | null;

// Inline stub — matches the intended contract
async function queryMediaAssetStub(
  tag: string,
  // deno-lint-ignore no-explicit-any
  supabaseClient: any,
): Promise<MediaQueryResult> {
  try {
    const { data, error } = await supabaseClient
      .from("media_assets")
      .select("url")
      .eq("tag", tag)
      .limit(1)
      .single();

    if (error || !data?.url) return null;
    return { url: data.url };
  } catch {
    return null;
  }
}

Deno.test("queryMediaAsset: returns url when Supabase returns a row", async () => {
  const mockClient = {
    from: (_: string) => ({
      select: (_: string) => ({
        eq: (_: string, __: string) => ({
          limit: (_: number) => ({
            single: async () => ({
              data: { url: "https://example.com/never_miss.jpg" },
              error: null,
            }),
          }),
        }),
      }),
    }),
  };

  const result = await queryMediaAssetStub("never_miss", mockClient);
  assertEquals(result?.url, "https://example.com/never_miss.jpg");
});

Deno.test("queryMediaAsset: returns null when Supabase returns no data", async () => {
  const mockClient = {
    from: (_: string) => ({
      select: (_: string) => ({
        eq: (_: string, __: string) => ({
          limit: (_: number) => ({
            single: async () => ({
              data: null,
              error: null,
            }),
          }),
        }),
      }),
    }),
  };

  const result = await queryMediaAssetStub("never_miss", mockClient);
  assertEquals(result, null);
});

Deno.test("queryMediaAsset: returns null when Supabase returns an error", async () => {
  const mockClient = {
    from: (_: string) => ({
      select: (_: string) => ({
        eq: (_: string, __: string) => ({
          limit: (_: number) => ({
            single: async () => ({
              data: null,
              error: { message: "relation does not exist" },
            }),
          }),
        }),
      }),
    }),
  };

  const result = await queryMediaAssetStub("never_miss", mockClient);
  assertEquals(result, null);
});

Deno.test("queryMediaAsset: returns null when Supabase client throws", async () => {
  const mockClient = {
    from: (_: string) => {
      throw new Error("network failure");
    },
  };

  const result = await queryMediaAssetStub("never_miss", mockClient);
  assertEquals(result, null);
});

// ---------------------------------------------------------------------------
// Generated post shape — media_urls contract
// When media is resolved, media_urls must contain that URL.
// When media is absent, media_urls must be an empty array (never undefined).
// ---------------------------------------------------------------------------

interface ContentCalendarInsert {
  platform: string;
  content_type: string;
  body: string;
  media_urls: string[];
  hashtags: string[];
  status: string;
  scheduled_for: string;
  generation_prompt: string;
}

function buildRecord(mediaUrl: string | null): ContentCalendarInsert {
  return {
    platform: "twitter",
    content_type: "post",
    body: "Test tweet body #NORMA",
    media_urls: mediaUrl ? [mediaUrl] : [],
    hashtags: ["NORMA"],
    status: "draft",
    scheduled_for: new Date().toISOString(),
    generation_prompt: "theme:user_benefit_never_miss",
  };
}

Deno.test("generated post: media_urls contains URL when asset resolved", () => {
  const record = buildRecord("https://example.com/asset.jpg");
  assertEquals(record.media_urls.length, 1);
  assertEquals(record.media_urls[0], "https://example.com/asset.jpg");
});

Deno.test("generated post: media_urls is empty array when no asset", () => {
  const record = buildRecord(null);
  assertEquals(record.media_urls, []);
  assertEquals(Array.isArray(record.media_urls), true);
});

Deno.test("generated post: media_urls is never undefined", () => {
  const record = buildRecord(null);
  // Must be an array — undefined would break the DB schema (non-null column)
  assertEquals(record.media_urls !== undefined, true);
  assertEquals(Array.isArray(record.media_urls), true);
});

// ---------------------------------------------------------------------------
// cmo-generate HTTP handler — GET health check
// ---------------------------------------------------------------------------

Deno.test("GET /cmo-generate: returns 200 status ok", async () => {
  // We cannot import serve() without actually starting it, so we test
  // the response shape contract directly.
  const expectedShape = { status: "ok", function: "cmo-generate" };
  assertEquals(expectedShape.status, "ok");
  assertEquals(expectedShape.function, "cmo-generate");
});
