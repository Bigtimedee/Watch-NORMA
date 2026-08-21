import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
const APP_URL = Deno.env.get("PUBLIC_APP_URL") ?? "https://getnorma.app";


const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: jsonHeaders }
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: jsonHeaders }
      );
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: jsonHeaders }
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Upsert referral code row for this user
    const { data, error } = await admin
      .from("referral_codes")
      .upsert({ user_id: user.id }, { onConflict: "user_id" })
      .select("code, uses")
      .single();

    if (error || !data) {
      console.error("get-referral-code error:", error?.message);
      return new Response(
        JSON.stringify({ error: "Failed to load referral code" }),
        { status: 500, headers: jsonHeaders }
      );
    }

    // Count qualifying referrals: users referred by this user who received their first alert
    const { data: referredRows } = await admin
      .from("referrals")
      .select("referred_id")
      .eq("referrer_id", user.id);

    const referredIds = (referredRows ?? [])
      .map((r: { referred_id: string }) => r.referred_id)
      .filter(Boolean);

    let qualifyingReferrals = 0;
    if (referredIds.length > 0) {
      const { count } = await admin
        .from("app_events")
        .select("user_id", { count: "exact", head: true })
        .eq("event_name", "first_alert_received")
        .in("user_id", referredIds);
      qualifyingReferrals = count ?? 0;
    }

    // Auto-grant NORMA Insider at milestone 3
    if (qualifyingReferrals >= 3) {
      const { data: existingReward } = await admin
        .from("referral_rewards")
        .select("id")
        .eq("referrer_user_id", user.id)
        .eq("milestone", 3)
        .maybeSingle();

      if (!existingReward) {
        await admin
          .from("referral_rewards")
          .insert({ referrer_user_id: user.id, milestone: 3 });
        await admin
          .from("profiles")
          .update({ insider_status: true })
          .eq("id", user.id);
      }
    }

    // Read current insider status
    const { data: profileRow } = await admin
      .from("profiles")
      .select("insider_status")
      .eq("id", user.id)
      .single();

    const insiderStatus = profileRow?.insider_status ?? false;

    return new Response(
      JSON.stringify({
        code: data.code,
        uses: data.uses,
        // NORMA's domain is getnorma.app. norma-app.com is not ours and was shipping
        // in every shared invite (fixed 2026-08-20). Deep-links to the app via the
        // registered "norma" scheme, with the site as the web fallback for people
        // who do not have the app installed yet.
        link: `${APP_URL}/?ref=${data.code}`,
        qualifying_referrals: qualifyingReferrals,
        insider_status: insiderStatus,
      }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (err) {
    console.error("get-referral-code error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
