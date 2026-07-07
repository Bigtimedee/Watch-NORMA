import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export default async function AdminGrowthPage() {
  await requireAdmin();
  const supabase = createSupabaseAdmin();

  const [{ data: funnel }, { data: cohorts }, { data: latestReports }] = await Promise.all([
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
    supabase
      .from("growth_reports")
      .select("*")
      .order("period_start", { ascending: false })
      .limit(8),
  ]);

  type GrowthReport = {
    id: number;
    period_start: string;
    period_end: string;
    report_json: {
      new_signups: number;
      avg_dau: number;
      alerts_delivered: number;
      watch_taps: number;
      share_events_count: number;
      referral_signups: number;
      intent_moments_total: number;
      fill_rate_pct: number | null;
      avg_clearing_cents: number | null;
      revenue_cents: number;
      active_advertiser_count: number;
    };
    email_status: string;
    created_at: string;
  };

  const reportRows = (latestReports ?? []) as GrowthReport[];

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

      {/* Weekly Growth Reports */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-white">Weekly Growth Reports</h2>
        <p className="mb-4 text-xs text-slate-500">
          Generated every Monday at 8 AM ET by the growth-weekly-report edge function.
        </p>
        {reportRows.length === 0 ? (
          <div className="rounded-xl border border-slate-800 px-6 py-8 text-center text-slate-500">
            No reports yet — the edge function generates the first report on the next Monday at 8 AM ET.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  {[
                    "Period",
                    "Signups",
                    "Avg DAU",
                    "Alerts",
                    "Watch Taps",
                    "Shares",
                    "Referrals",
                    "Moments",
                    "Fill %",
                    "Avg CPM",
                    "Revenue",
                    "Advertisers",
                    "Email",
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
                {reportRows.map((r) => {
                  const m = r.report_json;
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-slate-800 hover:bg-slate-900/40"
                    >
                      <td className="px-4 py-3 font-mono text-slate-300">
                        {r.period_start}<span className="text-slate-600"> → </span>{r.period_end}
                      </td>
                      <td className="px-4 py-3 text-white">{m.new_signups.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-300">{m.avg_dau.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-300">{m.alerts_delivered.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-300">{m.watch_taps.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-300">{m.share_events_count.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-300">{m.referral_signups.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-300">{m.intent_moments_total.toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-300">
                        {m.fill_rate_pct != null ? `${m.fill_rate_pct}%` : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {m.avg_clearing_cents != null
                          ? `$${(m.avg_clearing_cents / 100).toFixed(2)}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 font-semibold text-emerald-400">
                        ${(m.revenue_cents / 100).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{m.active_advertiser_count}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            r.email_status === "sent"
                              ? "bg-green-900/50 text-green-400"
                              : r.email_status === "failed"
                                ? "bg-red-900/50 text-red-400"
                                : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {r.email_status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
