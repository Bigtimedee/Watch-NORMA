import type { Alert, AlertType, Game } from "./types";

/** Human-readable label for an alert type */
export function alertTypeLabel(type: AlertType): string {
  const labels: Record<AlertType, string> = {
    spread_alert: "Spread",
    total_alert: "Over/Under",
    moneyline_alert: "Moneyline",
    prop_alert: "Prop Bet",
    position_alert: "Position",
    bet_resolved: "Result",
  };
  return labels[type] ?? type;
}

/** Accent color for alert type badges */
export function alertTypeColor(type: AlertType): string {
  const colors: Record<AlertType, string> = {
    spread_alert: "#f97316", // orange
    total_alert: "#eab308", // yellow
    moneyline_alert: "#ef4444", // red
    prop_alert: "#3b82f6", // blue
    position_alert: "#a855f7", // purple
    bet_resolved: "#22c55e", // green
  };
  return colors[type] ?? "#94a3b8";
}

/** Icon name (Ionicons) for alert type */
export function alertTypeIcon(type: AlertType): string {
  const icons: Record<AlertType, string> = {
    spread_alert: "trending-up-outline",
    total_alert: "analytics-outline",
    moneyline_alert: "flame-outline",
    prop_alert: "person-outline",
    position_alert: "cash-outline",
    bet_resolved: "checkmark-circle-outline",
  };
  return icons[type] ?? "notifications-outline";
}

/** Whether an alert type indicates the user should tune in NOW */
export function isUrgent(type: AlertType): boolean {
  return type !== "bet_resolved";
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
