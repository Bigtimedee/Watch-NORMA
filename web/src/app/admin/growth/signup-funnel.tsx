import { createSupabaseAdmin } from "@/lib/supabase-admin";

type Row = { cohort_week: string; welcome_views: number; signup_completed_events: number; signups: number; activated: number };

/** Spec C: welcome -> signup_completed -> activated, weekly signup cohorts. */
export async function SignupFunnel() {
  const { data } = await createSupabaseAdmin().from("growth_signup_funnel_weekly").select("*");
  const rows = (data ?? []) as Row[];
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "n/a");
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold text-white">Signup Funnel (weekly cohorts)</h2>
      <p className="mb-4 text-xs text-slate-500">Activated = first alert delivered within 7 days of signup.</p>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900">
            <tr>
              {["Week", "Welcome views", "Signup completed", "Signups", "Activated", "Activation rate"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cohort_week} className="border-t border-slate-800">
                <td className="px-4 py-3 font-mono text-slate-300">{r.cohort_week}</td>
                <td className="px-4 py-3 text-slate-300">{r.welcome_views}</td>
                <td className="px-4 py-3 text-slate-300">{r.signup_completed_events}</td>
                <td className="px-4 py-3 text-slate-300">{r.signups}</td>
                <td className="px-4 py-3 text-slate-300">{r.activated}</td>
                <td className="px-4 py-3 text-slate-300">{pct(r.activated, r.signups)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
