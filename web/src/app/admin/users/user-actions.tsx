"use client";

import { useRouter } from "next/navigation";
import { suspendUser, deleteUser } from "../actions";

export function UserActions({ userId }: { userId: string }) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={async () => {
          if (!confirm("Suspend this user?")) return;
          await suspendUser(userId);
          router.refresh();
        }}
        className="rounded bg-yellow-600 px-3 py-1 text-xs font-medium text-white hover:bg-yellow-700"
      >
        Suspend
      </button>
      <button
        onClick={async () => {
          if (!confirm("Permanently delete this user? This cannot be undone."))
            return;
          await deleteUser(userId);
          router.refresh();
        }}
        className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
      >
        Delete
      </button>
    </div>
  );
}
