import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase-server";
import { Nav } from "@/components/nav";
import { StatusBadge } from "@/components/status-badge";
import { formatCents } from "@/lib/utils";
import type { Campaign, CampaignStatus } from "@/lib/types";
import Link from "next/link";

export default async function CampaignsPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: advertiser } = await supabase
    .from("advertisers")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!advertiser) redirect("/onboarding");

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .eq("advertiser_id", advertiser.id)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Campaigns</h1>
          <Link
            href="/campaigns/new"
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            New Campaign
          </Link>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">Campaign</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">Flight</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">Budget</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">Spent</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">Pacing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(campaigns as Campaign[] ?? []).map((c) => {
                const pacing = c.budget_cents > 0 ? Math.round((c.spent_cents / c.budget_cents) * 100) : 0;
                const flightStr = c.flight_start && c.flight_end
                  ? `${new Date(c.flight_start).toLocaleDateString()} - ${new Date(c.flight_end).toLocaleDateString()}`
                  : "No dates set";

                return (
                  <tr key={c.id} className="hover:bg-slate-900/50">
                    <td className="px-6 py-4">
                      <Link href={`/campaigns/${c.id}`} className="font-medium text-white hover:text-orange-400">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">{flightStr}</td>
                    <td className="px-6 py-4 text-right text-slate-300">{formatCents(c.budget_cents)}</td>
                    <td className="px-6 py-4 text-right text-slate-300">{formatCents(c.spent_cents)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-700">
                          <div
                            className="h-full rounded-full bg-orange-500"
                            style={{ width: `${Math.min(pacing, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm text-slate-400">{pacing}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(!campaigns || campaigns.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No campaigns yet.{" "}
                    <Link href="/campaigns/new" className="text-orange-400 hover:underline">Create one</Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
