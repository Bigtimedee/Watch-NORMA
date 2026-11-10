"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Sets only the kill flag. This action cannot set strymtv_enabled.
 * requireAdmin() redirects unless app_metadata.role is admin.
 * The write uses the service role because authenticated clients have no update grant.
 */
export async function setPlayerRouteKilled(killed: boolean): Promise<void> {
  const { user } = await requireAdmin();
  if (user.app_metadata?.role !== "admin" || typeof killed !== "boolean") {
    throw new Error("Not allowed");
  }
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("player_route_control")
    .update({ killed, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) {
    throw new Error("Could not update player route control");
  }
  revalidatePath("/admin/player-routes");
}

export async function disablePlayerRoute(_formData?: FormData): Promise<void> {
  await setPlayerRouteKilled(true);
}

export async function clearPlayerRouteKill(_formData?: FormData): Promise<void> {
  await setPlayerRouteKilled(false);
}
