import { redirect } from "next/navigation";
import { createSupabaseServer } from "./supabase-server";

export async function requireAdmin() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    redirect("/dashboard");
  }

  return { supabase, user };
}
