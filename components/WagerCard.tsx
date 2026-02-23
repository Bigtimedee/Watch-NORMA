import { View, Text, StyleSheet } from "react-native";
import type { Wager } from "../lib/types";
import { SPORTSBOOK_NAMES } from "../lib/constants";

interface WagerCardProps {
  wager: Wager;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: "rgba(59, 130, 246, 0.2)", text: "#60a5fa" },
  won: { bg: "rgba(34, 197, 94, 0.2)", text: "#4ade80" },
  lost: { bg: "rgba(239, 68, 68, 0.2)", text: "#f87171" },
  push: { bg: "rgba(148, 163, 184, 0.2)", text: "#94a3b8" },
};

export function WagerCard({ wager }: WagerCardProps) {
  const statusStyle = STATUS_COLORS[wager.status] ?? STATUS_COLORS.active;

  return (
    <View style={s.card} accessibilityLabel={`${wager.description}, ${wager.status}`}>
      <View style={s.topRow}>
        <View style={s.meta}>
          {wager.sportsbook && (
            <Text style={s.book}>
              {SPORTSBOOK_NAMES[wager.sportsbook] ?? wager.sportsbook}
            </Text>
          )}
          {wager.wager_type && (
            <Text style={s.type}>
              {wager.wager_type === "over_under"
                ? "O/U"
                : wager.wager_type.charAt(0).toUpperCase() +
                  wager.wager_type.slice(1)}
            </Text>
          )}
        </View>
        <View style={[s.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[s.statusText, { color: statusStyle.text }]}>
            {wager.status.toUpperCase()}
          </Text>
        </View>
      </View>

      <Text style={s.description}>{wager.description}</Text>

      <View style={s.detailRow}>
        {wager.line != null && (
          <Text style={s.detail}>
            Line: {wager.line > 0 ? `+${wager.line}` : wager.line}
          </Text>
        )}
        {wager.odds && <Text style={s.detail}>Odds: {wager.odds}</Text>}
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
    alignItems: "center",
    marginBottom: 6,
  },
  meta: { flexDirection: "row", alignItems: "center", gap: 8 },
  book: { color: "#fb923c", fontSize: 12, fontWeight: "700" },
  type: { color: "#64748b", fontSize: 12, fontWeight: "500" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999 },
  statusText: { fontSize: 11, fontWeight: "700" },
  description: { color: "#ffffff", fontSize: 14, fontWeight: "500" },
  detailRow: { flexDirection: "row", gap: 16, marginTop: 4 },
  detail: { color: "#94a3b8", fontSize: 12 },
});
