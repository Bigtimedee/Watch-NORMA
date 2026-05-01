import { View, Text, FlatList, ActivityIndicator, Pressable, StyleSheet, Alert, Clipboard } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useStreamingProviders,
  useConnections,
} from "../../../hooks/useConnections";
import { ConnectionToggle } from "../../../components/ConnectionToggle";

// Tier A partner API providers — scaffolded for when partnerships are secured
const TIER_A_PROVIDERS = [
  { key: "draftkings_api", name: "DraftKings", icon: "trophy-outline" as const },
  { key: "fanduel_api", name: "FanDuel", icon: "trophy-outline" as const },
] as const;

const FORWARDING_ADDRESS = "bets@getnorma.app";

function EmailImportBanner() {
  const handleCopy = () => {
    Clipboard.setString(FORWARDING_ADDRESS);
    Alert.alert(
      "Copied!",
      `Forward your bet confirmation emails to ${FORWARDING_ADDRESS} and NORMA will import them automatically.`,
      [{ text: "Got it" }],
    );
  };

  return (
    <View style={s.banner}>
      <View style={s.bannerIcon}>
        <Ionicons name="mail" size={20} color="#a855f7" />
      </View>
      <View style={s.bannerBody}>
        <Text style={s.bannerTitle}>Import bets via email</Text>
        <Text style={s.bannerDesc}>
          Forward bet confirmation emails to the address below and NORMA will import them automatically.
        </Text>
        <Pressable style={s.addressRow} onPress={handleCopy} accessibilityRole="button">
          <Text style={s.addressText}>{FORWARDING_ADDRESS}</Text>
          <Ionicons name="copy-outline" size={15} color="#a855f7" style={{ marginLeft: 6 }} />
        </Pressable>
        <Text style={s.bannerHint}>
          Works with DraftKings, FanDuel, BetMGM, Caesars, and more.
        </Text>
      </View>
    </View>
  );
}

function TierABanner() {
  return (
    <View style={s.tierASection}>
      <View style={s.tierAHeader}>
        <Ionicons name="flash" size={14} color="#f59e0b" />
        <Text style={s.tierALabel}>Direct sync — coming soon</Text>
      </View>
      <Text style={s.tierADesc}>
        Automatic bet import directly from your sportsbook account. No email forwarding needed.
      </Text>
      {TIER_A_PROVIDERS.map((provider) => (
        <View key={provider.key} style={s.tierARow}>
          <View style={s.tierAIcon}>
            <Ionicons name={provider.icon} size={18} color="#64748b" />
          </View>
          <Text style={s.tierAName}>{provider.name}</Text>
          <View style={s.tierABadge}>
            <Text style={s.tierABadgeText}>Coming soon</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function SportsbooksScreen() {
  const router = useRouter();
  const { data: providers, isLoading } = useStreamingProviders("sportsbook");
  const { data: connections } = useConnections();

  const sportsbookProviders = (providers ?? []).filter(
    (p) => p.key !== "kalshi" && p.key !== "polymarket"
  );

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#f97316" />
        </Pressable>
        <Text style={s.headerTitle}>Sportsbooks</Text>
      </View>

      <Text style={s.desc}>
        Connect your sportsbooks to log wagers and get personalized alerts for
        games you've bet on.
      </Text>

      {isLoading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : (
        <FlatList
          data={sportsbookProviders}
          keyExtractor={(item) => item.key}
          ListHeaderComponent={
            <>
              <View style={s.tierSection}>
                <Text style={s.tierSectionTitle}>Tier B — Email import</Text>
              </View>
              <EmailImportBanner />
              <View style={s.tierSection}>
                <Text style={s.tierSectionTitle}>Tier C — Manual entry</Text>
              </View>
            </>
          }
          ListFooterComponent={<TierABanner />}
          renderItem={({ item }) => {
            const conn = (connections ?? []).find(
              (c) => c.provider_key === item.key
            );
            return <ConnectionToggle provider={item} connection={conn} />;
          }}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#ffffff", fontSize: 18, fontWeight: "700", marginLeft: 8 },
  desc: { color: "#94a3b8", fontSize: 14, paddingHorizontal: 16, marginBottom: 16 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Email import banner
  banner: {
    flexDirection: "row",
    backgroundColor: "rgba(168, 85, 247, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(168, 85, 247, 0.25)",
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 16,
    gap: 12,
  },
  bannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(168, 85, 247, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bannerBody: { flex: 1 },
  bannerTitle: { color: "#e2e8f0", fontSize: 14, fontWeight: "700", marginBottom: 4 },
  bannerDesc: { color: "#94a3b8", fontSize: 13, lineHeight: 18, marginBottom: 10 },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(168, 85, 247, 0.12)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  addressText: { color: "#a855f7", fontSize: 13, fontWeight: "600" },
  bannerHint: { color: "#64748b", fontSize: 12 },

  // Tier labels
  tierSection: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  tierSectionTitle: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  // Tier A coming soon block
  tierASection: {
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
    backgroundColor: "rgba(30, 41, 59, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(100, 116, 139, 0.2)",
    borderRadius: 16,
    padding: 16,
  },
  tierAHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  tierALabel: {
    color: "#f59e0b",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  tierADesc: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  tierARow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(100, 116, 139, 0.12)",
    gap: 12,
  },
  tierAIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(100, 116, 139, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  tierAName: {
    color: "#64748b",
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  tierABadge: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.25)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tierABadgeText: {
    color: "#f59e0b",
    fontSize: 11,
    fontWeight: "600",
  },
});
