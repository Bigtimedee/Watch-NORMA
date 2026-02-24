"use client";

import { useRouter } from "next/navigation";
import { suspendAdvertiser, deleteAdvertiser } from "../actions";

export function AdvertiserActions({
  advertiserId,
}: {
  advertiserId: number;
}) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={async () => {
          if (!confirm("Suspend this advertiser and pause all campaigns?"))
            return;
          await suspendAdvertiser(advertiserId);
          router.refresh();
        }}
        className="rounded bg-yellow-600 px-3 py-1 text-xs font-medium text-white hover:bg-yellow-700"
      >
        Suspend
      </button>
      <button
        onClick={async () => {
          if (
            !confirm(
              "Permanently delete this advertiser? This cannot be undone."
            )
          )
            return;
          await deleteAdvertiser(advertiserId);
          router.refresh();
        }}
        className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
      >
        Delete
      </button>
    </div>
  );
}
