import { createSupabaseAdmin } from "@/lib/supabase-admin";

/** Spec B: K = invites sent per user x invite->signup conversion (trailing 30 days). */
export async function KFactorTile() {
  const admin = createSupabaseAdmin();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [shares, sharers, opens, signups] = await Promise.all([
    admin.from("app_events").select("id", { count: "exact", head: true }).eq("event_name", "referral_share_tapped").gte("created_at", since),
    admin.from("app_events").select("user_id").eq("event_name", "referral_share_tapped").gte("created_at", since).limit(10000),
    admin.from("web_events").select("id", { count: "exact", head: true }).eq("event_name", "referral_link_open").gte("created_at", since),
    admin.from("referrals").select("id", { count: "exact", head: true }).gte("created_at", since),
  ]);
  const distinctSharers = new Set((sharers.data ?? []).map((r: { user_id: string }) => r.user_id)).size;
  const { data: dau } = await admin.rpc("count_distinct_app_users_since", { p_since: since });
  const users = typeof dau === "number" ? dau : null;
  const invites = shares.count ?? 0;
  const conv = (opens.count ?? 0) > 0 ? (signups.count ?? 0) / (opens.count ?? 1) : null;
  const perUser = users && users > 0 ? invites / users : null;
  const k = perUser != null && conv != null ? perUser * conv : null;
  const stat = (label: string, v: string) => (
    <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-semibold text-white">{v}</div>
    </div>
  );
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold text-white">Referral K-factor (30 days)</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stat("K-factor", k == null ? "n/a" : k.toFixed(3))}
        {stat("Invites sent", String(invites))}
        {stat("Sharers", String(distinctSharers))}
        {stat("Link opens", String(opens.count ?? 0))}
        {stat("Referred signups", String(signups.count ?? 0))}
      </div>
    </section>
  );
}
