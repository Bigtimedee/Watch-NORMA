import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useKalshiConnection, useKalshiPositions } from "../../../hooks/useKalshi";
import {
  usePolymarketConnection,
  usePolymarketPositions,
} from "../../../hooks/usePolymarket";
import { PositionCard } from "../../../components/PositionCard";

export default function PredictionMarketsScreen() {
  const router = useRouter();
  const { data: kalshiConn } = useKalshiConnection();
  const { data: polyConn } = usePolymarketConnection();
  const { data: kalshiPositions } = useKalshiPositions();
  const { data: polyPositions } = usePolymarketPositions();

  const kalshiConnected = kalshiConn?.connected ?? false;
  const polyConnected = polyConn?.connected ?? false;

  const kalshiPnl = (kalshiPositions ?? []).reduce(
    (sum, p) => sum + (p.pnl ?? 0),
    0
  );
  const polyPnl = (polyPositions ?? []).reduce(
    (sum, p) => sum + (p.pnl ?? 0),
    0
  );

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#f97316" />
        </Pressable>
        <Text style={s.headerTitle}>Prediction Markets</Text>
      </View>

      <ScrollView style={s.flex} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={s.desc}>
          Connect Kalshi or Polymarket to view your NCAAB prediction positions
          alongside game data.
        </Text>

        {/* Kalshi Section */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Kalshi</Text>
          <View style={s.platformCard}>
            <View style={s.platformRow}>
              <View style={s.platformIcon}>
                <Text style={s.platformIconText}>K</Text>
              </View>
              <View style={s.platformInfo}>
                <Text style={s.platformName}>Kalshi</Text>
                <Text style={s.platformStatus}>
                  {kalshiConnected ? "Connected" : "Not connected"}
                </Text>
              </View>
              {kalshiConnected ? (
                <View style={s.connectedBadge}>
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color="#22c55e"
                  />
                </View>
              ) : (
                <Pressable
                  style={s.connectBtn}
                  onPress={() =>
                    router.push("/(tabs)/connections/kalshi-connect")
                  }
                >
                  <Text style={s.connectBtnText}>Connect</Text>
                </Pressable>
              )}
            </View>
          </View>

          {kalshiConnected && (kalshiPositions ?? []).length > 0 && (
            <View style={s.positionsSection}>
              <View style={s.pnlRow}>
                <Text style={s.positionsCount}>
                  {kalshiPositions!.length} position
                  {kalshiPositions!.length !== 1 ? "s" : ""}
                </Text>
                <Text
                  style={[
                    s.pnlValue,
                    {
                      color:
                        kalshiPnl > 0
                          ? "#4ade80"
                          : kalshiPnl < 0
                            ? "#f87171"
                            : "#94a3b8",
                    },
                  ]}
                >
                  {kalshiPnl > 0 ? "+" : ""}${kalshiPnl.toFixed(2)}
                </Text>
              </View>
              {kalshiPositions!.map((pos) => (
                <PositionCard key={pos.id} position={pos} />
              ))}
            </View>
          )}
        </View>

        {/* Polymarket Section */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Polymarket</Text>
          <View style={s.platformCard}>
            <View style={s.platformRow}>
              <View style={[s.platformIcon, s.platformIconPoly]}>
                <Text style={s.platformIconText}>P</Text>
              </View>
              <View style={s.platformInfo}>
                <Text style={s.platformName}>Polymarket</Text>
                <Text style={s.platformStatus}>
                  {polyConnected
                    ? `Wallet: ${(polyConn?.metadata as any)?.wallet_address?.slice(0, 8)}...`
                    : "Not connected"}
                </Text>
              </View>
              {polyConnected ? (
                <View style={s.connectedBadge}>
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color="#22c55e"
                  />
                </View>
              ) : (
                <Pressable
                  style={s.connectBtn}
                  onPress={() =>
                    router.push("/(tabs)/connections/polymarket-connect")
                  }
                >
                  <Text style={s.connectBtnText}>Connect</Text>
                </Pressable>
              )}
            </View>
          </View>

          {polyConnected && (polyPositions ?? []).length > 0 && (
            <View style={s.positionsSection}>
              <View style={s.pnlRow}>
                <Text style={s.positionsCount}>
                  {polyPositions!.length} position
                  {polyPositions!.length !== 1 ? "s" : ""}
                </Text>
                <Text
                  style={[
                    s.pnlValue,
                    {
                      color:
                        polyPnl > 0
                          ? "#4ade80"
                          : polyPnl < 0
                            ? "#f87171"
                            : "#94a3b8",
                    },
                  ]}
                >
                  {polyPnl > 0 ? "+" : ""}${polyPnl.toFixed(2)}
                </Text>
              </View>
              {polyPositions!.map((pos) => (
                <PositionCard key={pos.id} position={pos} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
    marginLeft: 8,
  },
  desc: {
    color: "#94a3b8",
    fontSize: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  section: { marginHorizontal: 16, marginBottom: 24 },
  sectionLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  platformCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 16,
  },
  platformRow: { flexDirection: "row", alignItems: "center" },
  platformIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#6366f1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  platformIconPoly: { backgroundColor: "#8b5cf6" },
  platformIconText: { color: "#ffffff", fontSize: 18, fontWeight: "700" },
  platformInfo: { flex: 1 },
  platformName: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  platformStatus: { color: "#94a3b8", fontSize: 13 },
  connectBtn: {
    backgroundColor: "#f97316",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
  },
  connectBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "600" },
  connectedBadge: { padding: 4 },
  positionsSection: { marginTop: 12 },
  pnlRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  positionsCount: { color: "#94a3b8", fontSize: 13 },
  pnlValue: { fontSize: 14, fontWeight: "700" },
});
