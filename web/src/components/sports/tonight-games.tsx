import Link from "next/link";
import { listGames, gamePath, fmtTime, broadcastTokens, SPORT_LABEL, SPORTS } from "@/lib/sports";

/** Homepage module: tonight's games with channels. Never breaks the homepage. */
export async function TonightGames() {
  let games: Awaited<ReturnType<typeof listGames>> = [];
  try {
    const now = Date.now();
    games = (await listGames({ from: new Date(now - 3 * 3600e3), to: new Date(now + 18 * 3600e3), limit: 40 }))
      .sort((a, b) => SPORTS.indexOf(a.sport) - SPORTS.indexOf(b.sport) || a.scheduled_at.localeCompare(b.scheduled_at))
      .slice(0, 8);
  } catch {
    return null;
  }
  if (games.length === 0) return null;
  return (
    <section className="py-16" style={{ background: "#0f172a" }} aria-labelledby="tonight-games">
      <div className="mx-auto max-w-7xl px-6">
        <h2 id="tonight-games" className="text-3xl font-bold" style={{ color: "#F5F3EE" }}>Tonight&apos;s games</h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {games.map((g) => (
            <li key={g.id}>
              <Link href={gamePath(g)} className="block rounded-xl p-4 hover:opacity-90" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#F5F3EE" }}>
                <span style={{ fontSize: 11, color: "#f97316", fontWeight: 700, textTransform: "uppercase" }}>{SPORT_LABEL[g.sport]}</span>
                <span className="block font-semibold">{g.away.name} at {g.home.name}</span>
                <span style={{ fontSize: 13, color: "#94a3b8" }}>{fmtTime(g.scheduled_at, "America/New_York")} ET on {broadcastTokens(g.broadcast).join(", ")}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
