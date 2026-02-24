import { requireAdmin } from "@/lib/admin";
import { formatCents, formatNumber } from "@/lib/utils";
import Link from "next/link";
import { AdvertiserActions } from "./advertiser-actions";

export default async function AdminAdvertisersPage() {
  const { supabase } = await requireAdmin();

  const { data: advertisers } = await supabase
    .from("advertisers")
    .select("id, name, category, billing_model, balance_cents, created_at")
    .order("created_at", { ascending: false });

  // Get campaign counts per advertiser
  const { data: campaignCounts } = await supabase
    .from("campaigns")
    .select("advertiser_id");

  const countMap: Record<number, number> = {};
  (campaignCounts ?? []).forEach((c: any) => {
    countMap[c.advertiser_id] = (countMap[c.advertiser_id] || 0) + 1;
  });

  return (
    <>
      <h1 className="text-2xl font-bold text-white">Advertisers</h1>
      <p className="mt-1 text-sm text-slate-400">
        Manage advertiser accounts
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-800">
        <table className="w-full">
          <thead className="bg-slate-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                Billing
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">
                Balance
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">
                Campaigns
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                Joined
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {(advertisers ?? []).map((a: any) => (
              <tr key={a.id} className="hover:bg-slate-900/50">
                <td className="px-6 py-4">
                  <Link
                    href={`/admin/advertisers/${a.id}`}
                    className="font-medium text-white hover:text-orange-400"
                  >
                    {a.name}
                  </Link>
                </td>
                <td className="px-6 py-4 text-sm text-slate-300">
                  {a.category || "—"}
                </td>
                <td className="px-6 py-4 text-sm text-slate-300">
                  {a.billing_model}
                </td>
                <td className="px-6 py-4 text-right text-slate-300">
                  {formatCents(a.balance_cents)}
                </td>
                <td className="px-6 py-4 text-right text-slate-300">
                  {formatNumber(countMap[a.id] || 0)}
                </td>
                <td className="px-6 py-4 text-sm text-slate-400">
                  {new Date(a.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-right">
                  <AdvertiserActions advertiserId={a.id} />
                </td>
              </tr>
            ))}
            {(!advertisers || advertisers.length === 0) && (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-8 text-center text-slate-500"
                >
                  No advertisers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
