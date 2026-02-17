// send-push: Deliver push notifications via Expo Push API
// Trigger: Called by evaluate-alerts for each new alert

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { alertId } = await req.json();
    if (!alertId) {
      return new Response(
        JSON.stringify({ error: "alertId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get alert details
    const { data: alert, error: alertError } = await supabase
      .from("alerts")
      .select("*")
      .eq("id", alertId)
      .single();

    if (alertError || !alert) {
      return new Response(
        JSON.stringify({ error: "Alert not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (alert.push_sent) {
      return new Response(
        JSON.stringify({ success: true, message: "Push already sent" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's push token
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("push_token, notifications_enabled")
      .eq("id", alert.user_id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!profile.notifications_enabled || !profile.push_token) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Notifications disabled or no push token",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate Expo push token format
    if (!profile.push_token.startsWith("ExponentPushToken[")) {
      console.warn(`Invalid push token format: ${profile.push_token}`);
      return new Response(
        JSON.stringify({ error: "Invalid push token format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send via Expo Push API
    const pushPayload = {
      to: profile.push_token,
      title: alert.title,
      body: alert.body,
      data: {
        gameId: alert.game_id,
        alertId: alert.id,
        alertType: alert.alert_type,
      },
      sound: "default",
      priority: "high",
      channelId: "game-alerts",
    };

    const pushRes = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(pushPayload),
    });

    const pushResult = await pushRes.json();

    if (pushRes.ok) {
      // Mark alert as push_sent
      await supabase
        .from("alerts")
        .update({ push_sent: true })
        .eq("id", alertId);

      return new Response(
        JSON.stringify({
          success: true,
          pushResult,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      console.error("Expo Push API error:", pushResult);
      return new Response(
        JSON.stringify({
          error: "Push delivery failed",
          details: pushResult,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    console.error("send-push error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
