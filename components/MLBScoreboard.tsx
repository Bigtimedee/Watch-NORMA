// components/MLBScoreboard.tsx
// Renders the classic baseball scoreboard: inning-by-inning runs, R/H/E totals,
// current at-bat state (count, outs, runners), and starting pitcher pitch counts.

import { View, Text, StyleSheet, ScrollView } from "react-native";
import type { Game, MLBGameStats } from "../lib/types";

interface MLBScoreboardProps {
  game: Game;
  stats: MLBGameStats;
}

/** Convert base runners array to a visual indicator string */
function runnersDisplay(runners: Array<{ base: number; player_name: string }>): string {
  const bases = new Set(runners.map((r) => r.base));
  const parts = [
    bases.has(1) ? "1B" : "--",
    bases.has(2) ? "2B" : "--",
    bases.has(3) ? "3B" : "--",
  ];
  return parts.join(" ");
}

/** Format innings pitched (e.g., 6.666... -> "6.2") */
function formatIP(ip: number | null): string {
  if (ip == null) return "--";
  const full = Math.floor(ip);
  const fraction = ip - full;
  // Sportradar uses 0.333 = 1 out, 0.667 = 2 outs
  const outs = fraction < 0.4 ? 1 : fraction < 0.8 ? 2 : 0;
  return outs === 0 ? `${full}` : `${full}.${outs}`;
}

/** Format ERA to 2 decimal places */
function formatERA(era: number | null): string {
  if (era == null) return "--";
  return era.toFixed(2);
}

/** Format inning half + number for current state */
function inningLabel(half: "T" | "B" | null, inning: number | null): string {
  if (!inning) return "Pre-game";
  const halfLabel = half === "T" ? "Top" : half === "B" ? "Bot" : "";
  const suffix = inning === 1 ? "1st" : inning === 2 ? "2nd" : inning === 3 ? "3rd" : `${inning}th`;
  return `${halfLabel} ${suffix}`;
}

