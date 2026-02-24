import { requireAdmin } from "@/lib/admin";
import { formatCents, formatNumber } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import type { CampaignStatus } from "@/lib/types";
import { CampaignActions } from "./campaign-actions";

export default async function AdminCampaignsPage() {
  const { supabase } = await requireAdmin();

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, advertiser_id, name, status, budget_cents, spent_cents, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  // Get advertiser names
  const advertiserIds = [
    ...new Set((campaigns ?? []).map((c: any) => c.advertiser_id)),
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
      <h1 className="text-2xl font-bold text-white">All Campaigns</h1>
      <p className="mt-1 text-sm text-slate-400">
        Manage campaigns across all advertisers
      </p>

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
            {(campaigns ?? []).map((c: any) => (
              <tr key={c.id} className="hover:bg-slate-900/50">
                <td className="px-6 py-4 font-medium text-white">{c.name}</td>
                <td className="px-6 py-4 text-sm text-slate-300">
                  {advertiserMap[c.advertiser_id] || "Unknown"}
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={c.status as CampaignStatus} />
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
                    status={c.status as CampaignStatus}
                  />
                </td>
              </tr>
            ))}
            {(!campaigns || campaigns.length === 0) && (
              <tr>
                <td
                  colSpan={7}
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
