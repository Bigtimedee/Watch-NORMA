"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Nav } from "@/components/nav";
import { KpiCard } from "@/components/kpi-card";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { formatCents, formatNumber, formatPercent } from "@/lib/utils";
import Link from "next/link";

interface DailyStat {
  impression_date: string;
  moment_type: string;
  impressions: number;
  seen: number;
  tapped: number;
  spent_cents: number;
}

export default function CampaignReportingPage() {
  const { id } = useParams<{ id: string }>();
  const [metrics, setMetrics] = useState<any>(null);
  const [daily, setDaily] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [id]);

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
        body: JSON.stringify({
          report_type: "campaign_detail",
          campaign_id: parseInt(id),
        }),
      }
    );

    if (res.ok) {
      const data = await res.json();
      setMetrics(data.metrics);
      setDaily(data.daily ?? []);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <Nav />
        <main className="mx-auto max-w-5xl px-6 py-8">
          <p className="text-slate-400">Loading reporting data...</p>
        </main>
      </div>
    );
  }

  const m = metrics;

  // Aggregate daily data for chart
  const dailyByDate = daily.reduce<Record<string, { impressions: number; tapped: number; spent: number }>>((acc, d) => {
    if (!acc[d.impression_date]) acc[d.impression_date] = { impressions: 0, tapped: 0, spent: 0 };
    acc[d.impression_date].impressions += d.impressions;
    acc[d.impression_date].tapped += d.tapped;
    acc[d.impression_date].spent += d.spent_cents;
    return acc;
  }, {});

  // Aggregate by moment type
  const byMomentType = daily.reduce<Record<string, { impressions: number; tapped: number }>>((acc, d) => {
    if (!acc[d.moment_type]) acc[d.moment_type] = { impressions: 0, tapped: 0 };
    acc[d.moment_type].impressions += d.impressions;
    acc[d.moment_type].tapped += d.tapped;
    return acc;
  }, {});

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Link href={`/campaigns/${id}`} className="text-sm text-slate-400 hover:text-white">
          &larr; Campaign
        </Link>
        <h1 className="mt-4 text-xl font-bold text-white">Reporting</h1>

        {m && (
          <>
            <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard title="Impressions" value={formatNumber(m.total_impressions)} />
              <KpiCard title="CTR" value={formatPercent(m.ctr_pct)} />
              <KpiCard title="Cost/Moment" value={formatCents(m.effective_cost_per_moment_cents)} />
              <KpiCard title="Users Reached" value={formatNumber(m.unique_users_reached)} />
            </div>

            {/* Daily table */}
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-slate-400">Daily Performance</h3>
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-800">
                <table className="w-full">
                  <thead className="bg-slate-900">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-400">Date</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-slate-400">Impressions</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-slate-400">Tapped</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-slate-400">CTR</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-slate-400">Spent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {Object.entries(dailyByDate)
                      .sort(([a], [b]) => b.localeCompare(a))
                      .map(([date, data]) => (
                        <tr key={date} className="hover:bg-slate-900/50">
                          <td className="px-4 py-3 text-sm text-white">{date}</td>
                          <td className="px-4 py-3 text-right text-sm text-slate-300">{formatNumber(data.impressions)}</td>
                          <td className="px-4 py-3 text-right text-sm text-slate-300">{formatNumber(data.tapped)}</td>
                          <td className="px-4 py-3 text-right text-sm text-slate-300">
                            {data.impressions > 0 ? formatPercent((data.tapped / data.impressions) * 100) : "0%"}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-300">{formatCents(data.spent)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* By moment type */}
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-slate-400">By Moment Type</h3>
              <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
                {Object.entries(byMomentType).map(([type, data]) => (
                  <div key={type} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                    <p className="text-sm font-medium text-white">{type}</p>
                    <p className="mt-1 text-2xl font-bold text-white">{formatNumber(data.impressions)}</p>
                    <p className="text-xs text-slate-400">
                      {data.impressions > 0 ? formatPercent((data.tapped / data.impressions) * 100) : "0%"} CTR
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {!m && !loading && (
          <p className="mt-8 text-center text-slate-500">No reporting data available yet.</p>
        )}
      </main>
    </div>
  );
}
