"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { KpiCard } from "@/components/kpi-card";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { formatCents, formatNumber, formatPercent } from "@/lib/utils";
import type { CampaignMetrics } from "@/lib/types";

interface AttributionSummary {
  campaign_id: number;
  attribution_window_minutes: number;
  methodology_note: string;
  summary: {
    total_impressions: number;
    total_taps: number;
    ctr_pct: number;
    total_attributed_conversions: number;
    attributed_action_rate_pct: number;
    click_through_conversions: number;
    view_through_conversions: number;
    cpa_cents: number | null;
  };
  conversions_by_type: Array<{
    conversion_type: string;
    count: number;
    is_inferred: boolean;
    avg_window_ms: number;
    label: string;
  }>;
}

export default function ReportingPage() {
  const [campaigns, setCampaigns] = useState<CampaignMetrics[]>([]);
  const [attribution, setAttribution] = useState<AttributionSummary | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [attrLoading, setAttrLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function fetchWithAuth(body: object) {
    const supabase = createSupabaseBrowser();
    const { data: { session } } = await supabase.auth.getSession();
    return fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/reporting-api`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(body),
      }
    );
  }

  async function loadData() {
    const res = await fetchWithAuth({ report_type: "overview" });
    if (res.ok) {
      const data = await res.json();
      setCampaigns(data.campaigns ?? []);
    }
    setLoading(false);
  }

  async function loadAttribution(campaignId: number) {
    setAttrLoading(true);
    setSelectedCampaignId(campaignId);
    const res = await fetchWithAuth({ report_type: "attribution", campaign_id: campaignId });
    if (res.ok) {
      const data = await res.json();
      setAttribution(data);
    }
    setAttrLoading(false);
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
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">Attribution</th>
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
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => loadAttribution(c.campaign_id)}
                        className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                          selectedCampaignId === c.campaign_id
                            ? "bg-blue-700 text-white"
                            : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                        }`}
                      >
                        {attrLoading && selectedCampaignId === c.campaign_id ? "…" : "View"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && campaigns.length === 0 && (
              <p className="px-6 py-8 text-center text-slate-500">No data available.</p>
            )}
          </div>
        </div>

        {/* Attribution panel (P2-03) */}
        {attribution && (
          <div className="mt-8 rounded-xl border border-blue-900 bg-slate-900 p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Attribution — {attribution.attribution_window_minutes}-min Window
                </h2>
                <p className="mt-1 max-w-2xl text-xs text-slate-500">
                  {attribution.methodology_note}
                </p>
              </div>
              <button
                onClick={() => setAttribution(null)}
                className="ml-4 text-slate-500 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KpiCard
                title="Attributed Conversions"
                value={formatNumber(attribution.summary.total_attributed_conversions)}
                subtitle={`action rate ${formatPercent(attribution.summary.attributed_action_rate_pct)}`}
              />
              <KpiCard
                title="CPA"
                value={attribution.summary.cpa_cents != null ? formatCents(attribution.summary.cpa_cents) : "—"}
                subtitle="cost per attributed action"
              />
              <KpiCard
                title="Click-through"
                value={formatNumber(attribution.summary.click_through_conversions)}
                subtitle="CTA tapped → action"
              />
              <KpiCard
                title="View-through"
                value={formatNumber(attribution.summary.view_through_conversions)}
                subtitle="seen → action (no tap)"
              />
            </div>

            {/* Conversion breakdown with inferred/verified labels */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-300">Conversions by Type</h3>
              <p className="mt-1 text-xs text-yellow-600">
                Actions labeled "Inferred" mean NORMA opened an external app or site. The downstream
                action (wager, watch, purchase) cannot be confirmed without a partner API callback.
              </p>
              <div className="mt-3 divide-y divide-slate-800 rounded-lg border border-slate-800">
                {attribution.conversions_by_type.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-slate-500">
                    No attributed conversions in the 30-min window.
                  </p>
                )}
                {attribution.conversions_by_type.map((c) => (
                  <div key={c.conversion_type} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {c.conversion_type.replace(/_/g, " ")}
                      </p>
                      <p
                        className={`text-xs ${
                          c.is_inferred ? "text-yellow-500" : "text-green-400"
                        }`}
                      >
                        {c.is_inferred ? "Inferred" : "App-verified"} — {c.label}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">{formatNumber(c.count)}</p>
                      <p className="text-xs text-slate-500">
                        avg {Math.round(c.avg_window_ms / 1000)}s after impression
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

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
