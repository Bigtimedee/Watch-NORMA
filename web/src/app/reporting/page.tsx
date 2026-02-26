"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { KpiCard } from "@/components/kpi-card";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { formatCents, formatNumber, formatPercent } from "@/lib/utils";
import type { CampaignMetrics } from "@/lib/types";

export default function ReportingPage() {
  const [campaigns, setCampaigns] = useState<CampaignMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const supabase = createSupabaseBrowser();
    const { data: { session } } = await supabase.auth.getSession();

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/reporting-api`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ report_type: "overview" }),
      }
    );

    if (res.ok) {
      const data = await res.json();
      setCampaigns(data.campaigns ?? []);
    }
    setLoading(false);
  }

  const totals = campaigns.reduce(
    (acc, c) => ({
      impressions: acc.impressions + c.total_impressions,
      seen: acc.seen + c.seen_impressions,
      tapped: acc.tapped + c.tapped_impressions,
      conversions: acc.conversions + c.total_conversions,
      spent: acc.spent + c.total_spent_cents,
      users: acc.users + c.unique_users_reached,
    }),
    { impressions: 0, seen: 0, tapped: 0, conversions: 0, spent: 0, users: 0 }
  );

  const avgCTR = totals.impressions > 0 ? (totals.tapped / totals.impressions) * 100 : 0;
  const avgCPA = totals.conversions > 0 ? totals.spent / totals.conversions : 0;

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-2xl font-bold text-white">Cross-Campaign Analytics</h1>

        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard title="Total Impressions" value={formatNumber(totals.impressions)} />
          <KpiCard title="Total Spent" value={formatCents(totals.spent)} />
          <KpiCard title="Avg CTR" value={formatPercent(avgCTR)} />
          <KpiCard title="Avg CPA" value={avgCPA > 0 ? formatCents(avgCPA) : "N/A"} />
        </div>

        {/* Per-campaign comparison */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-white">Campaign Comparison</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">Campaign</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">Impressions</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">CTR</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">Cost/Moment</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">Conversions</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">Spent</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">Users</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {campaigns.map((c) => (
                  <tr key={c.campaign_id} className="hover:bg-slate-900/50">
                    <td className="px-6 py-4 font-medium text-white">{c.campaign_name}</td>
                    <td className="px-6 py-4 text-right text-slate-300">{formatNumber(c.total_impressions)}</td>
                    <td className="px-6 py-4 text-right text-slate-300">{formatPercent(c.ctr_pct)}</td>
                    <td className="px-6 py-4 text-right text-slate-300">{formatCents(c.effective_cost_per_moment_cents)}</td>
                    <td className="px-6 py-4 text-right text-slate-300">{formatNumber(c.total_conversions)}</td>
                    <td className="px-6 py-4 text-right text-slate-300">{formatCents(c.total_spent_cents)}</td>
                    <td className="px-6 py-4 text-right text-slate-300">{formatNumber(c.unique_users_reached)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && campaigns.length === 0 && (
              <p className="px-6 py-8 text-center text-slate-500">No data available.</p>
            )}
          </div>
        </div>

        {/* Engagement funnel */}
        {totals.impressions > 0 && (
          <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-sm font-semibold text-slate-400">Overall Funnel</h3>
            <div className="mt-4 flex gap-4">
              {[
                { label: "Delivered", value: totals.impressions, pct: 100 },
                { label: "Seen", value: totals.seen, pct: totals.impressions > 0 ? (totals.seen / totals.impressions) * 100 : 0 },
                { label: "Tapped", value: totals.tapped, pct: totals.impressions > 0 ? (totals.tapped / totals.impressions) * 100 : 0 },
                { label: "Converted", value: totals.conversions, pct: totals.impressions > 0 ? (totals.conversions / totals.impressions) * 100 : 0 },
              ].map((stage) => (
                <div key={stage.label} className="flex-1 text-center">
                  <p className="text-3xl font-bold text-white">{formatNumber(stage.value)}</p>
                  <p className="mt-1 text-sm text-slate-400">{stage.label}</p>
                  <p className="text-xs text-slate-500">{formatPercent(stage.pct)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
