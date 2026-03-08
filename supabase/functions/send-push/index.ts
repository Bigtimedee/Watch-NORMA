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
      // Record throttled delivery
      await supabase
        .from("delivery_log")
        .insert({
          alert_id: alertId,
          channel: "push",
          status: "throttled",
          error_detail: !profile.notifications_enabled ? "notifications_disabled" : "no_push_token",
        })
        ; // ignore errors

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

    // Build push body — append sponsor text if present
    let pushBody = alert.body;
    if (alert.sponsor_text) {
      pushBody = `${alert.body}\n${alert.sponsor_text}`;
    }

    // Count unread alerts for badge (alerts not yet seen via push)
    const { count: unreadCount } = await supabase
      .from("alerts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", alert.user_id)
      .eq("read", false);

    const badgeCount = (unreadCount ?? 0) + 1; // +1 for the current alert

    // Send via Expo Push API
    const pushPayload: Record<string, unknown> = {
      to: profile.push_token,
      title: alert.title,
      body: pushBody,
      data: {
        gameId: alert.game_id,
        alertId: alert.id,
        alertType: alert.alert_type,
        // Sponsor data for client-side rendering
        ...(alert.sponsor_text && {
          sponsorText: alert.sponsor_text,
          sponsorCtaUrl: alert.sponsor_cta_url,
          sponsorLogoUrl: alert.sponsor_logo_url,
        }),
      },
      sound: "default",
      priority: "high",
      channelId: "game-alerts",
      badge: badgeCount,
      ttl: 86400,
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

    // Extract provider message ID from Expo response
    const ticketId = pushResult?.data?.id ?? pushResult?.id ?? null;

    if (pushRes.ok) {
      // Mark alert as push_sent
      await supabase
        .from("alerts")
        .update({ push_sent: true })
        .eq("id", alertId);

      // Record successful delivery
      await supabase
        .from("delivery_log")
        .insert({
          alert_id: alertId,
          channel: "push",
          provider_message_id: ticketId,
          status: "sent",
        })
        ; // non-critical, ignore errors

      console.log(JSON.stringify({
        function: "send-push",
        event: "delivered",
        alertId,
        ticketId,
        timestamp: new Date().toISOString(),
      }));

      return new Response(
        JSON.stringify({
          success: true,
          pushResult,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      console.log(JSON.stringify({
        function: "send-push",
        event: "failed",
        alertId,
        error: JSON.stringify(pushResult).slice(0, 200),
        timestamp: new Date().toISOString(),
      }));

      // Record failed delivery
      await supabase
        .from("delivery_log")
        .insert({
          alert_id: alertId,
          channel: "push",
          provider_message_id: ticketId,
          status: "failed",
          error_detail: JSON.stringify(pushResult).slice(0, 500),
        })
        ; // non-critical, ignore errors

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
