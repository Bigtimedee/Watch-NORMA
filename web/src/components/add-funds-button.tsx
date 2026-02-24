"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

const PRESETS = [
  { label: "$50", cents: 5000 },
  { label: "$100", cents: 10000 },
  { label: "$250", cents: 25000 },
  { label: "$500", cents: 50000 },
];

export function AddFundsButton() {
  const [open, setOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDeposit(cents: number) {
    setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/stripe-checkout`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ amount_cents: cents }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create checkout session");
        setLoading(false);
        return;
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  function handleCustomSubmit() {
    const dollars = parseFloat(customAmount);
    if (isNaN(dollars) || dollars < 10) {
      setError("Minimum deposit is $10.00");
      return;
    }
    handleDeposit(Math.round(dollars * 100));
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
      >
        Add Funds
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Add Funds</h2>
              <button
                onClick={() => { setOpen(false); setError(null); }}
                className="text-slate-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <p className="mt-2 text-sm text-slate-400">
              Select an amount to deposit into your ad wallet.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {PRESETS.map((preset) => (
                <button
                  key={preset.cents}
                  onClick={() => handleDeposit(preset.cents)}
                  disabled={loading}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-white hover:border-orange-500 hover:bg-slate-800/80 disabled:opacity-50"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <label className="text-xs font-medium text-slate-400">Custom amount</label>
              <div className="mt-1 flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                  <input
                    type="number"
                    min="10"
                    step="1"
                    placeholder="10.00"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pl-7 pr-3 text-white placeholder:text-slate-600 focus:border-orange-500 focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleCustomSubmit}
                  disabled={loading}
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  {loading ? "..." : "Pay"}
                </button>
              </div>
            </div>

            {error && (
              <p className="mt-3 text-sm text-red-400">{error}</p>
            )}

            <p className="mt-4 text-xs text-slate-500">
              You&apos;ll be redirected to Stripe to complete payment securely.
              Minimum deposit: $10.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
