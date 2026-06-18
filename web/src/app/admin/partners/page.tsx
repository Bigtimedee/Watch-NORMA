import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { createPartner } from "./actions";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://getnorma.app";

// ─── Badge helpers ─────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    sportsbook:        "bg-blue-900/60 text-blue-300 border-blue-700",
    streaming:         "bg-purple-900/60 text-purple-300 border-purple-700",
    prediction_market: "bg-orange-900/60 text-orange-300 border-orange-700",
    media:             "bg-pink-900/60 text-pink-300 border-pink-700",
    fantasy:           "bg-teal-900/60 text-teal-300 border-teal-700",
    tech:              "bg-slate-800 text-slate-300 border-slate-600",
  };
  const label = tier.replace(/_/g, " ");
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium capitalize ${
        styles[tier] ?? styles.tech
      }`}
    >
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active:      "bg-green-900/60 text-green-300 border-green-700",
    negotiating: "bg-yellow-900/60 text-yellow-300 border-yellow-700",
    prospect:    "bg-slate-800 text-slate-400 border-slate-600",
    churned:     "bg-red-900/60 text-red-300 border-red-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium capitalize ${
        styles[status] ?? styles.prospect
      }`}
    >
      {status}
    </span>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminPartnersPage() {
  const { supabase } = await requireAdmin();

  // All partners from the CRM table
  const { data: partnersData } = await supabase
    .from("partners")
    .select("*")
    .order("name");

  const partners = partnersData ?? [];

  // Referral attribution keyed by code
  const { data: refCodes } = await supabase
    .from("partner_referral_codes")
    .select("code, partner_key, clicks");

  const clicksByCode: Record<string, number> = {};
  const partnerKeyByCode: Record<string, string> = {};
  (refCodes ?? []).forEach((r: any) => {
    clicksByCode[r.code] = r.clicks ?? 0;
    partnerKeyByCode[r.code] = r.partner_key;
  });

  // Signups (uses) per referral code
  const { data: referralRows } = await supabase
    .from("referral_codes")
    .select("code, uses");

  const usesByCode: Record<string, number> = {};
  (referralRows ?? []).forEach((r: any) => {
    usesByCode[r.code] = r.uses ?? 0;
  });

  // Campaign stats per advertiser name (best-effort join by name match)
  const { data: campaignRows } = await supabase
    .from("campaigns")
    .select("status, spent_cents, advertiser_id, advertisers(name)")
    .not("status", "eq", "archived");

  const campaignStatsByName: Record<string, { active: number; spentCents: number }> = {};
  (campaignRows ?? []).forEach((c: any) => {
    const advName: string = c.advertisers?.name ?? "";
    if (!advName) return;
    const key = advName.toLowerCase();
    if (!campaignStatsByName[key]) campaignStatsByName[key] = { active: 0, spentCents: 0 };
    if (c.status === "active") campaignStatsByName[key].active += 1;
    campaignStatsByName[key].spentCents += c.spent_cents ?? 0;
  });

  function getCampaignStats(partnerName: string) {
    const key = partnerName.toLowerCase();
    if (campaignStatsByName[key]) return campaignStatsByName[key];
    const prefixMatch = Object.keys(campaignStatsByName).find((k) =>
      k.startsWith(key.slice(0, 5))
    );
    return prefixMatch ? campaignStatsByName[prefixMatch] : null;
  }

  const statusOrder = ["active", "negotiating", "prospect", "churned"] as const;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Partner Management</h1>
          <p className="mt-1 text-sm text-slate-400">
            BD pipeline, referral attribution, and campaign performance for all NORMA partners.
          </p>
        </div>
        <a
          href="#create-partner"
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-400"
        >
          + Add Partner
        </a>
      </div>

      {/* Summary stats */}
      {partners.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {statusOrder.map((status) => {
            const count = partners.filter(
              (p: any) => p.partnership_status === status
            ).length;
            const labelColor: Record<string, string> = {
              active:      "text-green-400",
              negotiating: "text-yellow-400",
              prospect:    "text-slate-400",
              churned:     "text-red-400",
            };
            return (
              <div
                key={status}
                className="rounded-xl border border-slate-700 bg-slate-800/50 p-4"
              >
                <p className={`text-2xl font-bold ${labelColor[status]}`}>{count}</p>
                <p className="mt-0.5 text-xs capitalize text-slate-400">{status}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Partners table */}
      {partners.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-12 text-center">
          <p className="text-slate-400">
            No partners yet. Run migration 089 to seed initial partners, or add one below.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700 bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Partner</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Tier</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Referral Code</th>
                <th className="px-4 py-3 text-right font-medium text-slate-400">Clicks</th>
                <th className="px-4 py-3 text-right font-medium text-slate-400">Signups</th>
                <th className="px-4 py-3 text-right font-medium text-slate-400">Active Campaigns</th>
                <th className="px-4 py-3 text-right font-medium text-slate-400">Total Spend</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">BD Contact</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {partners.map((p: any) => {
                const clicks =
                  p.referral_code != null ? (clicksByCode[p.referral_code] ?? 0) : null;
                const signups =
                  p.referral_code != null ? (usesByCode[p.referral_code] ?? 0) : null;
                const partnerKey =
                  p.referral_code != null ? partnerKeyByCode[p.referral_code] : null;
                const campaigns = getCampaignStats(p.name);
                const notes = p.notes as string | null;
                const noteSnippet =
                  notes && notes.length > 100 ? notes.slice(0, 100) + "…" : notes;

                return (
                  <tr key={p.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-semibold text-white">{p.name}</td>
                    <td className="px-4 py-3">
                      <TierBadge tier={p.tier} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.partnership_status} />
                    </td>
                    <td className="px-4 py-3">
                      {p.referral_code ? (
                        <div className="flex flex-col gap-0.5">
                          <code className="rounded bg-slate-800 px-2 py-0.5 text-xs text-orange-400">
                            {p.referral_code}
                          </code>
                          {partnerKey && (
                            <Link
                              href={`/partners/${partnerKey}`}
                              target="_blank"
                              className="text-xs text-slate-500 hover:text-orange-400 underline"
                            >
                              {BASE_URL}/partners/{partnerKey}
                            </Link>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {clicks !== null ? (
                        clicks.toLocaleString()
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-white">
                      {signups !== null ? (
                        signups.toLocaleString()
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {campaigns ? (
                        <span
                          className={
                            campaigns.active > 0
                              ? "font-medium text-green-400"
                              : "text-slate-400"
                          }
                        >
                          {campaigns.active}
                        </span>
                      ) : (
                        <span className="text-slate-600">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {campaigns && campaigns.spentCents > 0 ? (
                        `$${(campaigns.spentCents / 100).toLocaleString("en-US", {
                          maximumFractionDigits: 0,
                        })}`
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.bd_contact_name ? (
                        <div className="flex flex-col">
                          <span className="text-slate-200">{p.bd_contact_name}</span>
                          {p.bd_contact_email && (
                            <a
                              href={`mailto:${p.bd_contact_email}`}
                              className="text-xs text-slate-500 hover:text-orange-400"
                            >
                              {p.bd_contact_email}
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      {noteSnippet ? (
                        <span
                          className="text-xs text-slate-400"
                          title={notes ?? undefined}
                        >
                          {noteSnippet}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legacy referral codes view */}
      {(refCodes ?? []).length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-white">
            Co-Marketing Referral Codes
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            All codes from{" "}
            <code className="text-slate-400">partner_referral_codes</code>. Codes
            linked to a partner row above are already reflected in the main table.
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-700 bg-slate-800/60">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-400">
                    Partner Key
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-slate-400">Code</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-400">
                    Clicks
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-slate-400">
                    App Signups
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-slate-400">
                    Conv. Rate
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-slate-400">
                    Landing Page
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {(refCodes ?? []).map((c: any) => {
                  const signups = usesByCode[c.code] ?? 0;
                  const convRate =
                    c.clicks > 0 ? Math.round((signups / c.clicks) * 100) : 0;
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
                      <td className="px-4 py-3 text-right font-medium text-white">
                        {signups.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={
                            convRate >= 10
                              ? "text-green-400"
                              : convRate >= 3
                              ? "text-yellow-400"
                              : "text-slate-400"
                          }
                        >
                          {c.clicks > 0 ? `${convRate}%` : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/partners/${c.partner_key}`}
                          target="_blank"
                          className="text-xs text-orange-400 hover:text-orange-300 underline"
                        >
                          {BASE_URL}/partners/{c.partner_key}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Partner form */}
      <div id="create-partner" className="rounded-xl border border-slate-700 bg-slate-900/60 p-6">
        <h2 className="mb-4 text-base font-semibold text-white">Add New Partner</h2>
        <form
          action={createPartner}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {/* Name */}
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-xs font-medium text-slate-400">
              Partner Name <span className="text-red-400">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="e.g. BetMGM"
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-orange-500 focus:outline-none"
            />
          </div>

          {/* Tier */}
          <div className="flex flex-col gap-1">
            <label htmlFor="tier" className="text-xs font-medium text-slate-400">
              Tier <span className="text-red-400">*</span>
            </label>
            <select
              id="tier"
              name="tier"
              required
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
            >
              <option value="">Select tier…</option>
              <option value="sportsbook">Sportsbook</option>
              <option value="streaming">Streaming</option>
              <option value="prediction_market">Prediction Market</option>
              <option value="media">Media</option>
              <option value="fantasy">Fantasy</option>
              <option value="tech">Tech</option>
            </select>
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1">
            <label htmlFor="partnership_status" className="text-xs font-medium text-slate-400">
              Status
            </label>
            <select
              id="partnership_status"
              name="partnership_status"
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
            >
              <option value="prospect">Prospect</option>
              <option value="negotiating">Negotiating</option>
              <option value="active">Active</option>
              <option value="churned">Churned</option>
            </select>
          </div>

          {/* Referral code */}
          <div className="flex flex-col gap-1">
            <label htmlFor="referral_code" className="text-xs font-medium text-slate-400">
              Referral Code
            </label>
            <input
              id="referral_code"
              name="referral_code"
              type="text"
              placeholder="e.g. betmgm2026"
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-orange-500 focus:outline-none"
            />
          </div>

          {/* BD contact name */}
          <div className="flex flex-col gap-1">
            <label htmlFor="bd_contact_name" className="text-xs font-medium text-slate-400">
              BD Contact Name
            </label>
            <input
              id="bd_contact_name"
              name="bd_contact_name"
              type="text"
              placeholder="e.g. Jane Smith"
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-orange-500 focus:outline-none"
            />
          </div>

          {/* BD contact email */}
          <div className="flex flex-col gap-1">
            <label htmlFor="bd_contact_email" className="text-xs font-medium text-slate-400">
              BD Contact Email
            </label>
            <input
              id="bd_contact_email"
              name="bd_contact_email"
              type="email"
              placeholder="jane@partner.com"
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-orange-500 focus:outline-none"
            />
          </div>

          {/* Notes — full width */}
          <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
            <label htmlFor="notes" className="text-xs font-medium text-slate-400">
              BD Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Conversation history, next steps, context…"
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-orange-500 focus:outline-none"
            />
          </div>

          {/* Submit */}
          <div className="sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              className="rounded-lg bg-orange-500 px-6 py-2 text-sm font-medium text-white hover:bg-orange-400 focus:outline-none"
            >
              Create Partner
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
