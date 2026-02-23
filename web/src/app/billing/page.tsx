"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { KpiCard } from "@/components/kpi-card";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { formatCents, formatNumber } from "@/lib/utils";

interface SpendEntry {
  campaign_name: string;
  total_spent_cents: number;
  total_impressions: number;
}

export default function BillingPage() {
  const [campaigns, setCampaigns] = useState<SpendEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: advertiser } = await supabase
      .from("advertisers")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();

    if (!advertiser) return;

    const { data } = await supabase
      .from("advertiser_reporting")
      .select("campaign_name, total_spent_cents, total_impressions")
      .eq("advertiser_id", advertiser.id);

    setCampaigns((data as SpendEntry[]) ?? []);
    setLoading(false);
  }

  const totalSpent = campaigns.reduce((s, c) => s + c.total_spent_cents, 0);
  const totalImpressions = campaigns.reduce((s, c) => s + c.total_impressions, 0);

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-bold text-white">Billing</h1>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <KpiCard title="Total Spend" value={formatCents(totalSpent)} />
          <KpiCard title="Total Impressions" value={formatNumber(totalImpressions)} />
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-semibold text-white">Spend by Campaign</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">Campaign</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">Impressions</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">Spent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {campaigns.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-900/50">
                    <td className="px-6 py-4 text-white">{c.campaign_name}</td>
                    <td className="px-6 py-4 text-right text-slate-300">{formatNumber(c.total_impressions)}</td>
                    <td className="px-6 py-4 text-right text-slate-300">{formatCents(c.total_spent_cents)}</td>
                  </tr>
                ))}
                {!loading && campaigns.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-slate-500">No billing data yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-sm font-semibold text-slate-400">Billing Model</h3>
          <p className="mt-2 text-sm text-slate-300">
            NORMA uses a second-price auction model. You only pay the minimum amount needed to win each impression,
            which is the second-highest bid plus one cent (or the floor price, whichever is higher).
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Invoices are generated monthly based on actual impressions delivered.
          </p>
        </div>
      </main>
    </div>
  );
}
