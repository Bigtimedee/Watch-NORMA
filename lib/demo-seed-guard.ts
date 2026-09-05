/**
 * Hard guard for any script or SQL runner that would insert demo games/alerts.
 *
 * Required:
 *   ALLOW_DEMO_SEED=1
 * Forbidden:
 *   production project ref `shijrazlzawjpobrpmnt`
 *   any URL / env that points at that project
 *   APP_ENV / NODE_ENV / ENVIRONMENT = production|prod
 */

export const PRODUCTION_SUPABASE_PROJECT_REF = "shijrazlzawjpobrpmnt";

export const DEMO_SEED_DENIED_MISSING_FLAG =
  "Refusing demo seed: set ALLOW_DEMO_SEED=1 and use a non-production Supabase project. Production (shijrazlzawjpobrpmnt) must never receive demo-% games or DEMO SCREENSHOT alerts.";

export const DEMO_SEED_DENIED_PRODUCTION =
  "Refusing demo seed: target is Watch-NORMA production (project ref shijrazlzawjpobrpmnt). Seed screenshot fixtures only on local Supabase or a dedicated staging project.";

export interface DemoSeedEnv {
  ALLOW_DEMO_SEED?: string;
  SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_PROJECT_REF?: string;
  APP_ENV?: string;
  NODE_ENV?: string;
  ENVIRONMENT?: string;
}

export function extractSupabaseProjectRef(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isProductionSupabaseTarget(
  env: DemoSeedEnv = process.env
): boolean {
  const candidates = [
    env.SUPABASE_URL,
    env.EXPO_PUBLIC_SUPABASE_URL,
    env.SUPABASE_PROJECT_REF,
  ];
  for (const value of candidates) {
    if (!value) continue;
    if (value.toLowerCase().includes(PRODUCTION_SUPABASE_PROJECT_REF)) {
      return true;
    }
    if (extractSupabaseProjectRef(value) === PRODUCTION_SUPABASE_PROJECT_REF) {
      return true;
    }
  }

  const envName = (
    env.APP_ENV ??
    env.ENVIRONMENT ??
    env.NODE_ENV ??
    ""
  )
    .trim()
    .toLowerCase();
  return envName === "production" || envName === "prod";
}

export function assertDemoSeedAllowed(env: DemoSeedEnv = process.env): void {
  if (env.ALLOW_DEMO_SEED !== "1") {
    throw new Error(DEMO_SEED_DENIED_MISSING_FLAG);
  }
  if (isProductionSupabaseTarget(env)) {
    throw new Error(DEMO_SEED_DENIED_PRODUCTION);
  }
}
