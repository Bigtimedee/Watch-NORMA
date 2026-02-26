import { requireAdmin } from "@/lib/admin";
import { KpiCard } from "@/components/kpi-card";
import { formatCents, formatNumber } from "@/lib/utils";

export default async function AdminDashboardPage() {
  const { supabase } = await requireAdmin();

  // Total mobile users
  const { count: totalUsers } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });

  // Total advertisers
  const { count: totalAdvertisers } = await supabase
    .from("advertisers")
    .select("*", { count: "exact", head: true });

  // New users (7d)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count: newUsers7d } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .gte("created_at", sevenDaysAgo);

  // New advertisers (7d)
  const { count: newAdvertisers7d } = await supabase
    .from("advertisers")
    .select("*", { count: "exact", head: true })
    .gte("created_at", sevenDaysAgo);

  // Revenue: total deposits
  const { data: depositData } = await supabase
    .from("advertiser_transactions")
    .select("amount_cents")
    .eq("type", "deposit");
  const totalRevenue = (depositData ?? []).reduce((s, t) => s + t.amount_cents, 0);

  // Total ad spend
  const { data: spendData } = await supabase
    .from("advertiser_transactions")
    .select("amount_cents")
    .eq("type", "campaign_spend");
  const totalAdSpend = (spendData ?? []).reduce((s, t) => s + Math.abs(t.amount_cents), 0);

  // Platform balance (sum of all advertiser balances)
  const { data: balanceData } = await supabase
    .from("advertisers")
    .select("balance_cents");
  const platformBalance = (balanceData ?? []).reduce((s, a) => s + a.balance_cents, 0);

  // Active campaigns
  const { count: activeCampaigns } = await supabase
    .from("campaigns")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  // Total impressions
  const { count: totalImpressions } = await supabase
    .from("impressions")
    .select("*", { count: "exact", head: true });

  // Avg Cost per Moment
  const avgCostPerMoment =
    (totalImpressions ?? 0) > 0
      ? totalAdSpend / (totalImpressions ?? 1)
      : 0;

  // Unresolved fraud events
  const { count: unresolvedFraud } = await supabase
    .from("ad_fraud_events")
    .select("*", { count: "exact", head: true })
    .eq("resolved", false);

  // Gross margin
  const grossMargin =
    totalRevenue > 0 ? ((totalRevenue - totalAdSpend) / totalRevenue) * 100 : 0;

  return (
    <>
      <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>

      {/* Row 1: User Stats */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total Mobile Users" value={formatNumber(totalUsers ?? 0)} />
        <KpiCard title="Total Advertisers" value={formatNumber(totalAdvertisers ?? 0)} />
        <KpiCard
          title="New Users (7d)"
          value={formatNumber(newUsers7d ?? 0)}
          trend={(newUsers7d ?? 0) > 0 ? "up" : "neutral"}
        />
        <KpiCard
          title="New Advertisers (7d)"
          value={formatNumber(newAdvertisers7d ?? 0)}
          trend={(newAdvertisers7d ?? 0) > 0 ? "up" : "neutral"}
        />
      </div>

      {/* Row 2: Revenue */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total Revenue" value={formatCents(totalRevenue)} />
        <KpiCard title="Total Ad Spend" value={formatCents(totalAdSpend)} />
        <KpiCard title="Platform Balance" value={formatCents(platformBalance)} />
        <KpiCard title="Avg Cost/Moment" value={formatCents(Math.round(avgCostPerMoment))} />
      </div>

      {/* Row 3: Operations */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Active Campaigns" value={formatNumber(activeCampaigns ?? 0)} />
        <KpiCard title="Total Impressions" value={formatNumber(totalImpressions ?? 0)} />
        <KpiCard
          title="Unresolved Fraud"
          value={formatNumber(unresolvedFraud ?? 0)}
          trend={(unresolvedFraud ?? 0) > 0 ? "down" : "neutral"}
        />
        <KpiCard
          title="Gross Margin"
          value={`${grossMargin.toFixed(1)}%`}
          trend={grossMargin > 0 ? "up" : "neutral"}
        />
      </div>
    </>
  );
}
