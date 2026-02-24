"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Nav } from "@/components/nav";
import { KpiCard } from "@/components/kpi-card";
import { AddFundsButton } from "@/components/add-funds-button";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { formatCents, formatNumber } from "@/lib/utils";
import type { AdvertiserTransaction } from "@/lib/types";

interface SpendEntry {
  campaign_name: string;
  total_spent_cents: number;
  total_impressions: number;
}

export default function BillingPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen"><Nav /><main className="mx-auto max-w-5xl px-6 py-8"><p className="text-slate-400">Loading...</p></main></div>}>
      <BillingPage />
    </Suspense>
  );
}

function BillingPage() {
  const searchParams = useSearchParams();
  const [campaigns, setCampaigns] = useState<SpendEntry[]>([]);
  const [transactions, setTransactions] = useState<AdvertiserTransaction[]>([]);
  const [balanceCents, setBalanceCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const deposit = searchParams.get("deposit");
    if (deposit === "success") {
      setToast("Deposit successful! Your balance will update shortly.");
    } else if (deposit === "cancelled") {
      setToast("Deposit cancelled.");
    }

    if (deposit) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: advertiser } = await supabase
      .from("advertisers")
      .select("id, balance_cents")
      .eq("auth_user_id", user.id)
      .single();

    if (!advertiser) return;

    setBalanceCents(advertiser.balance_cents ?? 0);

    // Fetch spend by campaign
    const { data: spendData } = await supabase
      .from("advertiser_reporting")
      .select("campaign_name, total_spent_cents, total_impressions")
      .eq("advertiser_id", advertiser.id);

    setCampaigns((spendData as SpendEntry[]) ?? []);

    // Fetch transaction history
    const { data: txnData } = await supabase
      .from("advertiser_transactions")
      .select("*")
      .eq("advertiser_id", advertiser.id)
      .order("created_at", { ascending: false })
      .limit(50);

    setTransactions((txnData as AdvertiserTransaction[]) ?? []);
    setLoading(false);
  }

  const totalSpent = campaigns.reduce((s, c) => s + c.total_spent_cents, 0);
  const totalImpressions = campaigns.reduce((s, c) => s + c.total_impressions, 0);

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        {toast && (
          <div className={`mb-6 rounded-lg px-4 py-3 text-sm ${
            toast.includes("success") ? "bg-green-900/40 text-green-300" : "bg-yellow-900/40 text-yellow-300"
          }`}>
            {toast}
          </div>
        )}

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Billing</h1>
          <AddFundsButton />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard title="Wallet Balance" value={formatCents(balanceCents)} />
          <KpiCard title="Total Spend" value={formatCents(totalSpent)} />
          <KpiCard title="Total Impressions" value={formatNumber(totalImpressions)} />
        </div>

        {/* Transaction History */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-white">Transaction History</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">Description</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">Amount</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {transactions.map((txn) => (
                  <tr key={txn.id} className="hover:bg-slate-900/50">
                    <td className="px-6 py-4 text-sm text-slate-300">
                      {new Date(txn.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                        txn.type === "deposit"
                          ? "bg-green-900/40 text-green-400"
                          : txn.type === "refund"
                          ? "bg-blue-900/40 text-blue-400"
                          : txn.type === "campaign_spend"
                          ? "bg-slate-800 text-slate-300"
                          : "bg-yellow-900/40 text-yellow-400"
                      }`}>
                        {txn.type.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300">{txn.description}</td>
                    <td className={`px-6 py-4 text-right text-sm font-medium ${
                      txn.amount_cents >= 0 ? "text-green-400" : "text-slate-300"
                    }`}>
                      {txn.amount_cents >= 0 ? "+" : ""}{formatCents(txn.amount_cents)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-slate-400">
                      {formatCents(txn.balance_after_cents)}
                    </td>
                  </tr>
                ))}
                {!loading && transactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No transactions yet. Add funds to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Spend by Campaign */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-white">Spend by Campaign</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">Campaign</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">Impressions</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">Spent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {campaigns.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-900/50">
                    <td className="px-6 py-4 text-white">{c.campaign_name}</td>
                    <td className="px-6 py-4 text-right text-slate-300">{formatNumber(c.total_impressions)}</td>
                    <td className="px-6 py-4 text-right text-slate-300">{formatCents(c.total_spent_cents)}</td>
                  </tr>
                ))}
                {!loading && campaigns.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-slate-500">No billing data yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-sm font-semibold text-slate-400">Billing Model</h3>
          <p className="mt-2 text-sm text-slate-300">
            NORMA uses a pre-pay wallet with a second-price auction model. Deposit funds into your wallet,
            then activate campaigns. You only pay the minimum amount needed to win each impression,
            which is the second-highest bid plus one cent (or the floor price, whichever is higher).
          </p>
        </div>
      </main>
    </div>
  );
}
