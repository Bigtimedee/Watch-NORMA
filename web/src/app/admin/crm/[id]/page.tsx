import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { asSocials, formatDateOnly, outreachDraftTemplate } from "@/lib/crm";
import {
  createOutreachDraft,
  deleteOutreachDraft,
  deleteProspect,
  markOutreachSent,
  sendOutreachEmail,
  updateOutreachDraft,
  updateProspect,
} from "../actions";
import { Banner, OutreachBadge, ProspectForm, StageBadge, fieldClass } from "../ui";

type OutreachEmail = {
  id: number;
  status: string;
  subject: string;
  body: string;
  snippet: string | null;
  to_email: string | null;
  provider: string | null;
  drafted_at: string;
  sent_at: string | null;
  provider_message_id: string | null;
  error: string | null;
};

type ProspectDetail = {
  id: number;
  company_name: string;
  contact_name: string;
  email: string | null;
  phone: string | null;
  socials: unknown;
  last_contact_on: string | null;
  stage: string;
  notes: string | null;
  advertiser_id: number | null;
};

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC";
}

export default async function AdminCrmDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requireAdmin();
  const supabase = createSupabaseAdmin();
  const { id: rawId } = await params;
  const flash = await searchParams;
  if (!/^\d+$/.test(rawId)) notFound();

  const [{ data: prospect }, { data: emails }, { data: advertisers }] = await Promise.all([
    supabase
      .from("crm_prospects")
      .select(
        "id, company_name, contact_name, email, phone, socials, last_contact_on, stage, notes, advertiser_id"
      )
      .eq("id", Number(rawId))
      .maybeSingle(),
    supabase
      .from("crm_outreach_emails")
      .select(
        "id, status, subject, body, snippet, to_email, provider, drafted_at, sent_at, provider_message_id, error"
      )
      .eq("prospect_id", Number(rawId))
      .order("drafted_at", { ascending: false }),
    supabase.from("advertisers").select("id, name").order("name"),
  ]);

  if (!prospect) notFound();
  const row = prospect as ProspectDetail;
  const outreach = (emails ?? []) as OutreachEmail[];
  const template = outreachDraftTemplate({
    companyName: row.company_name,
    contactName: row.contact_name,
  });
  const liveSendReady = Boolean(process.env.RESEND_API_KEY?.trim());

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/crm" className="text-sm text-slate-400 hover:text-orange-400">
          ← CRM
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{row.company_name}</h1>
          <StageBadge stage={row.stage} />
        </div>
        <p className="mt-1 text-sm text-slate-400">
          {row.contact_name}
          {row.last_contact_on ? ` · Last contact ${formatDateOnly(row.last_contact_on)}` : ""}
        </p>
      </div>

      <Banner error={flash.error} notice={flash.notice} />

      <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-6">
        <h2 className="mb-4 text-base font-semibold text-white">Company and contact</h2>
        <ProspectForm
          action={updateProspect}
          submitLabel="Save prospect"
          prospectId={row.id}
          defaults={{ ...row, socials: asSocials(row.socials) }}
          advertisers={(advertisers ?? []) as { id: number; name: string }[]}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-white">Outreach emails</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Drafts stay here until you send them or mark them sent after you mailed the contact
            yourself. Send uses only the email saved on this prospect.
            {liveSendReady
              ? " Live send is configured for this deployment."
              : " Live send needs RESEND_API_KEY on the web app. Mark sent still records a manual email."}
          </p>
        </div>

        {outreach.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-8 text-sm text-slate-400">
            No outreach yet. Save a draft below. Saving a draft does not email anyone.
          </div>
        ) : (
          <ol className="space-y-4">
            {outreach.map((email) => {
              const editable = email.status === "draft" || email.status === "failed";
              return (
                <li key={email.id} className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <OutreachBadge status={email.status} />
                    {email.provider ? (
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        {email.provider}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm text-slate-300">
                    <span className="text-slate-500">To </span>
                    {email.to_email || row.email || "No email on file"}
                  </p>
                  <dl className="mt-2 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                    <div>Drafted {formatTimestamp(email.drafted_at)}</div>
                    <div>Sent {formatTimestamp(email.sent_at)}</div>
                    {email.provider_message_id ? (
                      <div className="sm:col-span-2">Provider id {email.provider_message_id}</div>
                    ) : null}
                  </dl>
                  {email.error ? (
                    <p className="mt-3 text-sm text-red-300">{email.error}</p>
                  ) : null}

                  {editable ? (
                    <form action={updateOutreachDraft} className="mt-4 space-y-3">
                      <input type="hidden" name="id" value={email.id} />
                      <input type="hidden" name="prospect_id" value={row.id} />
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-slate-400">Subject</span>
                        <input
                          name="subject"
                          required
                          maxLength={200}
                          defaultValue={email.subject}
                          className={fieldClass}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-slate-400">Body</span>
                        <textarea
                          name="body"
                          required
                          rows={8}
                          maxLength={20000}
                          defaultValue={email.body}
                          className={fieldClass}
                        />
                      </label>
                      {email.snippet ? (
                        <p className="text-xs text-slate-500">Snippet: {email.snippet}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-white hover:border-slate-400"
                        >
                          Save draft
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="mt-4 space-y-2">
                      <p className="font-medium text-white">{email.subject}</p>
                      <p className="whitespace-pre-wrap text-sm text-slate-300">{email.body}</p>
                      {email.snippet ? (
                        <p className="text-xs text-slate-500">Snippet: {email.snippet}</p>
                      ) : null}
                    </div>
                  )}

                  {editable ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <p className="w-full text-xs text-slate-500">
                        Save the draft first. Send and Mark sent use the saved subject and body.
                      </p>
                      <form action={sendOutreachEmail}>
                        <input type="hidden" name="id" value={email.id} />
                        <input type="hidden" name="prospect_id" value={row.id} />
                        <button
                          type="submit"
                          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-400"
                        >
                          Send
                        </button>
                      </form>
                      <form action={markOutreachSent}>
                        <input type="hidden" name="id" value={email.id} />
                        <input type="hidden" name="prospect_id" value={row.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-slate-400"
                        >
                          Mark sent
                        </button>
                      </form>
                      {email.status === "draft" ? (
                        <form action={deleteOutreachDraft}>
                          <input type="hidden" name="id" value={email.id} />
                          <input type="hidden" name="prospect_id" value={row.id} />
                          <button
                            type="submit"
                            className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:text-red-300"
                          >
                            Delete draft
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}

        <form
          action={createOutreachDraft}
          className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-6"
        >
          <h3 className="text-sm font-semibold text-white">New draft</h3>
          <p className="text-xs text-slate-500">
            The text below is a starting point. Edit it, then save. The advertise link is{" "}
            {`https://getnorma.app/advertisers`} — a page the reader opens, not the From address.
          </p>
          <input type="hidden" name="prospect_id" value={row.id} />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-400">Subject</span>
            <input
              name="subject"
              required
              maxLength={200}
              defaultValue={template.subject}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-400">Body</span>
            <textarea
              name="body"
              required
              rows={8}
              maxLength={20000}
              defaultValue={template.body}
              className={fieldClass}
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-400"
          >
            Save draft
          </button>
        </form>
      </section>

      <form action={deleteProspect}>
        <input type="hidden" name="id" value={row.id} />
        <button type="submit" className="text-sm text-slate-500 hover:text-red-300">
          Delete prospect
        </button>
      </form>
    </div>
  );
}
