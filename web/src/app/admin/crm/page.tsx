import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  asSocials,
  formatDateOnly,
  formatSocials,
  latestByDraftedAt,
  prospectSearchFilter,
  CRM_STAGES,
} from "@/lib/crm";
import { createProspect } from "./actions";
import { Banner, OutreachBadge, ProspectForm, StageBadge } from "./ui";

type OutreachPreview = { status: string; drafted_at: string; subject: string };

type ProspectListRow = {
  id: number;
  company_name: string;
  contact_name: string;
  email: string | null;
  phone: string | null;
  socials: unknown;
  last_contact_on: string | null;
  stage: string;
  crm_outreach_emails: OutreachPreview[] | null;
};

export default async function AdminCrmPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; q?: string }>;
}) {
  await requireAdmin();
  const supabase = createSupabaseAdmin();
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 80);

  let request = supabase
    .from("crm_prospects")
    .select(
      "id, company_name, contact_name, email, phone, socials, last_contact_on, stage, crm_outreach_emails(status, drafted_at, subject)"
    )
    .order("updated_at", { ascending: false });

  const searchFilter = query ? prospectSearchFilter(query) : null;
  if (searchFilter) {
    request = request.or(searchFilter);
  }

  const [{ data, error }, { data: advertisers }] = await Promise.all([
    request,
    supabase.from("advertisers").select("id, name").order("name"),
  ]);

  const prospects = (data ?? []) as ProspectListRow[];
  const stageCounts = Object.fromEntries(CRM_STAGES.map((stage) => [stage, 0])) as Record<
    string,
    number
  >;
  for (const prospect of prospects) {
    stageCounts[prospect.stage] = (stageCounts[prospect.stage] ?? 0) + 1;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">CRM</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Prospective advertisers — the revenue pipeline before a company has a paying
            account. Accounts that already spend live on{" "}
            <Link href="/admin/advertisers" className="text-orange-400 hover:text-orange-300">
              Advertisers
            </Link>
            .
          </p>
        </div>
        <a
          href="#new-prospect"
          className="shrink-0 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-400"
        >
          + Add prospect
        </a>
      </div>

      <Banner
        error={
          params.error ??
          (error
            ? "CRM data is unavailable. Apply the advertiser CRM migration if this environment is new."
            : undefined)
        }
        notice={params.notice}
      />

      {prospects.length > 0 && !query ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {CRM_STAGES.map((stage) => (
            <div key={stage} className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <p className="text-2xl font-bold text-white">{stageCounts[stage] ?? 0}</p>
              <p className="mt-0.5 text-xs capitalize text-slate-400">{stage}</p>
            </div>
          ))}
        </div>
      ) : null}

      <form action="/admin/crm" className="flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search company, contact, or email"
          className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-orange-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
        >
          Search
        </button>
      </form>

      {error ? null : prospects.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-12 text-center">
          {query ? (
            <p className="text-sm text-slate-400">No prospects match that search.</p>
          ) : (
            <>
              <p className="text-base font-medium text-white">No prospects yet</p>
              <p className="mx-auto mt-2 max-w-lg text-sm text-slate-400">
                This is NORMA&apos;s advertiser revenue pipeline. Add a company when you start a
                conversation about sponsoring moments. Store only emails and phone numbers the
                contact actually gave you.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700 bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Company</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Contact person</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Email</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Phone</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Socials</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Last contact</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Latest outreach</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {prospects.map((prospect) => {
                const socials = formatSocials(asSocials(prospect.socials));
                const latest = latestByDraftedAt(prospect.crm_outreach_emails);
                return (
                  <tr key={prospect.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/crm/${prospect.id}`}
                        className="font-semibold text-white hover:text-orange-400"
                      >
                        {prospect.company_name}
                      </Link>
                      <div className="mt-1">
                        <StageBadge stage={prospect.stage} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-200">{prospect.contact_name}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {prospect.email ? (
                        <a href={`mailto:${prospect.email}`} className="hover:text-orange-400">
                          {prospect.email}
                        </a>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{prospect.phone || "—"}</td>
                    <td className="max-w-xs px-4 py-3 text-xs text-slate-400" title={socials}>
                      {socials || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatDateOnly(prospect.last_contact_on)}
                    </td>
                    <td className="px-4 py-3">
                      {latest ? (
                        <div className="flex flex-col gap-1">
                          <OutreachBadge status={latest.status} />
                          <span className="max-w-[14rem] truncate text-xs text-slate-500">
                            {latest.subject}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div id="new-prospect" className="rounded-xl border border-slate-700 bg-slate-900/60 p-6">
        <h2 className="mb-1 text-base font-semibold text-white">Add a prospect</h2>
        <p className="mb-4 text-xs text-slate-500">
          Email is optional until you have one. NORMA will not guess an address from the company
          name.
        </p>
        <ProspectForm
          action={createProspect}
          submitLabel="Create prospect"
          advertisers={(advertisers ?? []) as { id: number; name: string }[]}
        />
      </div>
    </div>
  );
}
