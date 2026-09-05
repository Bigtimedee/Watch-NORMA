import {
  assertDemoSeedAllowed,
  DEMO_SEED_DENIED_MISSING_FLAG,
  DEMO_SEED_DENIED_PRODUCTION,
  extractSupabaseProjectRef,
  isProductionSupabaseTarget,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from "../demo-seed-guard";

describe("extractSupabaseProjectRef", () => {
  it("reads the project ref from a hosted URL", () => {
    expect(
      extractSupabaseProjectRef(
        `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`
      )
    ).toBe(PRODUCTION_SUPABASE_PROJECT_REF);
  });

  it("returns null for local or unparseable URLs", () => {
    expect(extractSupabaseProjectRef("http://127.0.0.1:54321")).toBe(null);
    expect(extractSupabaseProjectRef("not a url")).toBe(null);
    expect(extractSupabaseProjectRef(undefined)).toBe(null);
  });
});

describe("isProductionSupabaseTarget", () => {
  it("flags the production project URL", () => {
    expect(
      isProductionSupabaseTarget({
        SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      })
    ).toBe(true);
  });

  it("flags EXPO_PUBLIC_SUPABASE_URL pointing at production", () => {
    expect(
      isProductionSupabaseTarget({
        EXPO_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      })
    ).toBe(true);
  });

  it("flags an explicit production project ref", () => {
    expect(
      isProductionSupabaseTarget({
        SUPABASE_PROJECT_REF: PRODUCTION_SUPABASE_PROJECT_REF,
        SUPABASE_URL: "https://staging-xxxx.supabase.co",
      })
    ).toBe(true);
  });

  it("flags APP_ENV=production even on a staging URL", () => {
    expect(
      isProductionSupabaseTarget({
        SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
        APP_ENV: "production",
      })
    ).toBe(true);
    expect(
      isProductionSupabaseTarget({
        SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
        NODE_ENV: "prod",
      })
    ).toBe(true);
  });

  it("allows local and staging targets", () => {
    expect(
      isProductionSupabaseTarget({
        SUPABASE_URL: "http://127.0.0.1:54321",
      })
    ).toBe(false);
    expect(
      isProductionSupabaseTarget({
        SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
        APP_ENV: "staging",
      })
    ).toBe(false);
  });
});

describe("assertDemoSeedAllowed", () => {
  it("fails hard without ALLOW_DEMO_SEED=1", () => {
    expect(() =>
      assertDemoSeedAllowed({
        SUPABASE_URL: "http://127.0.0.1:54321",
      })
    ).toThrow(DEMO_SEED_DENIED_MISSING_FLAG);
  });

  it("fails hard when ALLOW_DEMO_SEED is set but the target is production", () => {
    expect(() =>
      assertDemoSeedAllowed({
        ALLOW_DEMO_SEED: "1",
        SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      })
    ).toThrow(DEMO_SEED_DENIED_PRODUCTION);
  });

  it("fails when EXPO_PUBLIC_SUPABASE_URL is production even if SUPABASE_URL is local", () => {
    expect(() =>
      assertDemoSeedAllowed({
        ALLOW_DEMO_SEED: "1",
        SUPABASE_URL: "http://127.0.0.1:54321",
        EXPO_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      })
    ).toThrow(DEMO_SEED_DENIED_PRODUCTION);
  });

  it("allows local seed only with the explicit flag", () => {
    expect(() =>
      assertDemoSeedAllowed({
        ALLOW_DEMO_SEED: "1",
        SUPABASE_URL: "http://127.0.0.1:54321",
        APP_ENV: "local",
      })
    ).not.toThrow();
  });
});
