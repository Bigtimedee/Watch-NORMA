// campaign-api: Campaign lifecycle management
// Handles: create, activate, pause, resume, validate, status transitions

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type Action = "activate" | "pause" | "resume" | "archive" | "validate";

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending_review"],
  pending_review: ["active", "draft"],
  active: ["paused", "completed", "archived"],
  paused: ["active", "archived"],
  completed: ["archived"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, campaign_id, data } = await req.json() as {
      action: Action;
      campaign_id: number;
      data?: Record<string, unknown>;
    };

    // Auth check — get advertiser from JWT
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Verify campaign ownership
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select(`
        *,
        advertisers!inner(id, auth_user_id, category)
      `)
      .eq("id", campaign_id)
      .eq("advertisers.auth_user_id", user.id)
      .single();

    if (campaignError || !campaign) {
      return jsonResponse({ error: "Campaign not found or access denied" }, 404);
    }

    switch (action) {
      case "activate": {
        // Validate before activation
        const errors = validateCampaign(campaign);
        if (errors.length > 0) {
          return jsonResponse({ error: "Validation failed", errors }, 400);
        }

        const newStatus = campaign.status === "paused" ? "active" : "active";
        if (!canTransition(campaign.status, newStatus)) {
          return jsonResponse({
            error: `Cannot transition from ${campaign.status} to ${newStatus}`,
          }, 400);
        }

        // Balance check: advertiser must have enough funds to cover remaining budget
        const remainingBudget = (campaign.budget_cents as number) - (campaign.spent_cents as number);
        const { data: hasBalance } = await supabase.rpc("check_advertiser_balance", {
          p_advertiser_id: campaign.advertisers.id,
          p_required_cents: remainingBudget,
        });

        if (!hasBalance) {
          return jsonResponse({
            error: "Insufficient balance",
            message: "Your wallet balance is too low to cover this campaign's budget. Please add funds.",
            required_cents: remainingBudget,
          }, 400);
        }

        // For draft campaigns, go through pending_review first
        const targetStatus = campaign.status === "draft" ? "pending_review" : "active";

        const { error } = await supabase
          .from("campaigns")
          .update({ status: targetStatus, updated_at: new Date().toISOString() })
          .eq("id", campaign_id);

        if (error) throw error;
        return jsonResponse({ success: true, status: targetStatus });
      }

      case "pause": {
        if (!canTransition(campaign.status, "paused")) {
          return jsonResponse({
            error: `Cannot pause campaign in ${campaign.status} status`,
          }, 400);
        }

        const { error } = await supabase
          .from("campaigns")
          .update({ status: "paused", updated_at: new Date().toISOString() })
          .eq("id", campaign_id);

        if (error) throw error;
        return jsonResponse({ success: true, status: "paused" });
      }

      case "resume": {
        if (campaign.status !== "paused") {
          return jsonResponse({ error: "Can only resume paused campaigns" }, 400);
        }

        const { error } = await supabase
          .from("campaigns")
          .update({ status: "active", updated_at: new Date().toISOString() })
          .eq("id", campaign_id);

        if (error) throw error;
        return jsonResponse({ success: true, status: "active" });
      }

      case "archive": {
        if (!canTransition(campaign.status, "archived")) {
          return jsonResponse({
            error: `Cannot archive campaign in ${campaign.status} status`,
          }, 400);
        }

        const { error } = await supabase
          .from("campaigns")
          .update({ status: "archived", updated_at: new Date().toISOString() })
          .eq("id", campaign_id);

        if (error) throw error;
        return jsonResponse({ success: true, status: "archived" });
      }

      case "validate": {
        const errors = validateCampaign(campaign);
        return jsonResponse({
          valid: errors.length === 0,
          errors,
        });
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error) {
    console.error("campaign-api error:", error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});

function canTransition(current: string, target: string): boolean {
  return VALID_TRANSITIONS[current]?.includes(target) ?? false;
}

function validateCampaign(campaign: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (!campaign.name) errors.push("Campaign name is required");
  if (!campaign.budget_cents || (campaign.budget_cents as number) <= 0) {
    errors.push("Budget must be positive");
  }

  const rules = campaign.targeting_rules as Record<string, unknown>;
  if (!rules || Object.keys(rules).length === 0) {
    errors.push("Targeting rules are required");
  }

  if (campaign.flight_start && campaign.flight_end) {
    if (new Date(campaign.flight_end as string) <= new Date(campaign.flight_start as string)) {
      errors.push("Flight end must be after flight start");
    }
  }

  return errors;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
