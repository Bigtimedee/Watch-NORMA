// intent-api: Programmatic Intent API for server-to-server buyers (P2-09)
// STATUS: Scaffolded — gated by INTENT_API_ENABLED secret. Not in production.
// Contact bd@norma-app.com to activate.
//
// Auth: Bearer <api_key> → SHA-256 hash lookup in api_keys table.
// Rate limit: 50 req/min per key (in-memory, resets on cold start).
// Routes: GET /inventory (supply forecasts), POST /bid (enters existing Vickrey auction).
// Aggregate-only: no user data ever returned. Clearing logic unchanged.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const RATE_LIMIT_PER_MINUTE = 50;
const rateLimitCounters = new Map<number, { count: number; windowStart: number }>();

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function checkRateLimit(keyId: number): boolean {
  const now = Date.now();
  const entry = rateLimitCounters.get(keyId);
  if (!entry || now - entry.windowStart > 60_000) {
    rateLimitCounters.set(keyId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_PER_MINUTE) return false;
  entry.count++;
  return true;
}

async function authenticateKey(
  supabase: ReturnType<typeof createClient>,
  authHeader: string | null
): Promise<{ keyRow: any; error?: string }> {
  if (!authHeader?.startsWith("Bearer ")) {
    return { keyRow: null, error: "Missing or invalid Authorization header" };
  }
  const rawKey = authHeader.slice(7);
  const hash = await sha256Hex(rawKey);

  const { data: keyRow } = await supabase
    .from("api_keys")
    .select("id, advertiser_id, scopes, rate_limit_per_minute, is_active, revoked_at")
    .eq("key_hash", hash)
    .single();

  if (!keyRow) return { keyRow: null, error: "Invalid API key" };
  if (!keyRow.is_active || keyRow.revoked_at) return { keyRow: null, error: "API key revoked" };

  // Update last_used_at (fire and forget)
  supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id).then(() => {});

  return { keyRow };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Gate: not in production until INTENT_API_ENABLED is set
  if (Deno.env.get("INTENT_API_ENABLED") !== "true") {
    return new Response(
      JSON.stringify({
        error: "Programmatic Intent API not yet in production.",
        note: "Contact bd@norma-app.com to activate.",
        api_version: "v1",
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/intent-api/, "");

  // Authenticate
  const { keyRow, error: authError } = await authenticateKey(supabase, req.headers.get("Authorization"));
  if (authError || !keyRow) {
    return new Response(JSON.stringify({ error: authError ?? "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Rate limit
  if (!checkRateLimit(keyRow.id)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded", retry_after_seconds: 60 }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // GET /inventory
    if (req.method === "GET" && path === "/inventory") {
      const today = new Date().toISOString().split("T")[0];
      const { data: forecasts } = await supabase
        .from("supply_forecasts")
        .select("forecast_date, moment_type, league, predicted_moments, predicted_moments_low, predicted_moments_high, confidence, games_scheduled, basis_note")
        .gte("forecast_date", today)
        .order("forecast_date")
        .order("moment_type");

      // Join floor prices for each moment_type
      const { data: floors } = await supabase
        .from("floor_prices")
        .select("moment_type, floor_cents")
        .is("sport", null); // global floors

      const floorMap = new Map((floors ?? []).map((f: any) => [f.moment_type, f.floor_cents]));

      const inventory = (forecasts ?? []).map((f: any) => ({
        forecast_date: f.forecast_date,
        moment_type: f.moment_type,
        league: f.league,
        predicted_moments: f.predicted_moments,
        predicted_moments_low: f.predicted_moments_low,
        predicted_moments_high: f.predicted_moments_high,
        floor_cents: floorMap.get(f.moment_type) ?? null,
        basis_note: f.basis_note,
      }));

      return new Response(JSON.stringify({
        api_version: "v1",
        inventory,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // POST /bid
    if (req.method === "POST" && path === "/bid") {
      if (!keyRow.scopes?.includes("bid:write")) {
        return new Response(JSON.stringify({ error: "API key lacks bid:write scope" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = await req.json();
      const { campaign_id, moment_type, bid_cents } = body;

      if (!campaign_id || !moment_type || typeof bid_cents !== "number") {
        return new Response(JSON.stringify({ error: "Required: campaign_id, moment_type, bid_cents" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify campaign belongs to this advertiser
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("id, advertiser_id, status")
        .eq("id", campaign_id)
        .eq("advertiser_id", keyRow.advertiser_id)
        .single();

      if (!campaign) {
        return new Response(JSON.stringify({ error: "Campaign not found or not owned by this advertiser" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (campaign.status !== "active") {
        return new Response(JSON.stringify({ error: "Campaign is not active" }), {
          status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate bid against floor
      const { data: floorRow } = await supabase
        .from("floor_prices")
        .select("floor_cents")
        .eq("moment_type", moment_type)
        .is("sport", null)
        .single();

      const floorCents = floorRow?.floor_cents ?? 10;
      if (bid_cents < floorCents) {
        return new Response(JSON.stringify({
          error: `Bid (${bid_cents}c) is below floor for ${moment_type} (${floorCents}c)`,
        }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (bid_cents > 500) {
        return new Response(JSON.stringify({ error: "Bid exceeds maximum (500c = $5.00)" }), {
          status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get first creative for this campaign
      const { data: creative } = await supabase
        .from("creatives")
        .select("id")
        .eq("campaign_id", campaign_id)
        .limit(1)
        .single();

      if (!creative) {
        return new Response(JSON.stringify({ error: "Campaign has no creatives — create a creative first" }), {
          status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Upsert bid (idempotent on campaign_id + moment_type)
      const { data: bid, error: bidError } = await supabase
        .from("bids")
        .upsert({
          campaign_id,
          creative_id: creative.id,
          moment_type,
          bid_cents,
        }, { onConflict: "campaign_id,moment_type" })
        .select("id")
        .single();

      if (bidError) throw bidError;

      return new Response(JSON.stringify({
        accepted: true,
        bid_id: bid?.id,
        clearing_note: "Bid enters existing second-price Vickrey auction. You pay at most $0.01 above the second-highest bid. Clearing logic is unchanged.",
        api_version: "v1",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Not found", routes: ["GET /inventory", "POST /bid"] }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("intent-api error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
