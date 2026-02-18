import { View, Text, StyleSheet } from "react-native";
import type { PredictionPosition } from "../lib/types";

interface PositionCardProps {
  position: PredictionPosition;
}

export function PositionCard({ position }: PositionCardProps) {
  const isYes = position.position_side === "yes";
  const pnl = position.pnl ?? 0;
  const pnlColor = pnl > 0 ? "#4ade80" : pnl < 0 ? "#f87171" : "#94a3b8";

  return (
    <View style={s.card}>
      <View style={s.topRow}>
        <Text style={s.title} numberOfLines={2}>
          {position.market_title}
        </Text>
        <View
          style={[
            s.sideBadge,
            isYes ? s.sideBadgeYes : s.sideBadgeNo,
          ]}
        >
          <Text
            style={[
              s.sideText,
              isYes ? s.sideTextYes : s.sideTextNo,
            ]}
          >
            {isYes ? "YES" : "NO"}
          </Text>
        </View>
      </View>

      <View style={s.statsRow}>
        <View style={s.stat}>
          <Text style={s.statLabel}>Qty</Text>
          <Text style={s.statValue}>{position.quantity}</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statLabel}>Avg</Text>
          <Text style={s.statValue}>
            {(position.avg_price * 100).toFixed(0)}c
          </Text>
        </View>
        {position.current_price != null && (
          <View style={s.stat}>
            <Text style={s.statLabel}>Current</Text>
            <Text style={s.statValue}>
              {(position.current_price * 100).toFixed(0)}c
            </Text>
          </View>
        )}
        <View style={s.stat}>
          <Text style={s.statLabel}>P&L</Text>
          <Text style={[s.statValue, { color: pnlColor }]}>
            {pnl > 0 ? "+" : ""}
            ${pnl.toFixed(2)}
          </Text>
        </View>
      </View>

      {position.settled && (
        <View style={s.settledBadge}>
          <Text style={s.settledText}>SETTLED</Text>
        </View>
      )}

      <View style={s.platformRow}>
        <View
          style={[
            s.platformBadge,
            position.platform === "kalshi"
              ? s.platformKalshi
              : s.platformPoly,
          ]}
        >
          <Text style={s.platformText}>
            {position.platform === "kalshi" ? "Kalshi" : "Polymarket"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  title: { color: "#ffffff", fontSize: 14, fontWeight: "500", flex: 1, marginRight: 8 },
  sideBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 9999 },
  sideBadgeYes: { backgroundColor: "rgba(34, 197, 94, 0.2)" },
  sideBadgeNo: { backgroundColor: "rgba(239, 68, 68, 0.2)" },
  sideText: { fontSize: 12, fontWeight: "700" },
  sideTextYes: { color: "#4ade80" },
  sideTextNo: { color: "#f87171" },
  statsRow: { flexDirection: "row", gap: 16 },
  stat: {},
  statLabel: { color: "#64748b", fontSize: 11 },
  statValue: { color: "#cbd5e1", fontSize: 14, fontWeight: "600" },
  settledBadge: {
    marginTop: 8,
    backgroundColor: "#475569",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    alignSelf: "flex-start",
  },
  settledText: { color: "#94a3b8", fontSize: 11, fontWeight: "700" },
  platformRow: { marginTop: 8 },
  platformBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, alignSelf: "flex-start" },
  platformKalshi: { backgroundColor: "rgba(99, 102, 241, 0.2)" },
  platformPoly: { backgroundColor: "rgba(139, 92, 246, 0.2)" },
  platformText: { color: "#a5b4fc", fontSize: 11, fontWeight: "600" },
});
