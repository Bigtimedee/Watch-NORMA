import Link from "next/link";
import { type GameWithTeams, gamePath, fmtTime, broadcastTokens, isFinal } from "@/lib/sports";

export function GameList({ games, showDate = false }: { games: GameWithTeams[]; showDate?: boolean }) {
  if (games.length === 0) return <p style={{ color: "#94a3b8" }}>No games with a listed broadcast.</p>;
  return (
    <ul className="divide-y" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
      {games.map((g) => (
        <li key={g.id} className="py-3" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <Link href={gamePath(g)} className="flex flex-wrap items-baseline justify-between gap-2 hover:text-orange-300">
            <span style={{ fontWeight: 600 }}>
              {g.away.name} at {g.home.name}
              {isFinal(g.status) && g.away_score != null && g.home_score != null && (
                <span style={{ color: "#94a3b8", fontWeight: 400 }}> (Final {g.away_score} to {g.home_score})</span>
              )}
            </span>
            <span style={{ color: "#94a3b8", fontSize: 13 }}>
              {showDate &&
                new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" }).format(
                  new Date(g.scheduled_at),
                ) + ", "}
              {fmtTime(g.scheduled_at, "America/New_York")} ET on {broadcastTokens(g.broadcast).join(", ")}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
