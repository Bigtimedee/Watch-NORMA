import { redirect } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { StatusBadge } from "@/components/status-badge";
import { createSupabaseServer } from "@/lib/supabase-server";
import { formatCents } from "@/lib/utils";
import type {
  Campaign,
  CampaignApprovalStatus,
} from "@/lib/types";

type CampaignWithApproval = Campaign & {
  approval_status: CampaignApprovalStatus;
  approval_note: string | null;
};

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

export default async function DashboardCampaignsPage() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: advertiser } = await supabase
    .from("advertisers")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!advertiser) redirect("/onboarding");

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .eq("advertiser_id", advertiser.id)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Campaigns</h1>
          <Link
            href="/campaigns/new"
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            New Campaign
          </Link>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Campaign
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Approval
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Flight
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">
                  Budget
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">
                  Spent
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">
                  Pacing
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {((campaigns ?? []) as CampaignWithApproval[]).map((campaign) => {
                const pacing =
                  campaign.budget_cents > 0
                    ? Math.round(
                        (campaign.spent_cents / campaign.budget_cents) * 100
                      )
                    : 0;
                const flight =
                  campaign.flight_start && campaign.flight_end
                    ? `${new Date(
                        campaign.flight_start
                      ).toLocaleDateString()} - ${new Date(
                        campaign.flight_end
                      ).toLocaleDateString()}`
                    : "No dates set";

                return (
                  <tr key={campaign.id} className="hover:bg-slate-900/50">
                    <td className="px-6 py-4">
                      <Link
                        href={`/campaigns/${campaign.id}`}
                        className="font-medium text-white hover:text-orange-400"
                      >
                        {campaign.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={campaign.status} />
                    </td>
                    <td className="px-6 py-4">
                      <ApprovalBadge status={campaign.approval_status} />
                      {campaign.approval_status === "rejected" &&
                        campaign.approval_note && (
                          <p className="mt-1 max-w-xs text-xs text-slate-400">
                            {campaign.approval_note}
                          </p>
                        )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {flight}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-300">
                      {formatCents(campaign.budget_cents)}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-300">
                      {formatCents(campaign.spent_cents)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-700">
                          <div
                            className="h-full rounded-full bg-orange-500"
                            style={{ width: `${Math.min(pacing, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm text-slate-400">
                          {pacing}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(!campaigns || campaigns.length === 0) && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    No campaigns yet.{" "}
                    <Link
                      href="/campaigns/new"
                      className="text-orange-400 hover:underline"
                    >
                      Create one
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
