import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { buildPrescreenPrompt, parsePrescreenResponse } from "./rubric.ts";

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

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      await supabase
        .from("creatives")
        .update({ prescreen_status: "error", prescreen_at: new Date().toISOString() })
        .eq("id", creative_id);
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const demandType = (creative.campaigns as any)?.demand_type ?? null;
    const prompt = buildPrescreenPrompt({
      sponsor_text: creative.sponsor_text,
      cta_text: creative.cta_text,
      cta_url: creative.cta_url,
      demand_type: demandType,
    });

    const claudeController = new AbortController();
    const claudeTimer = setTimeout(() => claudeController.abort(), 20000);
    let rawText = "";
    try {
      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        signal: claudeController.signal,
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 256,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      clearTimeout(claudeTimer);
      const claudeJson = await claudeRes.json();
      rawText = claudeJson?.content?.[0]?.text ?? "";
    } catch (err) {
      clearTimeout(claudeTimer);
      await supabase
        .from("creatives")
        .update({ prescreen_status: "error", prescreen_at: new Date().toISOString() })
        .eq("id", creative_id);
      return new Response(
        JSON.stringify({ error: "Claude API call failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = parsePrescreenResponse(rawText);

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
