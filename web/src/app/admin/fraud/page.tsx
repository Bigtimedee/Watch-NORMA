import { requireAdmin } from "@/lib/admin";
import { FraudActions } from "./fraud-actions";

export default async function AdminFraudPage() {
  const { supabase } = await requireAdmin();

  const { data: events } = await supabase
    .from("ad_fraud_events")
    .select("*")
    .order("flagged_at", { ascending: false })
    .limit(200);

  const unresolved = (events ?? []).filter((e: any) => !e.resolved);
  const resolved = (events ?? []).filter((e: any) => e.resolved);

  return (
    <>
      <h1 className="text-2xl font-bold text-white">Fraud Monitoring</h1>
      <p className="mt-1 text-sm text-slate-400">
        {unresolved.length} unresolved event{unresolved.length !== 1 ? "s" : ""}
      </p>

      {/* Unresolved Events */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold text-white">Unresolved Events</h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Event Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Campaign ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Flagged
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {unresolved.map((e: any) => (
                <tr key={e.id} className="hover:bg-slate-900/50">
                  <td className="px-6 py-4">
                    <span className="rounded-full bg-red-900/50 px-2 py-0.5 text-xs font-semibold text-red-400">
                      {e.event_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-300">
                    {e.campaign_id ?? "—"}
                  </td>
                  <td className="max-w-xs truncate px-6 py-4 text-sm text-slate-400">
                    {e.details ? JSON.stringify(e.details) : "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {new Date(e.flagged_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <FraudActions eventId={e.id} />
                  </td>
                </tr>
              ))}
              {unresolved.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    No unresolved fraud events.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resolved Events */}
      {resolved.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-white">
            Recently Resolved
          </h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                    Event Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                    Campaign ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                    Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                    Flagged
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {resolved.slice(0, 20).map((e: any) => (
                  <tr key={e.id} className="hover:bg-slate-900/50">
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-400">
                        {e.event_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300">
                      {e.campaign_id ?? "—"}
                    </td>
                    <td className="max-w-xs truncate px-6 py-4 text-sm text-slate-400">
                      {e.details ? JSON.stringify(e.details) : "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {new Date(e.flagged_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
