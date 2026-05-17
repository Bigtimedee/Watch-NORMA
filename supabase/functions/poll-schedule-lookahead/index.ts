// poll-schedule-lookahead: Pre-populate upcoming days' game schedules
// Trigger: pg_cron daily at 8AM UTC (3AM Eastern)
//
// IMPORTANT — auth for cross-function invocation
// -----------------------------------------------
// We previously did:
//   fetch(`${SUPABASE_URL}/functions/v1/poll-schedule`, {
//     headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` }
//   })
// That broke after Supabase rolled out the new API key system. The auto-
// injected SUPABASE_SERVICE_ROLE_KEY is now an `sb_secret_*` opaque key. It
// works as `apikey:` for PostgREST but it is NOT a valid JWT, so the function
// gateway rejects it with UNAUTHORIZED_INVALID_JWT_FORMAT. Result: every
// lookahead run failed silently and no future games were ever pre-populated.
// The Games screen showed "No games on …" for every future date.
//
// `supabase.functions.invoke()` also fails for the same reason — supabase-js
// forwards the client's constructor key as Bearer to the function gateway,
// and that key is the same broken sb_secret_*.
//
// The reliable path: the caller (pg_cron in migration 055, or a manual curl)
// already sends a valid JWT in the inbound Authorization header. We forward
// that exact header to poll-schedule. The cron job's JWT is hardcoded in
// migration 055 to match the working pattern from migration 004.

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

    // Compute today's Eastern date (same pattern as poll-schedule lines 91–103)
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

    // Forward the inbound caller's Authorization header. This is the only
    // header that is guaranteed to be a valid JWT for the function gateway —
    // see file header.
    const inboundAuth = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!inboundAuth) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header on inbound request" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
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
            // Forward the inbound JWT — see file header for why this is the
            // only reliable auth path for cross-function invocation.
            Authorization: inboundAuth,
          },
          body: JSON.stringify({ date: dateStr }),
        });

        const data = await res.json().catch(() => ({}));
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
      successCount: results.filter((r) => r.success).length,
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
