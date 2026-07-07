import { requireAdmin } from "@/lib/admin";
import { notFound } from "next/navigation";
import type { CampaignApprovalStatus, CampaignStatus } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { ApproveCreativeButton } from "./creative-actions";

type PrescreenStatus = "pending" | "pass" | "flag" | "error";

const PRESCREEN_STYLES: Record<PrescreenStatus, string> = {
  pending: "bg-slate-800 text-slate-400",
  pass: "bg-green-900/50 text-green-400",
  flag: "bg-red-900/50 text-red-400",
  error: "bg-orange-900/50 text-orange-400",
};

const PRESCREEN_LABELS: Record<PrescreenStatus, string> = {
  pending: "Pending",
  pass: "Pre-approved",
  flag: "Flagged",
  error: "Error",
};

function PrescreenBadge({ status }: { status: PrescreenStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${PRESCREEN_STYLES[status]}`}
    >
      {PRESCREEN_LABELS[status]}
    </span>
  );
}

const APPROVAL_STYLES: Record<CampaignApprovalStatus, string> = {
  pending: "bg-yellow-900/50 text-yellow-400",
  approved: "bg-green-900/50 text-green-400",
  rejected: "bg-red-900/50 text-red-400",
  paused: "bg-orange-900/50 text-orange-400",
};

export default async function AdminCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, status, approval_status, demand_type, budget_cents, spent_cents, created_at")
    .eq("id", Number(id))
    .single();

  if (!campaign) notFound();

  const { data: creatives } = await supabase
    .from("creatives")
    .select(
      "id, variant_label, sponsor_text, cta_text, cta_url, logo_url, status, prescreen_status, prescreen_reasons, prescreen_at, created_at"
    )
    .eq("campaign_id", Number(id))
    .order("created_at", { ascending: true });

  const pendingCreatives = (creatives ?? []).filter(
    (c: any) => c.status === "pending"
  ).length;

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <a
            href="/admin/campaigns"
            className="text-xs font-medium text-slate-500 hover:text-slate-300"
          >
            ← All Campaigns
          </a>
          <h1 className="mt-1 text-2xl font-bold text-white">{campaign.name}</h1>
          <p className="mt-1 text-sm text-slate-400">Campaign ID: {campaign.id}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={campaign.status as CampaignStatus} />
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${APPROVAL_STYLES[campaign.approval_status as CampaignApprovalStatus]}`}
          >
            {campaign.approval_status}
          </span>
          {campaign.demand_type && (
            <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-300">
              {campaign.demand_type}
            </span>
          )}
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Creatives</h2>
          {pendingCreatives > 0 && (
            <span className="rounded-lg border border-yellow-900/60 bg-yellow-950/40 px-3 py-1 text-sm font-semibold text-yellow-300">
              {pendingCreatives} pending approval
            </span>
          )}
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Variant
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Headline
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  CTA
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  AI Prescreen
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(creatives ?? []).map((c: any) => {
                const prescreenStatus = (c.prescreen_status ?? "pending") as PrescreenStatus;
                const reasons: string[] = Array.isArray(c.prescreen_reasons)
                  ? c.prescreen_reasons
                  : [];
                return (
                  <tr key={c.id} className="hover:bg-slate-900/50">
                    <td className="px-6 py-4 font-mono text-xs text-slate-400">
                      {c.variant_label}
                    </td>
                    <td className="max-w-xs px-6 py-4">
                      <p className="font-medium text-white">{c.sponsor_text}</p>
                      {c.logo_url && (
                        <a
                          href={c.logo_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 block truncate text-xs text-slate-500 hover:text-slate-300"
                        >
                          {c.logo_url}
                        </a>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-300">{c.cta_text || "—"}</p>
                      {c.cta_url && (
                        <a
                          href={c.cta_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 block max-w-xs truncate text-xs text-slate-500 hover:text-slate-300"
                        >
                          {c.cta_url}
                        </a>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <PrescreenBadge status={prescreenStatus} />
                      {reasons.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {reasons.map((r, i) => (
                            <li key={i} className="text-xs text-red-400">
                              • {r}
                            </li>
                          ))}
                        </ul>
                      )}
                      {c.prescreen_at && (
                        <p className="mt-1 text-xs text-slate-600">
                          {new Date(c.prescreen_at).toLocaleString()}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          c.status === "approved"
                            ? "bg-green-900/50 text-green-400"
                            : c.status === "rejected"
                              ? "bg-red-900/50 text-red-400"
                              : "bg-yellow-900/50 text-yellow-400"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {c.status === "pending" && (
                        <ApproveCreativeButton
                          campaignId={campaign.id}
                          creativeId={c.id}
                        />
                      )}
                      {c.status === "approved" && (
                        <span className="text-xs text-slate-600">Live</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(!creatives || creatives.length === 0) && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    No creatives submitted yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
