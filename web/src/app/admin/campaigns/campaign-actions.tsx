"use client";

import { useRouter } from "next/navigation";
import { updateCampaignStatus } from "../actions";
import type { CampaignStatus } from "@/lib/types";

export function CampaignActions({
  campaignId,
  status,
}: {
  campaignId: number;
  status: CampaignStatus;
}) {
  const router = useRouter();

  const handleAction = async (
    newStatus: "active" | "paused" | "archived"
  ) => {
    await updateCampaignStatus(campaignId, newStatus);
    router.refresh();
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {status === "pending_review" && (
        <button
          onClick={() => handleAction("active")}
          className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
        >
          Approve
        </button>
      )}
      {status === "active" && (
        <button
          onClick={() => handleAction("paused")}
          className="rounded bg-yellow-600 px-3 py-1 text-xs font-medium text-white hover:bg-yellow-700"
        >
          Pause
        </button>
      )}
      {status === "paused" && (
        <button
          onClick={() => handleAction("active")}
          className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
        >
          Resume
        </button>
      )}
      {(status === "paused" || status === "completed") && (
        <button
          onClick={() => handleAction("archived")}
          className="rounded bg-slate-600 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
        >
          Archive
        </button>
      )}
    </div>
  );
}
