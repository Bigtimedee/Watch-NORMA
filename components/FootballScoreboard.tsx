// components/FootballScoreboard.tsx
// Renders a football-specific scoreboard: quarter line score (Q1-Q4 + OT columns),
// down & distance / possession from ESPN data in game_events snapshots, and a
// scoring-plays list. Follows MLBScoreboard.tsx as the structural pattern.

import { View, Text, StyleSheet, ScrollView } from "react-native";
import type { Game } from "../lib/types";
import { formatPeriodLabel } from "../lib/alert-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FootballScoringPlay {
  /** Quarter/period the play occurred in (1-4, 5=OT, 6=2OT, …) */
  period: number;
  /** Game-clock string at the time of the score, e.g. "4:12" */
  clock: string | null;
  /** "home" | "away" */
  team: "home" | "away";
  /** Short description, e.g. "TD – Jones 12 yd run" */
  description: string;
  /** Points value of this play: 6 (TD), 1 (PAT), 2 (2PT/Safety), 3 (FG) */
  points: number;
  /** Running home score after this play */
  homeScoreAfter: number;
  /** Running away score after this play */
  awayScoreAfter: number;
}

export interface FootballScoreboardProps {
  game: Game;
  sport: "ncaaf" | "nfl";
  /** Scoring plays derived from game_events rows (scoring_play = true, sorted by sequence) */
  scoringPlays?: FootballScoringPlay[];
  /** Down & distance string from ESPN, e.g. "2nd & 7" */
  downAndDistance?: string | null;
  /** Which team has possession — "home" | "away" | null */
  possession?: "home" | "away" | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Total standard quarters (1-4 always shown) */
const STANDARD_QUARTERS = 4;

/**
 * Derive per-quarter scores from the scoring-plays list.
 * Returns a map of period → points for each side.
 */
function buildQuarterScores(
  plays: FootballScoringPlay[],
  side: "home" | "away",
): Record<number, number> {
  const result: Record<number, number> = {};
  for (const play of plays) {
    if (play.team !== side) continue;
    result[play.period] = (result[play.period] ?? 0) + play.points;
  }
  return result;
}

/** Maximum period seen in scoring plays (to detect OT columns needed) */
function maxPeriod(plays: FootballScoringPlay[]): number {
  return plays.reduce((m, p) => Math.max(m, p.period), 0);
}

/** Quarter column header: 1-4 → "Q1"…"Q4", 5+ → "OT", "2OT", … */
function quarterLabel(period: number, sport: "ncaaf" | "nfl"): string {
  return formatPeriodLabel(sport, period);
}

/** Possession arrow character */
const POSSESSION_ARROW = "▶";

/** Format a scoring-play description for display */
function playTypeLabel(points: number): string {
  if (points === 6) return "TD";
  if (points === 3) return "FG";
  if (points === 2) return "2PT/Safety";
  if (points === 1) return "PAT";
  return `+${points}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FootballScoreboard({
  game,
  sport,
  scoringPlays = [],
  downAndDistance,
  possession,
}: FootballScoreboardProps) {
  const awayAbbr = game.away_team?.abbreviation ?? "AWY";
  const homeAbbr = game.home_team?.abbreviation ?? "HME";

  const isLive = game.status === "inprogress" || game.status === "halftime";

  // Build columns — always Q1-Q4, plus any OT periods seen
  const highestPeriod = Math.max(STANDARD_QUARTERS, maxPeriod(scoringPlays), game.period ?? 0);
  const periods = Array.from({ length: highestPeriod }, (_, i) => i + 1);

  const awayByQuarter = buildQuarterScores(scoringPlays, "away");
  const homeByQuarter = buildQuarterScores(scoringPlays, "home");

  // Current quarter for live situation bar
  const currentPeriod = game.period ?? null;
  const currentQuarterLabel = currentPeriod ? quarterLabel(currentPeriod, sport) : null;

  // Scoring plays in reverse-chronological order for the feed
  const displayPlays = [...scoringPlays].reverse();

  return (
    <View style={s.container}>
      {/* Live situation bar */}
      {isLive && (
        <View style={s.situationBar}>
          <View style={s.situationRow}>
            {currentQuarterLabel && (
              <Text style={s.quarterLabel}>{currentQuarterLabel}</Text>
            )}
            {game.clock && (
              <Text style={s.clockText}> · {game.clock}</Text>
            )}
          </View>

          {/* Down & distance + possession */}
          {(downAndDistance || possession) && (
            <View style={s.downRow}>
              {possession && (
                <Text style={s.possessionArrow}>
                  {POSSESSION_ARROW}{" "}
                  {possession === "home" ? homeAbbr : awayAbbr}
                </Text>
              )}
              {downAndDistance && (
                <Text style={s.downDistance}>{downAndDistance}</Text>
              )}
            </View>
          )}

          {game.status === "halftime" && (
            <Text style={s.halftimeLabel}>HALFTIME</Text>
          )}
        </View>
      )}

      {/* Quarter line-score table */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={s.scoreboardTable}>
          {/* Header row */}
          <View style={s.row}>
            <Text style={[s.teamCell, s.headerCell]}> </Text>
            {periods.map((p) => (
              <Text key={p} style={[s.quarterCell, s.headerCell]}>
                {quarterLabel(p, sport)}
              </Text>
            ))}
            <Text style={[s.totalCell, s.headerCell, { color: "#ef4444" }]}>T</Text>
          </View>

          {/* Away team row */}
          <View style={s.row}>
            <View style={s.teamNameCell}>
              {possession === "away" && (
                <Text style={s.possessionDot}>{POSSESSION_ARROW} </Text>
              )}
              <Text style={s.teamName}>{awayAbbr}</Text>
            </View>
            {periods.map((p) => (
              <Text key={p} style={s.quarterCell}>
                {awayByQuarter[p] != null ? awayByQuarter[p] : "-"}
              </Text>
            ))}
            <Text style={[s.totalCell, { color: "#ef4444", fontWeight: "700" }]}>
              {game.away_score}
            </Text>
          </View>

          {/* Home team row */}
          <View style={s.row}>
            <View style={s.teamNameCell}>
              {possession === "home" && (
                <Text style={s.possessionDot}>{POSSESSION_ARROW} </Text>
              )}
              <Text style={s.teamName}>{homeAbbr}</Text>
            </View>
            {periods.map((p) => (
              <Text key={p} style={s.quarterCell}>
                {homeByQuarter[p] != null ? homeByQuarter[p] : "-"}
              </Text>
            ))}
            <Text style={[s.totalCell, { color: "#ef4444", fontWeight: "700" }]}>
              {game.home_score}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Scoring plays feed */}
      {displayPlays.length > 0 && (
        <View style={s.playsSection}>
          <Text style={s.playsSectionTitle}>Scoring Plays</Text>
          {displayPlays.map((play, idx) => (
            <View
              key={idx}
              style={[s.playRow, idx > 0 && s.playRowBorder]}
            >
              {/* Left: period + clock */}
              <View style={s.playMeta}>
                <Text style={s.playPeriod}>{quarterLabel(play.period, sport)}</Text>
                {play.clock && (
                  <Text style={s.playClock}>{play.clock}</Text>
                )}
              </View>

              {/* Center: team badge + description */}
              <View style={s.playBody}>
                <View style={s.playTeamBadge}>
                  <Text style={s.playTeamText}>
                    {play.team === "home" ? homeAbbr : awayAbbr}
                  </Text>
                </View>
                <Text style={s.playDescription} numberOfLines={2}>
                  {playTypeLabel(play.points)} — {play.description}
                </Text>
              </View>

              {/* Right: running score */}
              <Text style={s.playScore}>
                {play.awayScoreAfter}–{play.homeScoreAfter}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Empty state: no scoring data yet */}
      {scoringPlays.length === 0 && !isLive && (
        <Text style={s.noDataText}>Scoring plays will appear once the game starts.</Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles (mirrors MLBScoreboard color palette)
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  container: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
  },

  // Situation bar
  situationBar: {
    backgroundColor: "#1e293b",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  situationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  quarterLabel: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  clockText: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "600",
  },
  halftimeLabel: {
    color: "#f97316",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginTop: 4,
  },
  downRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  possessionArrow: {
    color: "#f97316",
    fontSize: 12,
    fontWeight: "700",
  },
  downDistance: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "600",
  },

  // Scoreboard table
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
  },
  teamNameCell: {
    width: 44,
    flexDirection: "row",
    alignItems: "center",
  },
  teamName: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  possessionDot: {
    color: "#f97316",
    fontSize: 10,
    fontWeight: "800",
  },
  quarterCell: {
    width: 28,
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

  // Scoring plays
  playsSection: {
    borderTopWidth: 1,
    borderTopColor: "rgba(100, 116, 139, 0.3)",
    paddingTop: 10,
  },
  playsSectionTitle: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  playRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    gap: 8,
  },
  playRowBorder: {
    borderTopWidth: 1,
    borderTopColor: "rgba(100, 116, 139, 0.15)",
  },
  playMeta: {
    width: 36,
    alignItems: "center",
  },
  playPeriod: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  playClock: {
    color: "#475569",
    fontSize: 10,
  },
  playBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  playTeamBadge: {
    backgroundColor: "rgba(249, 115, 22, 0.15)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  playTeamText: {
    color: "#f97316",
    fontSize: 10,
    fontWeight: "700",
  },
  playDescription: {
    flex: 1,
    color: "#e2e8f0",
    fontSize: 12,
    lineHeight: 16,
  },
  playScore: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
    minWidth: 40,
    textAlign: "right",
  },

  // Empty state
  noDataText: {
    color: "#475569",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 8,
  },
});