export function MLBScoreboard({ game, stats }: MLBScoreboardProps) {
  const awayAbbr = game.away_team?.abbreviation ?? "AWY";
  const homeAbbr = game.home_team?.abbreviation ?? "HME";
  const awayName = game.away_team?.name ?? "Away";
  const homeName = game.home_team?.name ?? "Home";

  // Build inning columns (always show 9, extend for extra innings)
  const maxInning = Math.max(9, stats.current_inning ?? 0);
  const innings = Array.from({ length: maxInning }, (_, i) => i + 1);

  const awayByInning: Record<number, number | null> = {};
  const homeByInning: Record<number, number | null> = {};
  for (const row of stats.away_innings ?? []) awayByInning[row.inning] = row.runs;
  for (const row of stats.home_innings ?? []) homeByInning[row.inning] = row.runs;

  const isLive = game.status === "inprogress" || game.status === "halftime";

  return (
    <View style={s.container}>
      {/* Current situation bar */}
      {isLive && (
        <View style={s.situationBar}>
          <Text style={s.inningLabel}>
            {inningLabel(stats.inning_half, stats.current_inning)}
          </Text>
          <View style={s.countRow}>
            <Text style={s.countLabel}>
              {stats.balls}-{stats.strikes} Count
            </Text>
            <Text style={s.countLabel}>
              {stats.outs} Out{stats.outs !== 1 ? "s" : ""}
            </Text>
          </View>
          {(stats.runners_on_base?.length ?? 0) > 0 && (
            <Text style={s.runnersText}>
              Runners: {runnersDisplay(stats.runners_on_base ?? [])}
            </Text>
          )}
          {(stats.home_no_hitter_active || stats.away_no_hitter_active) && (
            <View style={s.noHitterBadge}>
              <Text style={s.noHitterText}>NO-HITTER IN PROGRESS</Text>
            </View>
          )}
        </View>
      )}

      {/* Inning-by-inning scoreboard */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={s.scoreboardTable}>
          {/* Header row */}
          <View style={s.row}>
            <Text style={[s.teamCell, s.headerCell]}> </Text>
            {innings.map((i) => (
              <Text key={i} style={[s.inningCell, s.headerCell]}>{i}</Text>
            ))}
            <Text style={[s.totalCell, s.headerCell, { color: "#ef4444" }]}>R</Text>
            <Text style={[s.totalCell, s.headerCell]}>H</Text>
            <Text style={[s.totalCell, s.headerCell]}>E</Text>
          </View>

          {/* Away team row */}
          <View style={s.row}>
            <Text style={[s.teamCell, s.teamName]}>{awayAbbr}</Text>
            {innings.map((i) => (
              <Text key={i} style={s.inningCell}>
                {awayByInning[i] != null ? awayByInning[i] : "-"}
              </Text>
            ))}
            <Text style={[s.totalCell, { color: "#ef4444", fontWeight: "700" }]}>{stats.away_runs}</Text>
            <Text style={s.totalCell}>{stats.away_hits}</Text>
            <Text style={s.totalCell}>{stats.away_errors}</Text>
          </View>

          {/* Home team row */}
          <View style={s.row}>
            <Text style={[s.teamCell, s.teamName]}>{homeAbbr}</Text>
            {innings.map((i) => (
              <Text key={i} style={s.inningCell}>
                {homeByInning[i] != null ? homeByInning[i] : "-"}
              </Text>
            ))}
            <Text style={[s.totalCell, { color: "#ef4444", fontWeight: "700" }]}>{stats.home_runs}</Text>
            <Text style={s.totalCell}>{stats.home_hits}</Text>
            <Text style={s.totalCell}>{stats.home_errors}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Starting pitcher lines */}
      <View style={s.pitcherSection}>
        <Text style={s.pitcherSectionTitle}>Starting Pitchers</Text>

        {/* Away starter */}
        <View style={s.pitcherRow}>
          <Text style={s.pitcherTeam}>{awayAbbr}</Text>
          <Text style={s.pitcherName} numberOfLines={1}>
            {stats.away_starter_name ?? "TBD"}
            {!stats.away_starter_still_pitching ? " (OUT)" : ""}
          </Text>
          <View style={s.pitcherStats}>
            <Text style={s.pitcherStat}>{stats.away_starter_pitches}P</Text>
            <Text style={s.pitcherStat}>{formatIP(stats.away_starter_ip)}IP</Text>
            <Text style={s.pitcherStat}>{stats.away_starter_strikeouts}K</Text>
            <Text style={[s.pitcherStat, { color: "#64748b" }]}>ERA {formatERA(stats.away_starter_era)}</Text>
          </View>
        </View>

        {/* Home starter */}
        <View style={s.pitcherRow}>
          <Text style={s.pitcherTeam}>{homeAbbr}</Text>
          <Text style={s.pitcherName} numberOfLines={1}>
            {stats.home_starter_name ?? "TBD"}
            {!stats.home_starter_still_pitching ? " (OUT)" : ""}
          </Text>
          <View style={s.pitcherStats}>
            <Text style={s.pitcherStat}>{stats.home_starter_pitches}P</Text>
            <Text style={s.pitcherStat}>{formatIP(stats.home_starter_ip)}IP</Text>
            <Text style={s.pitcherStat}>{stats.home_starter_strikeouts}K</Text>
            <Text style={[s.pitcherStat, { color: "#64748b" }]}>ERA {formatERA(stats.home_starter_era)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
  },
  situationBar: {
    backgroundColor: "#1e293b",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  inningLabel: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  countRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 2,
  },
  countLabel: {
    color: "#94a3b8",
    fontSize: 12,
  },
  runnersText: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 2,
  },
  noHitterBadge: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
    alignSelf: "flex-start",
  },
  noHitterText: {
    color: "#ef4444",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  scoreboardTable: {
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  headerCell: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
  },
  teamCell: {
    width: 44,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  teamName: {
    color: "#ffffff",
  },
  inningCell: {
    width: 20,
    textAlign: "center",
    color: "#cbd5e1",
    fontSize: 12,
  },
  totalCell: {
    width: 28,
    textAlign: "center",
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "600",
  },
  pitcherSection: {
    borderTopWidth: 1,
    borderTopColor: "rgba(100, 116, 139, 0.3)",
    paddingTop: 10,
  },
  pitcherSectionTitle: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pitcherRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  pitcherTeam: {
    width: 40,
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
  },
  pitcherName: {
    flex: 1,
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
    marginRight: 8,
  },
  pitcherStats: {
    flexDirection: "row",
    gap: 8,
  },
  pitcherStat: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "500",
  },
});
