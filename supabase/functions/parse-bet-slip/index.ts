// parse-bet-slip: Screenshot-based wager extraction is disabled.
// The former vision-model path was removed (no third-party AI provider).
// Returns the same response shape with no wagers so clients fall back to
// manual entry instead of erroring.
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  console.log(JSON.stringify({
    function: "parse-bet-slip",
    event: "disabled",
    timestamp: new Date().toISOString(),
  }));
  return new Response(
    JSON.stringify({
      success: false,
      wagers: [],
      confidence: "low",
      error: "Bet slip scanning is unavailable. Please enter your wager manually.",
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
