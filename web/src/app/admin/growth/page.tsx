import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export default async function AdminGrowthPage() {
  await requireAdmin();
  const supabase = createSupabaseAdmin();

  const [{ data: funnel }, { data: cohorts }] = await Promise.all([
    supabase
      .from("daily_activation_funnel")
      .select("*")
      .order("cohort_date", { ascending: false })
      .limit(30),
    supabase
      .from("retention_cohorts")
      .select("*")
      .order("cohort_week", { ascending: false })
      .limit(12),
  ]);

  const funnelRows = (funnel ?? []) as Array<{
    cohort_date: string;
    signups: number;
    added_connection: number;
    followed_team: number;
    received_alert: number;
    watch_tapped: number;
  }>;

  const cohortRows = (cohorts ?? []) as Array<{
    cohort_week: string;
    cohort_size: number;
    retained_d1: number;
    retained_d7: number;
    retained_d30: number;
    d1_pct: number;
    d7_pct: number;
    d30_pct: number;
  }>;

  function pct(num: number, denom: number): string {
    if (!denom) return "—";
    return `${Math.round((num / denom) * 100)}%`;
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-white">Growth</h1>
      <p className="mt-1 text-sm text-slate-400">
        Activation funnel and retention cohorts — trailing 30 days
      </p>

      {/* Activation Funnel */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-white">
          Activation Funnel (by signup day)
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900">
              <tr>
                {[
                  "Signup Date",
                  "Signups",
                  "Added Connection",
                  "→ %",
                  "Followed Team",
                  "→ %",
                  "Received Alert",
                  "→ %",
                  "Watch Tap",
                  "→ %",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {funnelRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-slate-500">
                    No data yet — events will appear after the migration is applied.
                  </td>
                </tr>
              ) : (
                funnelRows.map((row) => (
                  <tr
                    key={row.cohort_date}
                    className="border-t border-slate-800 hover:bg-slate-900/40"
                  >
                    <td className="px-4 py-3 font-mono text-slate-300">
                      {row.cohort_date}
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">{row.signups}</td>
                    <td className="px-4 py-3 text-slate-300">{row.added_connection}</td>
                    <td className="px-4 py-3 text-slate-500">{pct(row.added_connection, row.signups)}</td>
                    <td className="px-4 py-3 text-slate-300">{row.followed_team}</td>
                    <td className="px-4 py-3 text-slate-500">{pct(row.followed_team, row.signups)}</td>
                    <td className="px-4 py-3 text-slate-300">{row.received_alert}</td>
                    <td className="px-4 py-3 text-slate-500">{pct(row.received_alert, row.signups)}</td>
                    <td className="px-4 py-3 text-slate-300">{row.watch_tapped}</td>
                    <td className="px-4 py-3 text-slate-500">{pct(row.watch_tapped, row.signups)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Retention Cohorts */}
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold text-white">
          Retention Cohorts (by signup week)
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          D1 = active 1–2 days after signup. D7 = 6–8 days. D30 = 28–32 days.
          Active = any app event recorded.
        </p>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900">
              <tr>
                {[
                  "Cohort Week",
                  "Users",
                  "D1 Retained",
                  "D1 %",
                  "D7 Retained",
                  "D7 %",
                  "D30 Retained",
                  "D30 %",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohortRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                    No data yet — cohorts appear after users generate app events.
                  </td>
                </tr>
              ) : (
                cohortRows.map((row) => (
                  <tr
                    key={row.cohort_week}
                    className="border-t border-slate-800 hover:bg-slate-900/40"
                  >
                    <td className="px-4 py-3 font-mono text-slate-300">
                      {row.cohort_week}
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">{row.cohort_size}</td>
                    <td className="px-4 py-3 text-slate-300">{row.retained_d1}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-400">{row.d1_pct ?? "—"}%</td>
                    <td className="px-4 py-3 text-slate-300">{row.retained_d7}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-400">{row.d7_pct ?? "—"}%</td>
                    <td className="px-4 py-3 text-slate-300">{row.retained_d30}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-400">{row.d30_pct ?? "—"}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
