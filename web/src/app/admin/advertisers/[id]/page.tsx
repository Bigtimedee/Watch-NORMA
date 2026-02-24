import { requireAdmin } from "@/lib/admin";
import { formatCents } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { notFound } from "next/navigation";
import type { CampaignStatus } from "@/lib/types";
import { AdvertiserDetailActions } from "./detail-actions";

export default async function AdminAdvertiserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const { data: advertiser } = await supabase
    .from("advertisers")
    .select("*")
    .eq("id", Number(id))
    .single();

  if (!advertiser) notFound();

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, status, budget_cents, spent_cents, created_at")
    .eq("advertiser_id", Number(id))
    .order("created_at", { ascending: false });

  const { data: transactions } = await supabase
    .from("advertiser_transactions")
    .select("*")
    .eq("advertiser_id", Number(id))
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <>
      <h1 className="text-2xl font-bold text-white">{advertiser.name}</h1>
      <p className="mt-1 text-sm text-slate-400">Advertiser ID: {advertiser.id}</p>

      <AdvertiserDetailActions advertiser={advertiser} />

      {/* Campaigns */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-white">Campaigns</h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Campaign
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(campaigns ?? []).map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-900/50">
                  <td className="px-6 py-4 font-medium text-white">{c.name}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={c.status as CampaignStatus} />
                  </td>
                  <td className="px-6 py-4 text-right text-slate-300">
                    {formatCents(c.budget_cents)}
                  </td>
                  <td className="px-6 py-4 text-right text-slate-300">
                    {formatCents(c.spent_cents)}
                  </td>
                </tr>
              ))}
              {(!campaigns || campaigns.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                    No campaigns.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction History */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-white">Transaction History</h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Type
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">
                  Amount
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">
                  Balance After
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(transactions ?? []).map((t: any) => (
                <tr key={t.id} className="hover:bg-slate-900/50">
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {new Date(t.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300">
                      {t.type}
                    </span>
                  </td>
                  <td
                    className={`px-6 py-4 text-right font-medium ${
                      t.amount_cents >= 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {t.amount_cents >= 0 ? "+" : ""}
                    {formatCents(t.amount_cents)}
                  </td>
                  <td className="px-6 py-4 text-right text-slate-300">
                    {formatCents(t.balance_after_cents)}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {t.description || "—"}
                  </td>
                </tr>
              ))}
              {(!transactions || transactions.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    No transactions.
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
