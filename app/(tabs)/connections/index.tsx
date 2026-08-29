import { useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useConnections } from "../../../hooks/useConnections";
import { ImportRosterSheet } from "../../../components/ImportRosterSheet";
import { useFollows } from "../../../hooks/useFollows";

export default function ConnectionsScreen() {
  const router = useRouter();
  const { data: connections } = useConnections();
  const { data: playerFollows } = useFollows("player");
  const [showRosterSheet, setShowRosterSheet] = useState(false);

  const fantasyFollowCount = (playerFollows ?? []).filter(
    (f) => (f as any).source === "fantasy"
  ).length;

  const streamingCount = (connections ?? []).filter(
    (c) => c.provider_type === "streaming" && c.connected
  ).length;
  const tvCount = (connections ?? []).filter(
    (c) => c.provider_type === "tv" && c.connected
  ).length;
  const bookCount = (connections ?? []).filter(
    (c) =>
      c.provider_type === "sportsbook" &&
      c.connected &&
      c.provider_key !== "kalshi" &&
      c.provider_key !== "polymarket" &&
      c.provider_key !== "prizepicks" &&
      c.provider_key !== "underdog"
  ).length;
  const pickEmCount = (connections ?? []).filter(
    (c) =>
      c.connected &&
      (c.provider_key === "prizepicks" || c.provider_key === "underdog")
  ).length;
  const predictionCount = (connections ?? []).filter(
    (c) =>
      c.connected &&
      (c.provider_key === "kalshi" || c.provider_key === "polymarket")
  ).length;

  const sections = [
    {
      title: "Streaming Services",
      subtitle: "Apps where you can watch games",
      icon: "play-circle-outline" as const,
      count: streamingCount,
      route: "/(tabs)/connections/streaming" as const,
    },
    {
      title: "TV Providers",
      subtitle: "Cable, satellite, or live TV streaming",
      icon: "tv-outline" as const,
      count: tvCount,
      route: "/(tabs)/connections/tv-provider" as const,
    },
    {
      title: "Sportsbooks",
      subtitle: "Track your wagers across books",
      icon: "cash-outline" as const,
      count: bookCount,
      route: "/(tabs)/connections/sportsbooks" as const,
    },
    {
      title: "Pick'em & DFS",
      subtitle: "PrizePicks, Underdog, and daily fantasy",
      icon: "football-outline" as const,
      count: pickEmCount,
      route: "/(tabs)/connections/sportsbooks" as const,
    },
    {
      title: "Prediction Markets",
      subtitle: "Kalshi & Polymarket positions",
      icon: "trending-up-outline" as const,
      count: predictionCount,
      route: "/(tabs)/connections/prediction-markets" as const,
    },
  ];

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <ScrollView style={s.flex} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>Connections</Text>
          <Text style={s.headerSubtitle}>
            Connect your services for 1-tap watching
          </Text>
        </View>

        {/* Info card */}
        <View style={s.infoCard}>
          <Ionicons name="information-circle" size={24} color="#f97316" />
          <Text style={s.infoText}>
            Tell us which streaming services and sportsbooks you use. We'll
            show you the right "Watch Now" button, track your wagers, and
            display your prediction market positions.
          </Text>
        </View>

        {/* Section cards */}
        {sections.map((section) => (
          <Pressable
            key={section.title}
            style={s.sectionCard}
            onPress={() => router.push(section.route)}
          >
            <View style={s.sectionIcon}>
              <Ionicons name={section.icon} size={24} color="#f97316" />
            </View>
            <View style={s.sectionText}>
              <Text style={s.sectionTitle}>{section.title}</Text>
              <Text style={s.sectionSubtitle}>{section.subtitle}</Text>
            </View>
            <View style={s.sectionRight}>
              {section.count > 0 && (
                <View style={s.badge}>
                  <Text style={s.badgeText}>{section.count}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={20} color="#64748b" />
            </View>
          </Pressable>
        ))}

        {/* Fantasy Sports section */}
        <View style={s.sectionGroupHeader}>
          <Text style={s.sectionGroupTitle}>Fantasy Sports</Text>
        </View>

        <View style={s.sectionCard}>
          <View style={s.sectionIcon}>
            <Ionicons name="people-outline" size={24} color="#f97316" />
          </View>
          <View style={s.sectionText}>
            <Text style={s.sectionTitle}>Fantasy Roster</Text>
            <Text style={s.sectionSubtitle}>
              Get alerts when your fantasy players hit key moments
            </Text>
            {fantasyFollowCount > 0 && (
              <Text style={s.fantasyCount}>
                {fantasyFollowCount} player{fantasyFollowCount !== 1 ? "s" : ""} followed
              </Text>
            )}
          </View>
          <Pressable
            style={s.importBtn}
            onPress={() => setShowRosterSheet(true)}
          >
            <Text style={s.importBtnText}>Import Roster</Text>
          </Pressable>
        </View>
      </ScrollView>

      {showRosterSheet && (
        <ImportRosterSheet onClose={() => setShowRosterSheet(false)} />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { color: "#ffffff", fontSize: 24, fontWeight: "900" },
  headerSubtitle: { color: "#94a3b8", fontSize: 14, marginTop: 4 },
  infoCard: {
    marginHorizontal: 16,
    marginVertical: 16,
    backgroundColor: "rgba(249, 115, 22, 0.1)",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  infoText: { color: "#cbd5e1", fontSize: 14, marginLeft: 12, flex: 1 },
  sectionCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  sectionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  sectionText: { flex: 1 },
  sectionTitle: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  sectionSubtitle: { color: "#94a3b8", fontSize: 14 },
  sectionRight: { flexDirection: "row", alignItems: "center" },
  badge: {
    backgroundColor: "rgba(249, 115, 22, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    marginRight: 8,
  },
  badgeText: { color: "#fb923c", fontSize: 12, fontWeight: "700" },
  sectionGroupHeader: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  sectionGroupTitle: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  fantasyCount: {
    color: "#22c55e",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  importBtn: {
    backgroundColor: "#f97316",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  importBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
});
