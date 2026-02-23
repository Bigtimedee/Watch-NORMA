// backfill-targets — One-time/on-demand Edge Function to populate parsed_target
// for existing wagers and prediction_positions

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { parseWagerTarget } from "../_shared/wager-target-parser.ts";

const BATCH_SIZE = 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let wagersUpdated = 0;
    let wagersFailed = 0;
    let wagersSkipped = 0;
    let positionsUpdated = 0;
    let positionsFailed = 0;
    let positionsSkipped = 0;

    // --- Backfill wagers ---
    let hasMore = true;
    let offset = 0;

    while (hasMore) {
      const { data: wagers, error } = await supabase
        .from("wagers")
        .select("id, description")
        .is("parsed_target", null)
        .range(offset, offset + BATCH_SIZE - 1);

      if (error) {
        console.error("Error fetching wagers:", error);
        break;
      }

      if (!wagers || wagers.length === 0) {
        hasMore = false;
        break;
      }

      for (const wager of wagers) {
        const parsed = parseWagerTarget(wager.description);

        if (parsed) {
          const { error: updateError } = await supabase
            .from("wagers")
            .update({ parsed_target: parsed })
            .eq("id", wager.id);

          if (updateError) {
            wagersFailed++;
          } else {
            wagersUpdated++;
          }
        } else {
          wagersSkipped++;
        }
      }

      offset += BATCH_SIZE;
      if (wagers.length < BATCH_SIZE) hasMore = false;
    }

    // --- Backfill prediction_positions ---
    hasMore = true;
    offset = 0;

    while (hasMore) {
      const { data: positions, error } = await supabase
        .from("prediction_positions")
        .select("id, market_title")
        .is("parsed_target", null)
        .range(offset, offset + BATCH_SIZE - 1);

      if (error) {
        console.error("Error fetching positions:", error);
        break;
      }

      if (!positions || positions.length === 0) {
        hasMore = false;
        break;
      }

      for (const pos of positions) {
        const parsed = parseWagerTarget(pos.market_title);

        if (parsed) {
          const { error: updateError } = await supabase
            .from("prediction_positions")
            .update({ parsed_target: parsed })
            .eq("id", pos.id);

          if (updateError) {
            positionsFailed++;
          } else {
            positionsUpdated++;
          }
        } else {
          positionsSkipped++;
        }
      }

      offset += BATCH_SIZE;
      if (positions.length < BATCH_SIZE) hasMore = false;
    }

    const result = {
      success: true,
      wagers: {
        updated: wagersUpdated,
        failed: wagersFailed,
        skipped: wagersSkipped,
      },
      positions: {
        updated: positionsUpdated,
        failed: positionsFailed,
        skipped: positionsSkipped,
      },
    };

    console.log(JSON.stringify({
      function: "backfill-targets",
      event: "completed",
      ...result,
      timestamp: new Date().toISOString(),
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("backfill-targets error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
