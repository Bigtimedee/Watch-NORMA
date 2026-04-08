import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import type { Game } from "../lib/types";
import { SPORT_LABELS } from "../lib/sport-context";
import { formatClock } from "../lib/alert-helpers";
import { LIVE_STATUSES } from "../lib/constants";

interface GameCardProps {
  game: Game;
}

export function GameCard({ game }: GameCardProps) {
  const router = useRouter();
  const isLive = LIVE_STATUSES.includes(game.status as any);
  const isFinal = game.status === "closed";
  const isMlb = game.sport === "mlb";

  // For MLB: show run/hit/error instead of a single score
  const awayDisplay = isMlb
    ? (game.status !== "scheduled" ? String(game.away_score) : "-")
    : (game.status !== "scheduled" ? String(game.away_score) : "-");
  const homeDisplay = isMlb
    ? (game.status !== "scheduled" ? String(game.home_score) : "-")
    : (game.status !== "scheduled" ? String(game.home_score) : "-");

  // Sport label badge (show for NBA and MLB but not NCAA to avoid clutter)
  const sportBadge = game.sport !== "ncaam" ? SPORT_LABELS[game.sport] : null;

  return (
    <Pressable
      style={s.card}
      onPress={() => router.push(`/games/${game.id}`)}
      accessibilityLabel={`${game.away_team?.name ?? "Away"} at ${game.home_team?.name ?? "Home"}, ${isLive ? "Live" : isFinal ? "Final" : "Scheduled"}`}
    >
      {/* Header: broadcast + status */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          {sportBadge && (
            <View style={s.sportBadge}>
              <Text style={s.sportBadgeText}>{sportBadge}</Text>
            </View>
          )}
          <Text style={s.broadcastText} numberOfLines={1}>
            {game.broadcast ?? ""}
            {game.tournament_round ? ` \u00B7 ${game.tournament_round}` : ""}
          </Text>
        </View>
        <View
          style={[
            s.statusBadge,
            isLive ? s.statusLive : isFinal ? s.statusFinal : s.statusScheduled,
          ]}
        >
          <Text
            style={[s.statusText, isLive ? s.statusTextLive : s.statusTextDefault]}
          >
            {isLive ? `LIVE \u00B7 ${formatClock(game)}` : formatClock(game)}
          </Text>
        </View>
      </View>

      {/* Away team */}
      <View style={s.teamRow}>
        <View style={s.teamInfo}>
          <View style={s.teamLogo}>
            <Text style={s.teamLogoText}>
              {game.away_team?.abbreviation?.slice(0, 3) ?? "AWY"}
            </Text>
          </View>
          <Text style={s.teamName} numberOfLines={1}>
            {game.away_team?.name ?? "Away"}
          </Text>
        </View>
        <Text
          style={[s.score, isLive || isFinal ? s.scoreActive : s.scoreInactive]}
        >
          {awayDisplay}
        </Text>
      </View>

      {/* Home team */}
      <View style={[s.teamRow, { marginBottom: 0 }]}>
        <View style={s.teamInfo}>
          <View style={s.teamLogo}>
            <Text style={s.teamLogoText}>
              {game.home_team?.abbreviation?.slice(0, 3) ?? "HME"}
            </Text>
          </View>
          <Text style={s.teamName} numberOfLines={1}>
            {game.home_team?.name ?? "Home"}
          </Text>
        </View>
        <Text
          style={[s.score, isLive || isFinal ? s.scoreActive : s.scoreInactive]}
        >
          {homeDisplay}
        </Text>
      </View>

      {/* Venue */}
      {game.venue && <Text style={s.venue}>{game.venue}</Text>}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 6,
  },
  sportBadge: {
    backgroundColor: "#1e40af",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  sportBadgeText: {
    color: "#93c5fd",
    fontSize: 10,
    fontWeight: "700",
  },
  broadcastText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  statusLive: { backgroundColor: "rgba(239, 68, 68, 0.2)" },
  statusFinal: { backgroundColor: "#475569" },
  statusScheduled: { backgroundColor: "#334155" },
  statusText: { fontSize: 12, fontWeight: "700" },
  statusTextLive: { color: "#f87171" },
  statusTextDefault: { color: "#cbd5e1" },
  teamRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  teamInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  teamLogo: {
    width: 32,
    height: 32,
    borderRadius: 9999,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  teamLogoText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  teamName: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  score: { fontSize: 24, fontWeight: "700" },
  scoreActive: { color: "#ffffff" },
  scoreInactive: { color: "#64748b" },
  venue: { color: "#64748b", fontSize: 12, marginTop: 8 },
});
