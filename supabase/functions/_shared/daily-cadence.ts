// =============================================================================
// daily-cadence.ts — Shared cadence constants and helpers
//
// Enforces 4-post minimum / 8-post maximum per day across X, Instagram, and
// Facebook combined (TikTok and Reddit are excluded from the cap).
//
// Day boundary is Eastern Time (handles DST via the Postgres RPCs).
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// deno-lint-ignore no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any>>;

export const CADENCE_PLATFORMS = ["x", "instagram", "facebook"] as const;
export type CadencePlatform = typeof CADENCE_PLATFORMS[number];

export const DAILY_MIN = 4;
export const DAILY_MAX = 8;

/**
 * Count posts already queued (generated or published) today for the given
 * platforms, using the ET-based day boundary defined in the Postgres RPC.
 */
export async function countQueuedToday(
  supabase: SupabaseClient,
  platforms: string[],
): Promise<number> {
  const { data, error } = await supabase.rpc("social_posts_queued_today", {
    p_platforms: platforms,
  });
  if (error) throw new Error(`countQueuedToday: ${error.message}`);
  return (data as number) ?? 0;
}

/**
 * Count posts already published today for the given platforms,
 * using the ET-based day boundary defined in the Postgres RPC.
 */
export async function countPublishedToday(
  supabase: SupabaseClient,
  platforms: string[],
): Promise<number> {
  const { data, error } = await supabase.rpc("social_posts_published_today", {
    p_platforms: platforms,
  });
  if (error) throw new Error(`countPublishedToday: ${error.message}`);
  return (data as number) ?? 0;
}
