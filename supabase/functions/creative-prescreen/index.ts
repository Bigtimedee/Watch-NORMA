import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  flagPickEmBetNowCopy,
  mergePrescreenResults,
} from "./rubric.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { creative_id } = await req.json();
    if (!creative_id || typeof creative_id !== "number") {
      return new Response(
        JSON.stringify({ error: "creative_id is required and must be a number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: creative, error: fetchError } = await supabase
      .from("creatives")
      .select(`
        id,
        sponsor_text,
        cta_text,
        cta_url,
        campaigns!inner(demand_type)
      `)
      .eq("id", creative_id)
      .maybeSingle();

    if (fetchError || !creative) {
      return new Response(
        JSON.stringify({ error: "Creative not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const demandType = (creative.campaigns as any)?.demand_type ?? null;
    // Deterministic rule-based prescreen only (no external AI provider).
    // Non-rule checks are not automated; flag for human review.
    const llm = { verdict: "flag" as const, reasons: ["Manual review required (automated copy review disabled)"] };
    const result = mergePrescreenResults(
      flagPickEmBetNowCopy({
        sponsor_text: creative.sponsor_text,
        cta_text: creative.cta_text,
        cta_url: creative.cta_url,
        demand_type: demandType,
      }),
      llm,
    );

    await supabase
      .from("creatives")
      .update({
        prescreen_status: result.verdict,
        prescreen_reasons: result.reasons.length > 0 ? result.reasons : null,
        prescreen_at: new Date().toISOString(),
      })
      .eq("id", creative_id);

    console.log(JSON.stringify({
      function: "creative-prescreen",
      creative_id,
      verdict: result.verdict,
      reasons_count: result.reasons.length,
    }));

    return new Response(
      JSON.stringify({ creative_id, verdict: result.verdict, reasons: result.reasons }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
