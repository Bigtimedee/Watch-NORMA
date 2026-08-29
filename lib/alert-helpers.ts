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
    prediction_resolved: "Prediction Result",
    close_game: "Close Game",
    overtime: "Overtime",
    foul_trouble: "Foul Trouble",
    follow_alert: "Following",
    // Emitted by _shared/alert-scoring.ts for NFL/NCAAF, and by
    // ingest-email-wagers. Previously unmapped, so the badge showed the raw
    // database string (e.g. "football_close_game"). Added 2026-08-20.
    football_close_game: "Close Game",
    football_overtime: "Overtime",
    football_two_minute: "Two-Minute Drill",
    email_wager_import: "Wager Imported",
    // Phase 3 / F3 — football alert types added 2026-08-29
    football_red_zone: "Red Zone Alert",
    football_upset_watch: "Upset Watch",
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
    prediction_resolved: "#10b981", // emerald
    close_game: "#ef4444", // red
    overtime: "#f97316", // orange
    foul_trouble: "#eab308", // yellow
    follow_alert: "#3b82f6", // blue
    football_close_game: "#ef4444", // red — matches close_game
    football_overtime: "#f97316", // orange — matches overtime
    football_two_minute: "#eab308", // yellow
    email_wager_import: "#22c55e", // green
    // Phase 3 / F3
    football_red_zone: "#ef4444", // red — high urgency
    football_upset_watch: "#f97316", // orange — excitement
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
    prediction_resolved: "trophy-outline",
    close_game: "flame-outline",
    overtime: "timer-outline",
    foul_trouble: "warning-outline",
    follow_alert: "heart-outline",
    football_close_game: "flame-outline",
    football_overtime: "timer-outline",
    football_two_minute: "stopwatch-outline",
    email_wager_import: "mail-open-outline",
    // Phase 3 / F3
    football_red_zone: "american-football-outline",
    football_upset_watch: "alert-circle-outline",
  };
  return icons[type] ?? "notifications-outline";
}

/** Whether an alert type indicates the user should tune in NOW */
export function isUrgent(type: AlertType): boolean {
  return type !== "bet_resolved" && type !== "prediction_resolved";
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
/** Format ordinal inning label: 1 -> 1st, 7 -> 7th, 11 -> 11th */
function ordinalInning(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Parse MLB clock string (e.g., "T7" or "B9") into human-readable form */
function formatMLBClock(clock: string | null, period: number | null): string {
  if (!clock) return period ? `Inn ${period}` : "LIVE";
  const match = clock.match(/^([TB])(\d+)$/);
  if (!match) return clock;
  const half = match[1] === "T" ? "Top" : "Bot";
  const inning = parseInt(match[2]);
  return `${half} ${ordinalInning(inning)}`;
}

export function formatClock(game: Game): string {
  if (game.status === "scheduled") {
    return new Date(game.scheduled_at).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (game.status === "halftime") {
    // For MLB, halftime means between half-innings — show the inning context
    if (game.sport === "mlb" && game.clock) {
      return formatMLBClock(game.clock, game.period);
    }
    return "HALF";
  }
  if (game.status === "closed") return "FINAL";
  if (game.status === "cancelled") return "CANCELLED";
  if (game.status === "postponed") return "PPD";

  // MLB: clock is encoded as T/B + inning number
  if (game.sport === "mlb") {
    return formatMLBClock(game.clock, game.period);
  }

  if (!game.period) return game.clock ?? "LIVE";
  const periodLabel = formatPeriodLabel(game.sport, game.period);
  return game.clock ? `${game.clock} ${periodLabel}` : periodLabel;
}

/** Sport-aware period label for basketball halves/quarters, football quarters,
 *  and MLB innings. Exposed so game-detail, cards, and alerts render the same
 *  text for the same game state. */
export function formatPeriodLabel(sport: Game["sport"] | undefined | null, period: number): string {
  // NBA: 4 quarters + OT
  if (sport === "nba") {
    return period > 4
      ? `OT${period - 4 > 1 ? period - 4 : ""}`
      : `Q${period}`;
  }
  // NFL / NCAAF: 4 quarters + OT (NCAAF stacks OT periods 5,6,7…; NFL uses period 5+)
  if (sport === "nfl" || sport === "ncaaf") {
    return period > 4
      ? `OT${period - 4 > 1 ? period - 4 : ""}`
      : `Q${period}`;
  }
  // MLB: caller should route to formatMLBClock; if we get here (e.g. missing
  // clock), fall back to a generic inning label.
  if (sport === "mlb") {
    return `Inn ${period}`;
  }
  // NCAAM (default): 2 halves + OT
  return period > 2 ? `OT${period - 2}` : `H${period}`;
}

/** Sort alerts: unread first, then by date desc */
export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
