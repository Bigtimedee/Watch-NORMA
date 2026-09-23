"use server";

import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  deliverOutreachViaResend,
  parseDateOnly,
  parseProspectEmail,
  parseStage,
  planOutreachSend,
  snippetFromBody,
  socialsFromFields,
  utcToday,
  DEFAULT_OUTREACH_FROM,
  type CrmStage,
} from "@/lib/crm";
import { redirect } from "next/navigation";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function go(path: string, params?: Record<string, string | undefined>): never {
  const url = new URL(path, "https://getnorma.app");
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) url.searchParams.set(key, value);
  }
  redirect(`${url.pathname}${url.search}`);
}

function prospectFields(formData: FormData):
  | {
      ok: true;
      company_name: string;
      contact_name: string;
      email: string | null;
      phone: string | null;
      socials: ReturnType<typeof socialsFromFields>;
      last_contact_on: string | null;
      stage: CrmStage;
      notes: string | null;
      advertiser_id: number | null;
    }
  | { ok: false; error: string } {
  const company_name = text(formData, "company_name");
  const contact_name = text(formData, "contact_name");
  if (!company_name || !contact_name) {
    return { ok: false, error: "Company and contact person are required." };
  }
  if (company_name.length > 200 || contact_name.length > 200) {
    return { ok: false, error: "Company and contact person must be 200 characters or fewer." };
  }

  const email = parseProspectEmail(text(formData, "email"));
  if (email === "invalid") {
    return { ok: false, error: "Enter the contact's real email, or leave it blank." };
  }

  const phoneRaw = text(formData, "phone");
  if (phoneRaw.length > 40) {
    return { ok: false, error: "Phone number must be 40 characters or fewer." };
  }

  const last_contact_on = parseDateOnly(text(formData, "last_contact_on"));
  if (last_contact_on === "invalid") {
    return { ok: false, error: "Last contact must be a real calendar date." };
  }

  const stage = parseStage(text(formData, "stage"));
  if (stage === "invalid") {
    return { ok: false, error: "Choose a pipeline stage." };
  }

  const notesRaw = text(formData, "notes");
  if (notesRaw.length > 5000) {
    return { ok: false, error: "Notes must be 5,000 characters or fewer." };
  }

  const advertiserRaw = text(formData, "advertiser_id");
  const advertiser_id = advertiserRaw ? parseId(advertiserRaw) : null;
  if (advertiserRaw && advertiser_id == null) {
    return { ok: false, error: "Choose a real advertiser account to link, or leave it blank." };
  }

  return {
    ok: true,
    company_name,
    contact_name,
    email,
    phone: phoneRaw || null,
    socials: socialsFromFields({
      x: text(formData, "social_x"),
      linkedin: text(formData, "social_linkedin"),
      instagram: text(formData, "social_instagram"),
      other: text(formData, "social_other"),
    }),
    last_contact_on,
    stage,
    notes: notesRaw || null,
    advertiser_id,
  };
}

function dbErrorMessage(error: { code?: string; message?: string } | null): string | null {
  if (!error) return null;
  if (error.code === "23505") return "That email is already saved on another prospect.";
  if (error.code === "23503") return "That advertiser account no longer exists.";
  return "Could not save. Check the fields and try again.";
}

export async function createProspect(formData: FormData) {
  await requireAdmin();
  const supabase = createSupabaseAdmin();
  const fields = prospectFields(formData);
  if (!fields.ok) go("/admin/crm", { error: fields.error });

  const { data, error } = await supabase
    .from("crm_prospects")
    .insert({
      company_name: fields.company_name,
      contact_name: fields.contact_name,
      email: fields.email,
      phone: fields.phone,
      socials: fields.socials,
      last_contact_on: fields.last_contact_on,
      stage: fields.stage,
      notes: fields.notes,
      advertiser_id: fields.advertiser_id,
    })
    .select("id")
    .single();

  const message = dbErrorMessage(error);
  if (message || !data) go("/admin/crm", { error: message ?? "Could not create the prospect." });
  go(`/admin/crm/${data.id}`, { notice: "Prospect saved." });
}

