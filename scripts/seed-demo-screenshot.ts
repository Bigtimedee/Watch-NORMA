/**
 * Screenshot-fixture preflight — does NOT insert rows.
 *
 * Demo games (`demo-%`) and `DEMO SCREENSHOT` alerts must never land in
 * production (project ref shijrazlzawjpobrpmnt). The 2026-09-05 incident
 * was an ad-hoc prod insert; this script fails hard if the env points there.
 *
 * Usage (local / staging only):
 *   ALLOW_DEMO_SEED=1 SUPABASE_URL=http://127.0.0.1:54321 \
 *     npx ts-node scripts/seed-demo-screenshot.ts
 *
 * This command only validates the environment. It does not write games or
 * alerts. Capture Expo social screenshots against local Supabase or a
 * dedicated staging project — never production.
 */

import {
  assertDemoSeedAllowed,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from "../lib/demo-seed-guard";

function main(): void {
  assertDemoSeedAllowed(process.env);

  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  console.log(
    JSON.stringify({
      ok: true,
      message:
        "Environment is allowed for local/staging screenshot fixtures. This script does not insert demo rows.",
      supabase_url: url ?? null,
      blocked_production_ref: PRODUCTION_SUPABASE_PROJECT_REF,
    })
  );
}

main();
