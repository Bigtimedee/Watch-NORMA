// poll-schedule-lookahead: Pre-populate upcoming days' game schedules
// Trigger: pg_cron daily at 8AM UTC (3AM Eastern)

import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Read optional days param from POST body (default 5)
    let days = 5;
    try {
      const body = await req.json();
      if (typeof body?.days === "number" && body.days > 0) {
        days = Math.min(body.days, 14); // cap at 14 days
      }
    } catch {
      // No body or invalid JSON — use default
    }

    // Compute today's Eastern date (same pattern as poll-schedule lines 73–83)
    const now = new Date();
    const eastern = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const y = parseInt(eastern.find((p) => p.type === "year")!.value);
    const m = parseInt(eastern.find((p) => p.type === "month")!.value);
    const d = parseInt(eastern.find((p) => p.type === "day")!.value);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const pollScheduleUrl = `${supabaseUrl}/functions/v1/poll-schedule`;

    const datesProcessed: string[] = [];
    const results: Array<{ date: string; success: boolean; data?: unknown; error?: string }> = [];

    // Loop offsets 1 through days sequentially
    for (let offset = 1; offset <= days; offset++) {
      // Safe date construction: new Date(year, month-1, day + offset) handles
      // month/year rollovers correctly without string arithmetic
      const future = new Date(y, m - 1, d + offset);
      const fy = future.getFullYear();
      const fm = String(future.getMonth() + 1).padStart(2, "0");
      const fd = String(future.getDate()).padStart(2, "0");
      const dateStr = `${fy}-${fm}-${fd}`;

      try {
        const res = await fetch(pollScheduleUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ date: dateStr }),
        });

        const data = await res.json();
        datesProcessed.push(dateStr);
        results.push({ date: dateStr, success: res.ok, data });

        console.log(JSON.stringify({
          function: "poll-schedule-lookahead",
          event: "date_processed",
          date: dateStr,
          offset,
          status: res.status,
          timestamp: new Date().toISOString(),
        }));
      } catch (err) {
        const errorMsg = (err as Error).message;
        datesProcessed.push(dateStr);
        results.push({ date: dateStr, success: false, error: errorMsg });
        console.error(`poll-schedule-lookahead: failed for ${dateStr}:`, err);
      }
    }

    const result = {
      success: true,
      datesProcessed,
      results,
    };

    console.log(JSON.stringify({
      function: "poll-schedule-lookahead",
      event: "completed",
      datesProcessed: datesProcessed.length,
      timestamp: new Date().toISOString(),
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("poll-schedule-lookahead error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
