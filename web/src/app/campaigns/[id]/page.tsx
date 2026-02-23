import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase-server";
import { Nav } from "@/components/nav";
import { StatusBadge } from "@/components/status-badge";
import { KpiCard } from "@/components/kpi-card";
import { formatCents, formatNumber, formatPercent } from "@/lib/utils";
import type { CampaignStatus } from "@/lib/types";
import Link from "next/link";
import { CampaignActions } from "./actions";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*, advertisers!inner(auth_user_id, name)")
    .eq("id", id)
    .eq("advertisers.auth_user_id", user.id)
    .single();

  if (!campaign) redirect("/campaigns");

  // Get metrics
  const { data: metrics } = await supabase
    .from("advertiser_reporting")
    .select("*")
    .eq("campaign_id", parseInt(id))
    .single();

  // Get creatives count
  const { count: creativesCount } = await supabase
    .from("creatives")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", parseInt(id));

  // Get bids count
  const { count: bidsCount } = await supabase
    .from("bids")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", parseInt(id));

  const m = metrics as any;

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/campaigns" className="text-sm text-slate-400 hover:text-white">
              &larr; Campaigns
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-white">{campaign.name}</h1>
            <div className="mt-2">
              <StatusBadge status={campaign.status as CampaignStatus} />
            </div>
          </div>
          <CampaignActions campaignId={parseInt(id)} status={campaign.status} />
        </div>

        {/* KPIs */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Impressions" value={formatNumber(m?.total_impressions ?? 0)} />
          <KpiCard title="CTR" value={formatPercent(m?.ctr_pct ?? 0)} />
          <KpiCard title="Spent" value={formatCents(m?.total_spent_cents ?? 0)}
            subtitle={`of ${formatCents(campaign.budget_cents)} budget`} />
          <KpiCard title="Conversions" value={formatNumber(m?.total_conversions ?? 0)} />
        </div>

        {/* Navigation tabs */}
        <div className="mt-8 flex gap-2 border-b border-slate-800 pb-2">
          {[
            { href: `/campaigns/${id}/creatives`, label: "Creatives", count: creativesCount },
            { href: `/campaigns/${id}/bidding`, label: "Bidding", count: bidsCount },
            { href: `/campaigns/${id}/targeting`, label: "Targeting" },
            { href: `/campaigns/${id}/reporting`, label: "Reporting" },
          ].map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              {tab.label}
              {tab.count != null && (
                <span className="ml-1.5 rounded-full bg-slate-700 px-2 py-0.5 text-xs">
                  {tab.count}
                </span>
              )}
            </Link>
          ))}
        </div>

        {/* Campaign details */}
        <div className="mt-6 grid grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-sm font-semibold text-slate-400">Budget</h3>
            <p className="mt-2 text-2xl font-bold text-white">{formatCents(campaign.budget_cents)}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full rounded-full bg-orange-500"
                style={{ width: `${Math.min((campaign.spent_cents / campaign.budget_cents) * 100, 100)}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-slate-400">
              {formatCents(campaign.spent_cents)} spent ({Math.round((campaign.spent_cents / campaign.budget_cents) * 100)}%)
            </p>
            {campaign.daily_budget_cents && (
              <p className="mt-1 text-sm text-slate-500">
                Daily cap: {formatCents(campaign.daily_budget_cents)}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-sm font-semibold text-slate-400">Flight Dates</h3>
            {campaign.flight_start && campaign.flight_end ? (
              <>
                <p className="mt-2 text-lg font-medium text-white">
                  {new Date(campaign.flight_start).toLocaleDateString()} &mdash;{" "}
                  {new Date(campaign.flight_end).toLocaleDateString()}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {Math.ceil((new Date(campaign.flight_end).getTime() - new Date(campaign.flight_start).getTime()) / (24 * 60 * 60 * 1000))} days
                </p>
              </>
            ) : (
              <p className="mt-2 text-slate-500">No flight dates set</p>
            )}
          </div>
        </div>

        {/* Engagement Funnel */}
        {m && m.total_impressions > 0 && (
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-sm font-semibold text-slate-400">Engagement Funnel</h3>
            <div className="mt-4 flex items-end gap-4">
              {[
                { label: "Delivered", value: m.total_impressions, pct: 100 },
                { label: "Seen", value: m.seen_impressions, pct: m.seen_rate_pct },
                { label: "Tapped", value: m.tapped_impressions, pct: m.ctr_pct },
                { label: "Converted", value: m.total_conversions, pct: m.total_impressions > 0 ? (m.total_conversions / m.total_impressions * 100) : 0 },
              ].map((stage) => (
                <div key={stage.label} className="flex-1 text-center">
                  <div className="mx-auto h-32 w-full max-w-16 overflow-hidden rounded-lg bg-slate-700">
                    <div
                      className="h-full w-full bg-orange-500 transition-all"
                      style={{ marginTop: `${100 - Math.min(stage.pct, 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-sm font-medium text-white">{formatNumber(stage.value)}</p>
                  <p className="text-xs text-slate-400">{stage.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
