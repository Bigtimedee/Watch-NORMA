"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateAdvertiser, adjustBalance } from "../../actions";
import { formatCents } from "@/lib/utils";
import type { Advertiser } from "@/lib/types";

export function AdvertiserDetailActions({
  advertiser,
}: {
  advertiser: Advertiser;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(advertiser.name);
  const [category, setCategory] = useState(advertiser.category ?? "");
  const [billingModel, setBillingModel] = useState(advertiser.billing_model);

  const [adjusting, setAdjusting] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustDesc, setAdjustDesc] = useState("");

  const handleSave = async () => {
    await updateAdvertiser(advertiser.id, {
      name,
      category: category || undefined,
      billing_model: billingModel,
    });
    setEditing(false);
    router.refresh();
  };

  const handleAdjust = async () => {
    const cents = Math.round(parseFloat(adjustAmount) * 100);
    if (isNaN(cents) || cents === 0) return;
    await adjustBalance(advertiser.id, cents, adjustDesc || "Admin adjustment");
    setAdjusting(false);
    setAdjustAmount("");
    setAdjustDesc("");
    router.refresh();
  };

  return (
    <div className="mt-6 flex flex-wrap gap-4">
      {/* Info card */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-400">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">Category</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">Billing Model</label>
              <input
                value={billingModel}
                onChange={(e) => setBillingModel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-slate-400">Category:</span>{" "}
                <span className="text-white">{advertiser.category || "—"}</span>
              </p>
              <p>
                <span className="text-slate-400">Model:</span>{" "}
                <span className="text-white">{advertiser.billing_model === 'cpm' ? 'Cost per Moment' : advertiser.billing_model}</span>
              </p>
              <p>
                <span className="text-slate-400">Balance:</span>{" "}
                <span className="text-white font-medium">
                  {formatCents(advertiser.balance_cents)}
                </span>
              </p>
            </div>
            <button
              onClick={() => setEditing(true)}
              className="mt-4 rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
            >
              Edit
            </button>
          </div>
        )}
      </div>

      {/* Balance adjustment */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        {adjusting ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-400">
                Amount (positive to credit, negative to debit)
              </label>
              <input
                type="number"
                step="0.01"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="e.g. 50.00 or -25.00"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400">
                Description
              </label>
              <input
                value={adjustDesc}
                onChange={(e) => setAdjustDesc(e.target.value)}
                placeholder="Reason for adjustment"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAdjust}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
              >
                Apply
              </button>
              <button
                onClick={() => setAdjusting(false)}
                className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-400">Balance Adjustment</p>
            <p className="mt-1 text-sm text-slate-500">
              Credit or debit the advertiser&apos;s wallet balance
            </p>
            <button
              onClick={() => setAdjusting(true)}
              className="mt-4 rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
            >
              Adjust Balance
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
