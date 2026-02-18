import { View, Text, Pressable, Linking, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePredictionMarkets } from "../hooks/usePredictionMarkets";
import { PositionCard } from "./PositionCard";

interface MarketPricesProps {
  gameId: string;
}

export function MarketPrices({ gameId }: MarketPricesProps) {
  const { data: positions, isLoading } = usePredictionMarkets(gameId);

  if (isLoading || !positions || positions.length === 0) return null;

  const kalshiPositions = positions.filter((p) => p.platform === "kalshi");
  const polyPositions = positions.filter((p) => p.platform === "polymarket");

  return (
    <View style={s.container}>
      <Text style={s.sectionLabel}>Your Prediction Markets</Text>

      {kalshiPositions.length > 0 && (
        <View style={s.platformSection}>
          <View style={s.platformHeader}>
            <Text style={s.platformName}>Kalshi</Text>
            <Pressable
              onPress={() => Linking.openURL("https://kalshi.com")}
              hitSlop={8}
            >
              <Ionicons
                name="open-outline"
                size={16}
                color="#64748b"
              />
            </Pressable>
          </View>
          {kalshiPositions.map((pos) => (
            <PositionCard key={pos.id} position={pos} />
          ))}
        </View>
      )}

      {polyPositions.length > 0 && (
        <View style={s.platformSection}>
          <View style={s.platformHeader}>
            <Text style={s.platformName}>Polymarket</Text>
            <Pressable
              onPress={() => Linking.openURL("https://polymarket.com")}
              hitSlop={8}
            >
              <Ionicons
                name="open-outline"
                size={16}
                color="#64748b"
              />
            </Pressable>
          </View>
          {polyPositions.map((pos) => (
            <PositionCard key={pos.id} position={pos} />
          ))}
        </View>
      )}
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
  platformSection: { marginBottom: 12 },
  platformHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  platformName: { color: "#cbd5e1", fontSize: 14, fontWeight: "600" },
});
