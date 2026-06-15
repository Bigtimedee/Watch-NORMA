import { requireAdmin } from "@/lib/admin";
import { formatCents, formatNumber } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import type { CampaignApprovalStatus, CampaignStatus } from "@/lib/types";
import { CampaignActions } from "./campaign-actions";

const APPROVAL_STYLES: Record<CampaignApprovalStatus, string> = {
  pending: "bg-yellow-900/50 text-yellow-400",
  approved: "bg-green-900/50 text-green-400",
  rejected: "bg-red-900/50 text-red-400",
  paused: "bg-orange-900/50 text-orange-400",
};

const APPROVAL_LABELS: Record<CampaignApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  paused: "Paused",
};

function ApprovalBadge({ status }: { status: CampaignApprovalStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${APPROVAL_STYLES[status]}`}
    >
      {APPROVAL_LABELS[status]}
    </span>
  );
}

type BrandSafetyStatus = "pending" | "approved" | "flagged";

const BRAND_SAFETY_STYLES: Record<BrandSafetyStatus, string> = {
  pending: "bg-yellow-900/50 text-yellow-400",
  approved: "bg-green-900/50 text-green-400",
  flagged: "bg-red-900/50 text-red-400",
};

const BRAND_SAFETY_LABELS: Record<BrandSafetyStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  flagged: "Flagged",
};

function BrandSafetyBadge({ status }: { status: BrandSafetyStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${BRAND_SAFETY_STYLES[status]}`}
    >
      {BRAND_SAFETY_LABELS[status]}
    </span>
  );
}

export default async function AdminCampaignsPage() {
  const { supabase } = await requireAdmin();

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select(
      "id, advertiser_id, name, status, approval_status, approval_note, budget_cents, spent_cents, brand_safety_status, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const sortedCampaigns = [...(campaigns ?? [])].sort((a: any, b: any) => {
    if (a.approval_status === b.approval_status) return 0;
    if (a.approval_status === "pending") return -1;
    if (b.approval_status === "pending") return 1;
    return 0;
  });

  const pendingCount = (campaigns ?? []).filter(
    (campaign: any) => campaign.approval_status === "pending"
  ).length;

  // Get advertiser names
  const advertiserIds = [
    ...new Set(sortedCampaigns.map((c: any) => c.advertiser_id)),
  ];
  const { data: advertisers } = await supabase
    .from("advertisers")
    .select("id, name")
    .in("id", advertiserIds.length > 0 ? advertiserIds : [0]);

  const advertiserMap: Record<number, string> = {};
  (advertisers ?? []).forEach((a: any) => {
    advertiserMap[a.id] = a.name;
  });

  // Get impression counts per campaign
  const { data: impressionCounts } = await supabase
    .from("impressions")
    .select("campaign_id");

  const impressionMap: Record<number, number> = {};
  (impressionCounts ?? []).forEach((i: any) => {
    impressionMap[i.campaign_id] = (impressionMap[i.campaign_id] || 0) + 1;
  });

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">All Campaigns</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage campaigns across all advertisers
          </p>
        </div>
        <div className="rounded-lg border border-yellow-900/60 bg-yellow-950/40 px-4 py-3 text-right">
          <p className="text-2xl font-bold text-yellow-300">{pendingCount}</p>
          <p className="text-xs font-semibold uppercase text-yellow-500">
            Pending Approval
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full">
          <thead className="bg-slate-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                Campaign
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                Advertiser
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                Approval
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                Brand Safety
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">
                Budget
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">
                Spent
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">
                Impressions
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {sortedCampaigns.map((c: any) => (
              <tr key={c.id} className="hover:bg-slate-900/50">
                <td className="px-6 py-4 font-medium text-white">{c.name}</td>
                <td className="px-6 py-4 text-sm text-slate-300">
                  {advertiserMap[c.advertiser_id] || "Unknown"}
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={c.status as CampaignStatus} />
                </td>
                <td className="px-6 py-4">
                  <ApprovalBadge
                    status={c.approval_status as CampaignApprovalStatus}
                  />
                  {c.approval_status === "rejected" && c.approval_note && (
                    <p className="mt-1 max-w-xs text-xs text-slate-400">
                      {c.approval_note}
                    </p>
                  )}
                </td>
                <td className="px-6 py-4">
                  <BrandSafetyBadge
                    status={(c.brand_safety_status ?? "pending") as BrandSafetyStatus}
                  />
                </td>
                <td className="px-6 py-4 text-right text-slate-300">
                  {formatCents(c.budget_cents)}
                </td>
                <td className="px-6 py-4 text-right text-slate-300">
                  {formatCents(c.spent_cents)}
                </td>
                <td className="px-6 py-4 text-right text-slate-300">
                  {formatNumber(impressionMap[c.id] || 0)}
                </td>
                <td className="px-6 py-4 text-right">
                  <CampaignActions
                    campaignId={c.id}
                    approvalStatus={
                      c.approval_status as CampaignApprovalStatus
                    }
                  />
                </td>
              </tr>
            ))}
            {sortedCampaigns.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-6 py-8 text-center text-slate-500"
                >
                  No campaigns found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
