"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CampaignApprovalStatus } from "@/lib/types";

export function CampaignActions({
  campaignId,
  approvalStatus,
}: {
  campaignId: number;
  approvalStatus: CampaignApprovalStatus;
}) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const approve = () => {
    startTransition(async () => {
      await fetch(`/api/admin/campaigns/${campaignId}/approve`, {
        method: "POST",
      });
      router.refresh();
    });
  };

  const reject = () => {
    startTransition(async () => {
      await fetch(`/api/admin/campaigns/${campaignId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      setRejecting(false);
      setNote("");
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={approve}
          disabled={isPending || approvalStatus === "approved"}
          className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => setRejecting(true)}
          disabled={isPending}
          className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reject
        </button>
      </div>

      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-950 p-6">
            <h2 className="text-lg font-semibold text-white">Reject Campaign</h2>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={4}
              className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-orange-500"
              placeholder="Reason for rejection"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setRejecting(false)}
                className="rounded bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={reject}
                disabled={isPending || note.trim().length === 0}
                className="rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
