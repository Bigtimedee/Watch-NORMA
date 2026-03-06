import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { PredictionPosition } from "../lib/types";

interface AgentPositionCardProps {
  position: PredictionPosition;
}

function probabilityPct(position: PredictionPosition): number | null {
  if (position.current_price == null) return null;
  const raw = position.current_price;
  return raw > 1 ? Math.round(raw) : Math.round(raw * 100);
}

function userFacingPct(position: PredictionPosition): number | null {
  const p = probabilityPct(position);
  if (p == null) return null;
  return position.position_side.toLowerCase() === "yes" ? p : 100 - p;
}

function probBarColor(pct: number | null): string {
  if (pct == null) return "#475569";
  if (pct >= 70) return "#22c55e";
  if (pct <= 30) return "#ef4444";
  return "#94a3b8";
}

function positionSizeDisplay(position: PredictionPosition): string | null {
  if (!position.quantity || !position.avg_price) return null;
  const price = position.avg_price > 1 ? position.avg_price / 100 : position.avg_price;
  const cost = position.quantity * price;
  return `$${cost.toFixed(2)}`;
}

function potentialPayoutDisplay(position: PredictionPosition): string | null {
  if (!position.quantity) return null;
  return `$${position.quantity.toFixed(2)}`;
}

export function AgentPositionCard({ position }: AgentPositionCardProps) {
  const ufPct = userFacingPct(position);
  const rawPct = probabilityPct(position);
  const barColor = probBarColor(ufPct);
  const direction = position.position_side.toUpperCase();
  const platform = position.platform === "kalshi" ? "Kalshi" : "Polymarket";
  const platformColor = position.platform === "kalshi" ? "#60a5fa" : "#a78bfa";
  const size = positionSizeDisplay(position);
  const payout = potentialPayoutDisplay(position);
  const hasStreamingMatch = !!position.parsed_target && !!position.game_id;

  const shortTitle = position.market_title.length > 60
    ? position.market_title.slice(0, 57) + "…"
    : position.market_title;

  return (
    <View style={s.card}>
      {/* Platform + direction + streaming badge */}
      <View style={s.topRow}>
        <View style={[s.badge, { backgroundColor: platformColor + "26" }]}>
          <Text style={[s.badgeText, { color: platformColor }]}>{platform}</Text>
        </View>
        <View style={[s.badge, { backgroundColor: direction === "YES" ? "#22c55e26" : "#ef444426" }]}>
          <Text style={[s.badgeText, { color: direction === "YES" ? "#22c55e" : "#ef4444" }]}>{direction}</Text>
        </View>
        {hasStreamingMatch && (
          <View style={s.streamBadge}>
            <Ionicons name="tv-outline" size={11} color="#f97316" />
            <Text style={s.streamBadgeText}>Match found</Text>
          </View>
        )}
      </View>

      {/* Market title */}
      <Text style={s.title}>{shortTitle}</Text>

      {/* Probability bar */}
      <View style={s.probRow}>
        <View style={s.barBg}>
          <View style={[s.barFill, { width: `${rawPct ?? 50}%`, backgroundColor: barColor }]} />
        </View>
        <Text style={[s.probText, { color: barColor }]}>
          {ufPct != null ? `${ufPct}%` : "—"}
        </Text>
      </View>

      {/* Size + payout */}
      {(size || payout) && (
        <View style={s.bottomRow}>
          {size && (
            <Text style={s.meta}>
              <Text style={s.metaLabel}>Size </Text>{size}
            </Text>
          )}
          {payout && (
            <Text style={s.meta}>
              <Text style={s.metaLabel}>Payout </Text>{payout}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  streamBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9731620",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    gap: 3,
  },
  streamBadgeText: {
    color: "#f97316",
    fontSize: 11,
    fontWeight: "600",
  },
  title: {
    color: "#f1f5f9",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginBottom: 12,
  },
  probRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  barBg: {
    flex: 1,
    height: 6,
    backgroundColor: "#334155",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  probText: {
    fontSize: 13,
    fontWeight: "700",
    minWidth: 38,
    textAlign: "right",
  },
  bottomRow: {
    flexDirection: "row",
    gap: 16,
  },
  meta: {
    color: "#94a3b8",
    fontSize: 12,
  },
  metaLabel: {
    color: "#64748b",
  },
});
