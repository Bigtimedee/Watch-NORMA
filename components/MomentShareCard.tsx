import { forwardRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import type { ShareCardData } from "../lib/formatShareCard";
import { NORMA_APP_STORE_URL } from "../lib/constants";

interface MomentShareCardProps {
  data: ShareCardData;
}

export const MomentShareCard = forwardRef<View, MomentShareCardProps>(
  function MomentShareCard({ data }, ref) {
    const scoreDisplay =
      data.homeScore !== null && data.awayScore !== null
        ? `${data.awayScore}  –  ${data.homeScore}`
        : "vs";

    return (
      <View style={s.card} ref={ref} collapsable={false}>
        {/* Brand header */}
        <View style={s.header}>
          <Text style={s.logo}>Watch NORMA</Text>
          {data.clockDisplay ? (
            <Text style={s.clock}>{data.clockDisplay}</Text>
          ) : null}
        </View>

        {/* Matchup row */}
        <View style={s.matchupRow}>
          <Text style={s.team} numberOfLines={1}>{data.awayTeam}</Text>
          <Text style={s.score}>{scoreDisplay}</Text>
          <Text style={s.team} numberOfLines={1}>{data.homeTeam}</Text>
        </View>

        {/* Alert headline + top bullet */}
        <View style={s.whySection}>
          <Text style={s.headline}>{data.headline}</Text>
          {data.topBullet ? (
            <Text style={s.bullet}>{"•"} {data.topBullet}</Text>
          ) : null}
          {data.wagerLine ? (
            <View style={s.wagerBadge}>
              <Text style={s.wagerText}>My pick: {data.wagerLine}</Text>
            </View>
          ) : null}
        </View>

        {/* Footer: App Store CTA */}
        <View style={s.footer}>
          <Text style={s.footerText}>Watch your bets live · {NORMA_APP_STORE_URL}</Text>
        </View>
      </View>
    );
  },
);

const s = StyleSheet.create({
  card: {
    width: 360,
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(249, 115, 22, 0.4)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  logo: {
    color: "#f97316",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  clock: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
  },
  matchupRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  team: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  score: {
    color: "#f97316",
    fontSize: 28,
    fontWeight: "800",
    marginHorizontal: 8,
  },
  whySection: {
    backgroundColor: "rgba(249, 115, 22, 0.08)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  headline: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  bullet: {
    color: "#e2e8f0",
    fontSize: 13,
    lineHeight: 18,
  },
  wagerBadge: {
    marginTop: 8,
    backgroundColor: "rgba(249, 115, 22, 0.2)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  wagerText: {
    color: "#f97316",
    fontSize: 12,
    fontWeight: "600",
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: "rgba(100, 116, 139, 0.3)",
    paddingTop: 12,
  },
  footerText: {
    color: "#64748b",
    fontSize: 11,
    textAlign: "center",
  },
});
