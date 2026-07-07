"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function ApproveCreativeButton({
  campaignId,
  creativeId,
}: {
  campaignId: number;
  creativeId: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const approve = () => {
    startTransition(async () => {
      await fetch(
        `/api/admin/campaigns/${campaignId}/creatives/${creativeId}/approve`,
        { method: "POST" }
      );
      router.refresh();
    });
  };

  return (
    <button
      onClick={approve}
      disabled={isPending}
      className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? "Approving…" : "Approve"}
    </button>
  );
}
