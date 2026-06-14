// purge-old-data: Scheduled data-retention cleanup for high-volume tables.
// Runs daily at 9 AM UTC (4 AM ET) via pg_cron (migration 068).
//
// Retention windows:
//   game_snapshots:  30 days
//   deep_link_events: 90 days
//   delivery_log:   180 days
//   impressions:    13 months (397 days) — advertiser YoY reporting requires this
//   conversions:    cascades with impressions (ON DELETE CASCADE)
//
// All deletes are batched to avoid holding long locks.
// dry_run=true (default when invoked without a body) returns counts only — no rows deleted.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ---------------------------------------------------------------------------
// Retention constants (days)
// ---------------------------------------------------------------------------

const RETENTION = {
  game_snapshots: 30,
  deep_link_events: 90,
  delivery_log: 180,
  impressions: 397,  // 13 months — advertiser YoY reporting
} as const;

const BATCH_SIZE = 500;  // rows per DELETE to avoid long locks

// ---------------------------------------------------------------------------
// Helper: batch-delete rows older than cutoff, return total deleted
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
async function batchDelete(
  supabase: any,
  table: string,
  timestampColumn: string,
  cutoff: string,
  dryRun: boolean,
): Promise<{ table: string; rows_would_delete: number; rows_deleted: number }> {
  // Count rows that would be deleted (always run, even in live mode — cheap and useful for logs)
  const { count } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .lt(timestampColumn, cutoff);

  const rowsWouldDelete = count ?? 0;

  if (dryRun || rowsWouldDelete === 0) {
    return { table, rows_would_delete: rowsWouldDelete, rows_deleted: 0 };
  }

  // Batched deletes
  let totalDeleted = 0;

  // Supabase JS doesn't support LIMIT on DELETE directly.
  // Work around by first fetching a batch of IDs, then deleting by ID.
  while (true) {
    const { data: batch, error: fetchErr } = await supabase
      .from(table)
      .select("id")
      .lt(timestampColumn, cutoff)
      .limit(BATCH_SIZE);

    if (fetchErr) throw new Error(`${table} fetch batch failed: ${fetchErr.message}`);
    if (!batch || batch.length === 0) break;

    const ids = batch.map((r: { id: number | string }) => r.id);

    const { error: delErr } = await supabase
      .from(table)
      .delete()
      .in("id", ids);

    if (delErr) throw new Error(`${table} delete batch failed: ${delErr.message}`);

    totalDeleted += ids.length;

    // If batch was smaller than BATCH_SIZE, we're done
    if (ids.length < BATCH_SIZE) break;
  }

  return { table, rows_would_delete: rowsWouldDelete, rows_deleted: totalDeleted };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startMs = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // dry_run defaults to true unless explicitly set to false in request body
    let dryRun = true;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.dry_run === false) dryRun = false;
      } catch {
        // malformed body — treat as dry run
      }
    }

    const now = new Date();

    function cutoff(days: number): string {
      return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    }

    // Step 1: Refresh the daily_impression_stats materialized view BEFORE purging impressions.
    // This ensures rollups include all rows that are about to be deleted.
    if (!dryRun) {
      const { error: refreshErr } = await supabase.rpc("refresh_daily_impression_stats");
      if (refreshErr) {
        // Non-fatal: log and proceed — stale rollup is better than failed purge
        console.error("refresh_daily_impression_stats failed:", refreshErr.message);
      }
    }

    // Step 2: Purge each table
    const results = await Promise.all([
      batchDelete(supabase, "game_snapshots", "created_at", cutoff(RETENTION.game_snapshots), dryRun),
      batchDelete(supabase, "deep_link_events", "created_at", cutoff(RETENTION.deep_link_events), dryRun),
      batchDelete(supabase, "delivery_log", "created_at", cutoff(RETENTION.delivery_log), dryRun),
      batchDelete(supabase, "impressions", "delivered_at", cutoff(RETENTION.impressions), dryRun),
      // conversions cascade-delete with impressions (ON DELETE CASCADE) — no explicit purge needed
    ]);

    const durationMs = Date.now() - startMs;

    console.log(JSON.stringify({
      function: "purge-old-data",
      event: "completed",
      dry_run: dryRun,
      results,
      duration_ms: durationMs,
      timestamp: now.toISOString(),
    }));

    return new Response(
      JSON.stringify({
        dry_run: dryRun,
        retention_days: RETENTION,
        results,
        duration_ms: durationMs,
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const durationMs = Date.now() - startMs;
    console.error("purge-old-data error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message, duration_ms: durationMs }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
