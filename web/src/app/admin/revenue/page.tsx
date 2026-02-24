import { requireAdmin } from "@/lib/admin";
import { formatCents } from "@/lib/utils";
import { KpiCard } from "@/components/kpi-card";

export default async function AdminRevenuePage() {
  const { supabase } = await requireAdmin();

  // All transactions
  const { data: transactions } = await supabase
    .from("advertiser_transactions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  const allTx = transactions ?? [];

  const totalDeposits = allTx
    .filter((t: any) => t.type === "deposit")
    .reduce((s: number, t: any) => s + t.amount_cents, 0);

  const totalSpend = allTx
    .filter((t: any) => t.type === "campaign_spend")
    .reduce((s: number, t: any) => s + Math.abs(t.amount_cents), 0);

  const totalRefunds = allTx
    .filter((t: any) => t.type === "refund")
    .reduce((s: number, t: any) => s + t.amount_cents, 0);

  const totalAdjustments = allTx
    .filter((t: any) => t.type === "adjustment")
    .reduce((s: number, t: any) => s + t.amount_cents, 0);

  // Top spending advertisers
  const spendByAdvertiser: Record<number, number> = {};
  allTx
    .filter((t: any) => t.type === "campaign_spend")
    .forEach((t: any) => {
      spendByAdvertiser[t.advertiser_id] =
        (spendByAdvertiser[t.advertiser_id] || 0) + Math.abs(t.amount_cents);
    });

  const topAdvertiserIds = Object.entries(spendByAdvertiser)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => Number(id));

  const { data: topAdvertisers } = await supabase
    .from("advertisers")
    .select("id, name")
    .in("id", topAdvertiserIds.length > 0 ? topAdvertiserIds : [0]);

  const advertiserNameMap: Record<number, string> = {};
  (topAdvertisers ?? []).forEach((a: any) => {
    advertiserNameMap[a.id] = a.name;
  });

  return (
    <>
      <h1 className="text-2xl font-bold text-white">Revenue</h1>
      <p className="mt-1 text-sm text-slate-400">
        Platform revenue and transaction analytics
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total Deposits" value={formatCents(totalDeposits)} />
        <KpiCard title="Total Ad Spend" value={formatCents(totalSpend)} />
        <KpiCard title="Total Refunds" value={formatCents(totalRefunds)} />
        <KpiCard title="Total Adjustments" value={formatCents(totalAdjustments)} />
      </div>

      {/* Top Spenders */}
      {topAdvertiserIds.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-white">
            Top Spending Advertisers
          </h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                    Advertiser
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">
                    Total Spend
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {topAdvertiserIds.map((id) => (
                  <tr key={id} className="hover:bg-slate-900/50">
                    <td className="px-6 py-4 text-white">
                      {advertiserNameMap[id] || `Advertiser #${id}`}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-300">
                      {formatCents(spendByAdvertiser[id])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transaction Ledger */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-white">
          Transaction Ledger
        </h2>
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
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {allTx.map((t: any) => (
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
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {t.description || "—"}
                  </td>
                </tr>
              ))}
              {allTx.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    No transactions found.
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
