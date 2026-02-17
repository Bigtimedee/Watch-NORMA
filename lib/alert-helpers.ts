import type { Alert, AlertType, Game } from "./types";

/** Human-readable label for an alert type */
export function alertTypeLabel(type: AlertType): string {
  const labels: Record<AlertType, string> = {
    game_start: "Tip Off",
    close_game: "Close Game",
    overtime: "Overtime",
    big_run: "Big Run",
    halftime: "Halftime",
    game_end: "Final",
    momentum_shift: "Momentum Shift",
    foul_trouble: "Foul Trouble",
  };
  return labels[type] ?? type;
}

/** Accent color for alert type badges */
export function alertTypeColor(type: AlertType): string {
  const colors: Record<AlertType, string> = {
    game_start: "#22c55e", // green
    close_game: "#ef4444", // red
    overtime: "#f97316", // orange
    big_run: "#eab308", // yellow
    halftime: "#6366f1", // indigo
    game_end: "#8b5cf6", // violet
    momentum_shift: "#f59e0b", // amber
    foul_trouble: "#ec4899", // pink
  };
  return colors[type] ?? "#94a3b8";
}

/** Icon name (Ionicons) for alert type */
export function alertTypeIcon(type: AlertType): string {
  const icons: Record<AlertType, string> = {
    game_start: "play-circle-outline",
    close_game: "flame-outline",
    overtime: "timer-outline",
    big_run: "trending-up-outline",
    halftime: "pause-circle-outline",
    game_end: "checkmark-circle-outline",
    momentum_shift: "swap-horizontal-outline",
    foul_trouble: "warning-outline",
  };
  return icons[type] ?? "notifications-outline";
}

/** Format time-ago string */
export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Format game clock display */
export function formatClock(game: Game): string {
  if (game.status === "scheduled") {
    return new Date(game.scheduled_at).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (game.status === "halftime") return "HALF";
  if (game.status === "closed") return "FINAL";
  if (game.status === "cancelled") return "CANCELLED";
  if (game.status === "postponed") return "PPD";

  const periodLabel =
    game.period && game.period > 2 ? `OT${game.period - 2}` : `H${game.period}`;
  return game.clock ? `${game.clock} ${periodLabel}` : periodLabel;
}

/** Sort alerts: unread first, then by date desc */
export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
