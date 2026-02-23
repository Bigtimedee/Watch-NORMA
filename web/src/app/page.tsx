import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase-server";

export default async function Home() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Check if advertiser has completed onboarding
  const { data: advertiser } = await supabase
    .from("advertisers")
    .select("onboarding_complete")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!advertiser || !advertiser.onboarding_complete) {
    redirect("/onboarding");
  }

  redirect("/dashboard");
}
