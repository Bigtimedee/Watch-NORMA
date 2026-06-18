"use server";

import { requireAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";

export async function createPartner(formData: FormData) {
  const { supabase } = await requireAdmin();

  const name = (formData.get("name") as string | null)?.trim();
  const tier = formData.get("tier") as string | null;
  const partnership_status = (formData.get("partnership_status") as string | null) ?? "prospect";
  const bd_contact_name = (formData.get("bd_contact_name") as string | null)?.trim() || null;
  const bd_contact_email = (formData.get("bd_contact_email") as string | null)?.trim() || null;
  const referral_code = (formData.get("referral_code") as string | null)?.trim() || null;
  const notes = (formData.get("notes") as string | null)?.trim() || null;

  if (!name || !tier) {
    // Server actions can't return validation errors to a plain HTML form without
    // client-side JS — just redirect back rather than crashing.
    redirect("/admin/partners");
  }

  await supabase.from("partners").insert({
    name,
    tier,
    partnership_status,
    bd_contact_name,
    bd_contact_email,
    referral_code,
    notes,
  });

  redirect("/admin/partners");
}
