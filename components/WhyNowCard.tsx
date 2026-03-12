import { View, Text, StyleSheet } from "react-native";

interface WagerImpact {
  wager_id?: number;
  wager_description: string;
  status: "covering" | "not_covering" | "at_risk" | "decided";
}

interface WhyNowExplanation {
  headline?: string;
  bullets?: string[];
  stats_used?: Record<string, number>;
  confidence?: number;
  wager_impact?: WagerImpact;
}

interface WhyNowCardProps {
  explanation: WhyNowExplanation;
  accentColor?: string;
}

const WAGER_STATUS_LABELS: Record<WagerImpact["status"], string> = {
  covering: "Covering",
  not_covering: "Not covering",
  at_risk: "At risk",
  decided: "Decided",
};

const WAGER_STATUS_COLORS: Record<WagerImpact["status"], string> = {
  covering: "#22c55e",
  not_covering: "#ef4444",
  at_risk: "#f59e0b",
  decided: "#94a3b8",
};

export function WhyNowCard({ explanation, accentColor = "#f97316" }: WhyNowCardProps) {
  const { headline, bullets, wager_impact } = explanation;

  if (!headline && !bullets?.length && !wager_impact) return null;

  return (
    <View style={[s.container, { borderLeftColor: accentColor }]}>
      {headline && (
        <Text style={s.headline}>{headline}</Text>
      )}

      {bullets?.map((bullet, i) => (
        <Text key={i} style={s.bullet}>{"\u2022"} {bullet}</Text>
      ))}

      {wager_impact && (
        <View style={[s.wagerRow, { backgroundColor: `${WAGER_STATUS_COLORS[wager_impact.status]}15` }]}>
          <View style={[s.statusDot, { backgroundColor: WAGER_STATUS_COLORS[wager_impact.status] }]} />
          <Text style={[s.wagerStatus, { color: WAGER_STATUS_COLORS[wager_impact.status] }]}>
            {WAGER_STATUS_LABELS[wager_impact.status]}
          </Text>
          <Text style={s.wagerDesc}>{" \u2014 "}{wager_impact.wager_description}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    marginTop: 8,
    paddingLeft: 10,
    borderLeftWidth: 3,
  },
  headline: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
  },
  bullet: {
    color: "#e2e8f0",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 2,
  },
  wagerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexWrap: "wrap",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 9999,
    marginRight: 6,
  },
  wagerStatus: {
    fontSize: 12,
    fontWeight: "700",
  },
  wagerDesc: {
    color: "#94a3b8",
    fontSize: 12,
    flexShrink: 1,
  },
});
