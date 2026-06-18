import { requireAdmin } from "@/lib/admin";
import Link from "next/link";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://getnorma.app";

export default async function AdminPartnersPage() {
  const { supabase } = await requireAdmin();

  const { data: partnerCodes } = await supabase
    .from("partner_referral_codes")
    .select("partner_key, code, clicks, created_at")
    .order("clicks", { ascending: false });

  const codes = partnerCodes ?? [];

  // Fetch referrals count per code (attributed app signups)
  const { data: referralRows } = await supabase
    .from("referral_codes")
    .select("code, uses");

  const usesByCode: Record<string, number> = {};
  (referralRows ?? []).forEach((r: any) => {
    usesByCode[r.code] = r.uses ?? 0;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Partner Co-Marketing</h1>
          <p className="mt-1 text-sm text-slate-400">
            Referral codes and landing page performance for sportsbook acquisition partners.
          </p>
        </div>
      </div>

      {codes.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-12 text-center">
          <p className="text-slate-400">No partner codes found. Run migration 086 to seed initial partners.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700 bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Partner</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Referral Code</th>
                <th className="px-4 py-3 text-right font-medium text-slate-400">Page Clicks</th>
                <th className="px-4 py-3 text-right font-medium text-slate-400">App Signups</th>
                <th className="px-4 py-3 text-right font-medium text-slate-400">Conv. Rate</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Landing Page</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {codes.map((c: any) => {
                const signups = usesByCode[c.code] ?? 0;
                const convRate = c.clicks > 0 ? Math.round((signups / c.clicks) * 100) : 0;
                const landingPageUrl = `${BASE_URL}/partners/${c.partner_key}`;

                return (
                  <tr key={c.partner_key} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-medium capitalize text-white">
                      {c.partner_key.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-slate-800 px-2 py-0.5 text-xs text-orange-400">
                        {c.code}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {c.clicks.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-white font-medium">
                      {signups.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={convRate >= 10 ? "text-green-400" : convRate >= 3 ? "text-yellow-400" : "text-slate-400"}>
                        {c.clicks > 0 ? `${convRate}%` : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/partners/${c.partner_key}`}
                        target="_blank"
                        className="text-xs text-orange-400 hover:text-orange-300 underline"
                      >
                        {landingPageUrl}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-5 text-sm text-slate-400 space-y-2">
        <p className="font-medium text-slate-300">How to use co-marketing landing pages</p>
        <p>Send each partner their landing page URL. The partner embeds it in their bet confirmation emails or app notifications as a "Track your bets smarter" CTA. Downloads from that page are attributed to the partner via the embedded referral code.</p>
        <p>
          See{" "}
          <Link href="/admin/users" className="text-orange-400 hover:text-orange-300 underline">
            user signups
          </Link>{" "}
          for full attribution detail, or view{" "}
          <Link
            href="https://docs.norma.internal/partnerships/co-marketing-landing-page"
            className="text-orange-400 hover:text-orange-300 underline"
          >
            the partnership brief
          </Link>{" "}
          for the full briefing template to send partners.
        </p>
      </div>
    </div>
  );
}
