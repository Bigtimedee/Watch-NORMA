import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase-server";
import { Nav } from "@/components/nav";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { formatCents, formatNumber, formatPercent } from "@/lib/utils";
import type { CampaignMetrics, CampaignStatus } from "@/lib/types";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: advertiser } = await supabase
    .from("advertisers")
    .select("id, name, balance_cents")
    .eq("auth_user_id", user.id)
    .single();

  if (!advertiser) redirect("/onboarding");

  // Fetch aggregate metrics
  const { data: metrics } = await supabase
    .from("advertiser_reporting")
    .select("*")
    .eq("advertiser_id", advertiser.id);

  const allMetrics = (metrics ?? []) as CampaignMetrics[];

  const totalImpressions = allMetrics.reduce((s, m) => s + m.total_impressions, 0);
  const totalSpent = allMetrics.reduce((s, m) => s + m.total_spent_cents, 0);
  const totalTapped = allMetrics.reduce((s, m) => s + m.tapped_impressions, 0);
  const activeCampaigns = allMetrics.filter((m) => m.campaign_status === "active").length;
  const avgCTR = totalImpressions > 0 ? (totalTapped / totalImpressions) * 100 : 0;

  // Supply forecasts
  const { data: forecasts } = await supabase
    .from("supply_forecasts")
    .select("*")
    .gte("forecast_date", new Date().toISOString().split("T")[0])
    .order("forecast_date")
    .limit(70);

  // Active campaigns list
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, status, budget_cents, spent_cents")
    .eq("advertiser_id", advertiser.id)
    .in("status", ["active", "pending_review", "paused"])
    .order("updated_at", { ascending: false })
    .limit(10);

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-2xl font-bold text-white">
          Welcome back, {advertiser.name}
        </h1>

        {/* KPI Cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            title="Wallet Balance"
            value={formatCents(advertiser.balance_cents ?? 0)}
          />
          <KpiCard
            title="Total Impressions"
            value={formatNumber(totalImpressions)}
          />
          <KpiCard
            title="Total Spent"
            value={formatCents(totalSpent)}
          />
          <KpiCard
            title="Active Campaigns"
            value={String(activeCampaigns)}
          />
          <KpiCard
            title="Avg CTR"
            value={formatPercent(avgCTR)}
          />
        </div>

        {/* Active Campaigns */}
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Active Campaigns</h2>
            <Link
              href="/campaigns/new"
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
            >
              New Campaign
            </Link>
          </div>

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
                    <td className="px-6 py-4">
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="font-medium text-white hover:text-orange-400"
                      >
                        {c.name}
                      </Link>
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
                  </tr>
                ))}
                {(!campaigns || campaigns.length === 0) && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                      No active campaigns.{" "}
                      <Link href="/campaigns/new" className="text-orange-400 hover:underline">
                        Create your first campaign
                      </Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Supply Forecast Summary */}
        {forecasts && forecasts.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-white">
              7-Day Supply Forecast
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Estimated available moments across all moment types
            </p>
            <div className="mt-4 grid grid-cols-7 gap-2">
              {Array.from(
                new Set((forecasts as any[]).map((f: any) => f.forecast_date))
              )
                .slice(0, 7)
                .map((date) => {
                  const dayForecasts = (forecasts as any[]).filter(
                    (f: any) => f.forecast_date === date
                  );
                  const totalMoments = dayForecasts.reduce(
                    (s: number, f: any) => s + f.predicted_moments,
                    0
                  );
                  const d = new Date(date + "T12:00:00Z");
                  return (
                    <div
                      key={date as string}
                      className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-center"
                    >
                      <p className="text-xs text-slate-500">
                        {d.toLocaleDateString("en-US", { weekday: "short" })}
                      </p>
                      <p className="mt-1 text-lg font-bold text-white">
                        {totalMoments}
                      </p>
                      <p className="text-xs text-slate-500">moments</p>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
