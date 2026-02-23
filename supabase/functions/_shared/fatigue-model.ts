// NORMA Advertising — User Ad Fatigue Model
// Tracks per-user ad engagement decay to prevent over-monetization

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Compute fatigue score for a user based on recent sponsored alerts.
 *
 * fatigue_score = 0.5^(sponsored_alerts_last_24h / 3)
 *
 * Score interpretation:
 *   1.0    = no recent ads, fully receptive
 *   0.5    = 3 ads in last 24h, moderate fatigue
 *   0.25   = 6 ads in last 24h, high fatigue (skip threshold)
 *   0.125  = 9 ads, very fatigued
 *
 * When fatigue_score < 0.25: skip sponsored attachment.
 * User still gets the organic alert, just without sponsor.
 */
export async function computeFatigueScore(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from("impressions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("delivered_at", cutoff);

  const sponsoredLast24h = count ?? 0;

  return Math.pow(0.5, sponsoredLast24h / 3);
}

/**
 * Get fatigue scores for multiple users at once (batch optimization).
 * Returns a Map of userId -> fatigueScore.
 */
export async function computeFatigueScoresBatch(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("impressions")
    .select("user_id")
    .in("user_id", userIds)
    .gte("delivered_at", cutoff);

  // Count per user
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  }

  // Compute scores
  const scores = new Map<string, number>();
  for (const uid of userIds) {
    const count = counts.get(uid) ?? 0;
    scores.set(uid, Math.pow(0.5, count / 3));
  }

  return scores;
}