export async function updateProspect(formData: FormData) {
  await requireAdmin();
  const supabase = createSupabaseAdmin();
  const id = parseId(text(formData, "id"));
  if (id == null) go("/admin/crm", { error: "Missing prospect." });

  const fields = prospectFields(formData);
  if (!fields.ok) go(`/admin/crm/${id}`, { error: fields.error });

  const { error } = await supabase
    .from("crm_prospects")
    .update({
      company_name: fields.company_name,
      contact_name: fields.contact_name,
      email: fields.email,
      phone: fields.phone,
      socials: fields.socials,
      last_contact_on: fields.last_contact_on,
      stage: fields.stage,
      notes: fields.notes,
      advertiser_id: fields.advertiser_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  const message = dbErrorMessage(error);
  if (message) go(`/admin/crm/${id}`, { error: message });
  go(`/admin/crm/${id}`, { notice: "Prospect updated." });
}

export async function deleteProspect(formData: FormData) {
  await requireAdmin();
  const supabase = createSupabaseAdmin();
  const id = parseId(text(formData, "id"));
  if (id == null) go("/admin/crm", { error: "Missing prospect." });

  const { error } = await supabase.from("crm_prospects").delete().eq("id", id);
  if (error) go(`/admin/crm/${id}`, { error: "Could not delete the prospect." });
  go("/admin/crm", { notice: "Prospect deleted." });
}

function outreachFields(formData: FormData):
  | { ok: true; subject: string; body: string; snippet: string }
  | { ok: false; error: string } {
  const subject = text(formData, "subject");
  const body = text(formData, "body");
  if (!subject || !body) return { ok: false, error: "Subject and body are required." };
  if (subject.length > 200) return { ok: false, error: "Subject must be 200 characters or fewer." };
  if (body.length > 20000) return { ok: false, error: "Body must be 20,000 characters or fewer." };
  return { ok: true, subject, body, snippet: snippetFromBody(body) };
}

export async function createOutreachDraft(formData: FormData) {
  await requireAdmin();
  const supabase = createSupabaseAdmin();
  const prospectId = parseId(text(formData, "prospect_id"));
  if (prospectId == null) go("/admin/crm", { error: "Missing prospect." });

  const fields = outreachFields(formData);
  if (!fields.ok) go(`/admin/crm/${prospectId}`, { error: fields.error });

  const { data: prospect, error: prospectError } = await supabase
    .from("crm_prospects")
    .select("email")
    .eq("id", prospectId)
    .maybeSingle();

  if (prospectError || !prospect) go("/admin/crm", { error: "Prospect not found." });

  const toEmail = parseProspectEmail(prospect.email);
  const { error } = await supabase.from("crm_outreach_emails").insert({
    prospect_id: prospectId,
    status: "draft",
    subject: fields.subject,
    body: fields.body,
    snippet: fields.snippet,
    to_email: toEmail === "invalid" ? null : toEmail,
    drafted_at: new Date().toISOString(),
  });

  if (error) go(`/admin/crm/${prospectId}`, { error: "Could not save the draft." });
  go(`/admin/crm/${prospectId}`, { notice: "Draft saved. Nothing was sent." });
}

export async function updateOutreachDraft(formData: FormData) {
  await requireAdmin();
  const supabase = createSupabaseAdmin();
  const prospectId = parseId(text(formData, "prospect_id"));
  const id = parseId(text(formData, "id"));
  if (prospectId == null || id == null) go("/admin/crm", { error: "Missing draft." });

  const fields = outreachFields(formData);
  if (!fields.ok) go(`/admin/crm/${prospectId}`, { error: fields.error });

  const { data: prospect } = await supabase
    .from("crm_prospects")
    .select("email")
    .eq("id", prospectId)
    .maybeSingle();
  const toEmail = parseProspectEmail(prospect?.email);
  const { data, error } = await supabase
    .from("crm_outreach_emails")
    .update({
      subject: fields.subject,
      body: fields.body,
      snippet: fields.snippet,
      to_email: toEmail === "invalid" ? null : toEmail,
      status: "draft",
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("prospect_id", prospectId)
    .in("status", ["draft", "failed"])
    .select("id")
    .maybeSingle();

  if (error || !data) {
    go(`/admin/crm/${prospectId}`, { error: "That email can no longer be edited." });
  }
  go(`/admin/crm/${prospectId}`, { notice: "Draft updated." });
}

async function touchProspectAfterSend(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  prospectId: number,
  stage: string | null
) {
  await supabase
    .from("crm_prospects")
    .update({
      last_contact_on: utcToday(),
      ...(stage === "prospect" ? { stage: "contacted" } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", prospectId);
}

export async function markOutreachSent(formData: FormData) {
  await requireAdmin();
  const supabase = createSupabaseAdmin();
  const prospectId = parseId(text(formData, "prospect_id"));
  const id = parseId(text(formData, "id"));
  if (prospectId == null || id == null) go("/admin/crm", { error: "Missing draft." });

  const { data: prospect } = await supabase
    .from("crm_prospects")
    .select("email, stage")
    .eq("id", prospectId)
    .maybeSingle();
  const toEmail = parseProspectEmail(prospect?.email);

  const { data, error } = await supabase
    .from("crm_outreach_emails")
    .update({
      status: "sent",
      provider: "manual",
      sent_at: new Date().toISOString(),
      error: null,
      to_email: toEmail === "invalid" ? null : toEmail,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("prospect_id", prospectId)
    .in("status", ["draft", "failed"])
    .select("id")
    .maybeSingle();

  if (error || !data) {
    go(`/admin/crm/${prospectId}`, { error: "That email is already marked sent." });
  }

  await touchProspectAfterSend(supabase, prospectId, prospect?.stage ?? null);
  go(`/admin/crm/${prospectId}`, { notice: "Marked sent. Last contact is today." });
}

export async function sendOutreachEmail(formData: FormData) {
  await requireAdmin();
  const supabase = createSupabaseAdmin();
  const prospectId = parseId(text(formData, "prospect_id"));
  const id = parseId(text(formData, "id"));
  if (prospectId == null || id == null) go("/admin/crm", { error: "Missing draft." });

  const { data: prospect } = await supabase
    .from("crm_prospects")
    .select("email, stage")
    .eq("id", prospectId)
    .maybeSingle();

  const { data: email } = await supabase
    .from("crm_outreach_emails")
    .select("id, status, subject, body")
    .eq("id", id)
    .eq("prospect_id", prospectId)
    .maybeSingle();

  if (!email || (email.status !== "draft" && email.status !== "failed")) {
    go(`/admin/crm/${prospectId}`, { error: "Only a draft or failed email can be sent." });
  }

  const from = process.env.CRM_OUTREACH_FROM?.trim() || DEFAULT_OUTREACH_FROM;
  const plan = planOutreachSend({
    storedEmail: prospect?.email,
    subject: email.subject,
    body: email.body,
    from,
  });

  if (!plan.ok) {
    await supabase
      .from("crm_outreach_emails")
      .update({ error: plan.error, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("prospect_id", prospectId)
      .in("status", ["draft", "failed"]);
    go(`/admin/crm/${prospectId}`, { error: plan.error });
  }

  const delivery = await deliverOutreachViaResend(plan, {
    apiKey: process.env.RESEND_API_KEY,
    fetchImpl: fetch,
  });

  if (!delivery.ok) {
    const status = process.env.RESEND_API_KEY?.trim() ? "failed" : "draft";
    await supabase
      .from("crm_outreach_emails")
      .update({
        status,
        error: delivery.error,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("prospect_id", prospectId)
      .in("status", ["draft", "failed"]);
    go(`/admin/crm/${prospectId}`, { error: delivery.error });
  }

  const { data: saved, error } = await supabase
    .from("crm_outreach_emails")
    .update({
      status: "sent",
      provider: "resend",
      to_email: plan.to,
      sent_at: new Date().toISOString(),
      provider_message_id: delivery.id,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("prospect_id", prospectId)
    .in("status", ["draft", "failed"])
    .select("id")
    .maybeSingle();

  if (error || !saved) {
    go(`/admin/crm/${prospectId}`, {
      error: "Resend accepted the email, but the sent status could not be saved. Check the prospect before retrying.",
    });
  }

  await touchProspectAfterSend(supabase, prospectId, prospect?.stage ?? null);
  go(`/admin/crm/${prospectId}`, { notice: "Email sent." });
}

export async function deleteOutreachDraft(formData: FormData) {
  await requireAdmin();
  const supabase = createSupabaseAdmin();
  const prospectId = parseId(text(formData, "prospect_id"));
  const id = parseId(text(formData, "id"));
  if (prospectId == null || id == null) go("/admin/crm", { error: "Missing draft." });

  const { error } = await supabase
    .from("crm_outreach_emails")
    .delete()
    .eq("id", id)
    .eq("prospect_id", prospectId)
    .eq("status", "draft");

  if (error) go(`/admin/crm/${prospectId}`, { error: "Could not delete the draft." });
  go(`/admin/crm/${prospectId}`, { notice: "Draft deleted." });
}
