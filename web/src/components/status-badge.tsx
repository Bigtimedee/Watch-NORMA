import { cn } from "@/lib/utils";
import type { CampaignStatus } from "@/lib/types";

const STATUS_STYLES: Record<CampaignStatus, string> = {
  draft: "bg-slate-700 text-slate-300",
  pending_review: "bg-yellow-900/50 text-yellow-400",
  active: "bg-green-900/50 text-green-400",
  paused: "bg-orange-900/50 text-orange-400",
  completed: "bg-blue-900/50 text-blue-400",
  archived: "bg-slate-800 text-slate-500",
};

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};

export function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        STATUS_STYLES[status] ?? "bg-slate-700 text-slate-300"
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
