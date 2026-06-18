import { requireAdmin } from "@/lib/admin";

// Estimated average commission rates per provider ($ per subscription confirmed)
const COMMISSION_RATES: Record<string, number> = {
  espn_plus: 8.0,
  prime_video: 5.0,
};

export default async function AffiliatesPage() {
  const { supabase } = await requireAdmin();

  // Affiliate events by provider
  const { data: events } = await supabase
    .from("streaming_affiliate_events")
    .select("provider_key, event_type, affiliate_tag, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);

  const allEvents = events ?? [];

  // Aggregate by provider
  const byProvider: Record<string, { taps: number; confirmed: number; tag: string | null }> = {};
  allEvents.forEach((e: any) => {
    if (!byProvider[e.provider_key]) {
      byProvider[e.provider_key] = { taps: 0, confirmed: 0, tag: e.affiliate_tag };
    }
    if (e.event_type === "tap") byProvider[e.provider_key].taps++;
    if (e.event_type === "subscription_confirmed") byProvider[e.provider_key].confirmed++;
  });

  // Providers with affiliate programs from provider_registry
  const { data: providers } = await supabase
    .from("streaming_providers")
    .select("key, name, affiliate_tag")
    .not("affiliate_tag", "is", null);

  const affiliateProviders = providers ?? [];

  const totalEstimatedRevenue = Object.entries(byProvider).reduce((sum, [key, data]) => {
    return sum + data.confirmed * (COMMISSION_RATES[key] ?? 0);
  }, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Affiliate Revenue</h1>
        <p className="mt-1 text-sm text-slate-400">
          Streaming deep link taps and estimated subscription commissions.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Total Taps</p>
          <p className="mt-2 text-3xl font-bold text-white">
            {allEvents.filter((e: any) => e.event_type === "tap").length.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Confirmed Subs</p>
          <p className="mt-2 text-3xl font-bold text-white">
            {allEvents.filter((e: any) => e.event_type === "subscription_confirmed").length.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate-500">Requires S2S callback integration</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Est. Commissions</p>
          <p className="mt-2 text-3xl font-bold text-green-400">
            ${totalEstimatedRevenue.toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Based on avg rates × confirmed subs</p>
        </div>
      </div>

      {/* Per-provider breakdown */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-white">By Provider</h2>
        <div className="overflow-hidden rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700 bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Provider</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Affiliate Tag</th>
                <th className="px-4 py-3 text-right font-medium text-slate-400">Taps</th>
                <th className="px-4 py-3 text-right font-medium text-slate-400">Confirmed</th>
                <th className="px-4 py-3 text-right font-medium text-slate-400">Avg Rate</th>
                <th className="px-4 py-3 text-right font-medium text-slate-400">Est. Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {affiliateProviders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No affiliate programs configured. Run migration 087 to add affiliate tags.
                  </td>
                </tr>
              ) : (
                affiliateProviders.map((p: any) => {
                  const data = byProvider[p.key] ?? { taps: 0, confirmed: 0, tag: p.affiliate_tag };
                  const rate = COMMISSION_RATES[p.key] ?? 0;
                  const estRevenue = data.confirmed * rate;
                  return (
                    <tr key={p.key} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-medium text-white">{p.name}</td>
                      <td className="px-4 py-3">
                        <code className="rounded bg-slate-800 px-2 py-0.5 text-xs text-orange-400">
                          {p.affiliate_tag}
                        </code>
                        {p.affiliate_tag?.includes("PLACEHOLDER") || p.affiliate_tag?.includes("TAG") ? (
                          <span className="ml-2 text-xs text-yellow-500">Replace with real tag</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">{data.taps.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-white font-medium">{data.confirmed.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-slate-400">
                        {rate > 0 ? `$${rate.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-green-400">
                        {estRevenue > 0 ? `$${estRevenue.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent events */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-white">Recent Events</h2>
        <div className="overflow-hidden rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700 bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Time</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Provider</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Event</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Tag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {allEvents.slice(0, 50).map((e: any, i: number) => (
                <tr key={i} className="hover:bg-slate-800/30">
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-slate-300">{e.provider_key}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      e.event_type === "subscription_confirmed"
                        ? "bg-green-500/15 text-green-400"
                        : "bg-slate-500/15 text-slate-400"
                    }`}>
                      {e.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">{e.affiliate_tag ?? "—"}</td>
                </tr>
              ))}
              {allEvents.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    No affiliate events yet. Events are recorded when users tap Watch Now on a provider with an affiliate_tag.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
