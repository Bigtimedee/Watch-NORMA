import { View, Text, StyleSheet } from "react-native";
import { useOdds } from "../hooks/useOdds";
import { SPORTSBOOK_NAMES } from "../lib/constants";
import type { GameOdds } from "../lib/types";

interface OddsDisplayProps {
  gameId: string;
  compact?: boolean;
}

function formatAmericanOdds(price: number | null): string {
  if (price == null) return "-";
  if (price <= 0) return "-";
  if (price <= 1.0) return "-";
  if (price >= 2) return `+${Math.round((price - 1) * 100)}`;
  // price is in (1, 2) — valid underdog decimal odds
  return `-${Math.round(100 / (price - 1))}`;
}

function formatSpread(line: number | null): string {
  if (line == null) return "-";
  return line > 0 ? `+${line}` : String(line);
}

export function OddsDisplay({ gameId, compact = false }: OddsDisplayProps) {
  const { data: odds, isLoading } = useOdds(gameId);

  if (isLoading || !odds || odds.length === 0) return null;

  // Pick the first available sportsbook's odds
  const spreads = odds.find((o) => o.market_type === "spreads");
  const totals = odds.find((o) => o.market_type === "totals");
  const moneyline = odds.find((o) => o.market_type === "h2h");

  if (!spreads && !totals && !moneyline) return null;

  if (compact) {
    return (
      <View style={s.compactRow}>
        {spreads && (
          <View style={s.compactPill}>
            <Text style={s.compactLabel}>SPR</Text>
            <Text style={s.compactValue}>
              {formatSpread(spreads.home_line)}
            </Text>
          </View>
        )}
        {moneyline && (
          <View style={s.compactPill}>
            <Text style={s.compactLabel}>ML</Text>
            <Text style={s.compactValue}>
              {formatAmericanOdds(moneyline.home_price)}
            </Text>
          </View>
        )}
        {totals && (
          <View style={s.compactPill}>
            <Text style={s.compactLabel}>O/U</Text>
            <Text style={s.compactValue}>{totals.over_under ?? "-"}</Text>
          </View>
        )}
      </View>
    );
  }

  // Group by sportsbook for expanded view
  const sportsbooks = new Set(odds.map((o) => o.sportsbook));

  return (
    <View style={s.container}>
      <Text style={s.sectionLabel}>Odds</Text>
      <View style={s.card}>
        {/* Header row */}
        <View style={s.headerRow}>
          <Text style={[s.headerCell, s.bookCol]}>Book</Text>
          <Text style={s.headerCell}>Spread</Text>
          <Text style={s.headerCell}>ML</Text>
          <Text style={s.headerCell}>O/U</Text>
        </View>

        {[...sportsbooks].map((book) => {
          const bookOdds = odds.filter((o) => o.sportsbook === book);
          const sp = bookOdds.find((o) => o.market_type === "spreads");
          const ml = bookOdds.find((o) => o.market_type === "h2h");
          const ou = bookOdds.find((o) => o.market_type === "totals");

          return (
            <View key={book} style={s.oddsRow}>
              <Text style={[s.oddsCell, s.bookCol, s.bookName]}>
                {SPORTSBOOK_NAMES[book] ?? book}
              </Text>
              <View style={s.oddsCell}>
                <Text style={s.oddsPrimary}>
                  {formatSpread(sp?.home_line ?? null)}
                </Text>
                <Text style={s.oddsSecondary}>
                  {formatAmericanOdds(sp?.home_price ?? null)}
                </Text>
              </View>
              <View style={s.oddsCell}>
                <Text style={s.oddsPrimary}>
                  {formatAmericanOdds(ml?.home_price ?? null)}
                </Text>
              </View>
              <View style={s.oddsCell}>
                <Text style={s.oddsPrimary}>{ou?.over_under ?? "-"}</Text>
                <Text style={s.oddsSecondary}>
                  {ou ? `O${formatAmericanOdds(ou.over_price)}` : ""}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginHorizontal: 16, marginBottom: 16 },
  sectionLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  card: { backgroundColor: "#1e293b", borderRadius: 16, padding: 16 },
  headerRow: {
    flexDirection: "row",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#475569",
    marginBottom: 4,
  },
  headerCell: {
    flex: 1,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  bookCol: { flex: 1.2, textAlign: "left" },
  oddsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  oddsCell: { flex: 1, alignItems: "center" },
  bookName: { color: "#cbd5e1", fontSize: 13, fontWeight: "500" },
  oddsPrimary: { color: "#ffffff", fontSize: 14, fontWeight: "600" },
  oddsSecondary: { color: "#64748b", fontSize: 11 },
  compactRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  compactPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  compactLabel: { color: "#64748b", fontSize: 10, fontWeight: "700" },
  compactValue: { color: "#cbd5e1", fontSize: 12, fontWeight: "600" },
});
