// delete-account: Permanently deletes a user account and all associated data
// Required by Apple App Store for any app that offers account creation

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate the user via their JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create a client scoped to the user to verify identity
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;

    // Use service role client to delete all user data
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Delete user data from all tables (order matters for foreign keys)
    const tables = [
      "delivery_log",
      "alerts",
      "alert_throttle",
      "deep_link_events",
      "prediction_positions",
      "wagers",
      "follows",
      "connections",
      "user_preferences",
    ];

    for (const table of tables) {
      const { error } = await admin.from(table).delete().eq("user_id", userId);
      if (error) {
        console.error(`Error deleting from ${table}:`, error.message);
        // Continue deleting from other tables
      }
    }

    // Delete the user's profile
    const { error: profileError } = await admin
      .from("profiles")
      .delete()
      .eq("id", userId);
    if (profileError) {
      console.error("Error deleting profile:", profileError.message);
    }

    // Delete the auth user
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("Error deleting auth user:", deleteError.message);
      return new Response(
        JSON.stringify({ error: "Failed to delete account" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(JSON.stringify({
      function: "delete-account",
      event: "account_deleted",
      user_id: userId,
      timestamp: new Date().toISOString(),
    }));

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("delete-account error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
