"use server";

import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export async function suspendAdvertiser(id: number) {
  const { supabase } = await requireAdmin();

  // Pause all active campaigns
  await supabase
    .from("campaigns")
    .update({ status: "paused" })
    .eq("advertiser_id", id)
    .eq("status", "active");

  // Mark advertiser as suspended via name prefix
  const { data: advertiser } = await supabase
    .from("advertisers")
    .select("name, auth_user_id")
    .eq("id", id)
    .single();

  if (advertiser?.auth_user_id) {
    const admin = createSupabaseAdmin();
    await admin.auth.admin.updateUserById(advertiser.auth_user_id, {
      ban_duration: "876000h", // ~100 years
    });
  }
}

export async function adjustBalance(
  id: number,
  amountCents: number,
  description: string
) {
  const { supabase } = await requireAdmin();

  // Get current balance
  const { data: advertiser } = await supabase
    .from("advertisers")
    .select("balance_cents")
    .eq("id", id)
    .single();

  if (!advertiser) throw new Error("Advertiser not found");

  const newBalance = advertiser.balance_cents + amountCents;

  // Update balance
  await supabase
    .from("advertisers")
    .update({ balance_cents: newBalance })
    .eq("id", id);

  // Log transaction
  await supabase.from("advertiser_transactions").insert({
    advertiser_id: id,
    type: "adjustment",
    amount_cents: amountCents,
    balance_after_cents: newBalance,
    description,
  });
}

export async function updateCampaignStatus(
  id: number,
  status: "active" | "paused" | "archived" | "pending_review"
) {
  const { supabase } = await requireAdmin();

  await supabase.from("campaigns").update({ status }).eq("id", id);
}

export async function deleteAdvertiser(id: number) {
  const { supabase } = await requireAdmin();

  // Get auth user id before deleting
  const { data: advertiser } = await supabase
    .from("advertisers")
    .select("auth_user_id")
    .eq("id", id)
    .single();

  await supabase.from("advertisers").delete().eq("id", id);

  if (advertiser?.auth_user_id) {
    const admin = createSupabaseAdmin();
    await admin.auth.admin.deleteUser(advertiser.auth_user_id);
  }
}

export async function suspendUser(authUserId: string) {
  await requireAdmin();
  const admin = createSupabaseAdmin();
  await admin.auth.admin.updateUserById(authUserId, {
    ban_duration: "876000h",
  });
}

export async function deleteUser(authUserId: string) {
  await requireAdmin();
  const admin = createSupabaseAdmin();
  await admin.auth.admin.deleteUser(authUserId);
}

export async function updateAdvertiser(
  id: number,
  fields: { name?: string; category?: string; billing_model?: string }
) {
  const { supabase } = await requireAdmin();
  await supabase.from("advertisers").update(fields).eq("id", id);
}

export async function resolveFraudEvent(id: number) {
  const { supabase } = await requireAdmin();
  await supabase
    .from("ad_fraud_events")
    .update({ resolved: true })
    .eq("id", id);
}
