"use client";

import { useRouter } from "next/navigation";
import { resolveFraudEvent } from "../actions";

export function FraudActions({ eventId }: { eventId: number }) {
  const router = useRouter();

  return (
    <button
      onClick={async () => {
        await resolveFraudEvent(eventId);
        router.refresh();
      }}
      className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
    >
      Resolve
    </button>
  );
}
