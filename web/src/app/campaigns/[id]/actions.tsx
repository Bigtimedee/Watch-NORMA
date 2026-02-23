"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

export function CampaignActions({
  campaignId,
  status,
}: {
  campaignId: number;
  status: string;
}) {
  const router = useRouter();

  const handleAction = async (action: string) => {
    const supabase = createSupabaseBrowser();
    const { data: { session } } = await supabase.auth.getSession();

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/campaign-api`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action, campaign_id: campaignId }),
      }
    );

    if (res.ok) {
      router.refresh();
    }
  };

  return (
    <div className="flex gap-2">
      {status === "draft" && (
        <button
          onClick={() => handleAction("activate")}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
        >
          Submit for Review
        </button>
      )}
      {status === "pending_review" && (
        <span className="rounded-lg bg-yellow-900/30 px-4 py-2 text-sm text-yellow-400">
          Awaiting review
        </span>
      )}
      {status === "active" && (
        <button
          onClick={() => handleAction("pause")}
          className="rounded-lg border border-orange-500 px-4 py-2 text-sm font-semibold text-orange-400 hover:bg-orange-500/10"
        >
          Pause
        </button>
      )}
      {status === "paused" && (
        <button
          onClick={() => handleAction("resume")}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
        >
          Resume
        </button>
      )}
      {(status === "active" || status === "paused" || status === "completed") && (
        <button
          onClick={() => handleAction("archive")}
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800"
        >
          Archive
        </button>
      )}
    </div>
  );
}
