import { requireAdmin } from "@/lib/admin";

function pacingStatus(committed: number, delivered: number, daysElapsed: number, totalDays: number) {
  if (totalDays <= 0) return { label: "No dates", color: "text-slate-400" };
  const expectedPct = daysElapsed / totalDays;
  const deliveredPct = committed > 0 ? delivered / committed : 0;
  const delta = deliveredPct - expectedPct;
  if (delta >= -0.05) return { label: "On pace", color: "text-green-400" };
  if (delta >= -0.15) return { label: "Slightly behind", color: "text-yellow-400" };
  return { label: "Behind pace", color: "text-red-400" };
}

export default async function DirectDealsPage() {
  const { supabase } = await requireAdmin();

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, monthly_impression_guarantee, flight_start, flight_end, status, demand_type, advertisers(name)")
    .gt("priority_tier", 0)
    .order("created_at", { ascending: false });

  const allCampaigns = campaigns ?? [];

  // Fetch impression counts for each campaign
  const campaignIds = allCampaigns.map((c: any) => c.id);
  const { data: impressionRows } = campaignIds.length > 0
    ? await supabase
        .from("impressions")
        .select("campaign_id")
        .in("campaign_id", campaignIds)
    : { data: [] };

  const impressionCountByCampaign: Record<number, number> = {};
  (impressionRows ?? []).forEach((row: any) => {
    impressionCountByCampaign[row.campaign_id] = (impressionCountByCampaign[row.campaign_id] || 0) + 1;
  });

  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Direct Deal Campaigns</h1>
        <p className="mt-1 text-sm text-slate-400">
          Priority-tier campaigns with guaranteed impression delivery. Updated in real time.
        </p>
      </div>

      {allCampaigns.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-12 text-center">
          <p className="text-slate-400">No direct deal campaigns yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            Campaigns with priority_tier &gt; 0 will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700 bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Campaign</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Advertiser</th>
                <th className="px-4 py-3 text-right font-medium text-slate-400">Committed</th>
                <th className="px-4 py-3 text-right font-medium text-slate-400">Delivered</th>
                <th className="px-4 py-3 text-right font-medium text-slate-400">Pct</th>
                <th className="px-4 py-3 text-right font-medium text-slate-400">Days Left</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Pacing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {allCampaigns.map((c: any) => {
                const committed = c.monthly_impression_guarantee ?? 0;
                const delivered = impressionCountByCampaign[c.id] ?? 0;
                const pct = committed > 0 ? Math.round((delivered / committed) * 100) : 0;

                const flightStart = c.flight_start ? new Date(c.flight_start) : null;
                const flightEnd = c.flight_end ? new Date(c.flight_end) : null;
                const totalDays = flightStart && flightEnd
                  ? Math.ceil((flightEnd.getTime() - flightStart.getTime()) / 86400000)
                  : 0;
                const daysElapsed = flightStart
                  ? Math.max(0, Math.ceil((now.getTime() - flightStart.getTime()) / 86400000))
                  : 0;
                const daysRemaining = flightEnd
                  ? Math.max(0, Math.ceil((flightEnd.getTime() - now.getTime()) / 86400000))
                  : null;

                const pacing = pacingStatus(committed, delivered, daysElapsed, totalDays);

                return (
                  <tr key={c.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                    <td className="px-4 py-3 text-slate-300">{c.advertisers?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {committed > 0 ? committed.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-white font-medium">
                      {delivered.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {committed > 0 ? (
                        <span className={pct >= 90 ? "text-green-400" : pct >= 60 ? "text-yellow-400" : "text-slate-400"}>
                          {pct}%
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {daysRemaining !== null ? daysRemaining : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.status === "active"
                          ? "bg-green-500/15 text-green-400"
                          : c.status === "paused"
                          ? "bg-yellow-500/15 text-yellow-400"
                          : "bg-slate-500/15 text-slate-400"
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-medium ${pacing.color}`}>
                      {pacing.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Impression counts reflect all-time delivery for this campaign. For monthly pacing, scope to the current 30-day window in the reporting API.
      </p>
    </div>
  );
}
