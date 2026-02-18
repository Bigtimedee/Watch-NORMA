import { View, Text, FlatList, ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useStreamingProviders,
  useConnections,
} from "../../../hooks/useConnections";
import { ConnectionToggle } from "../../../components/ConnectionToggle";

export default function SportsbooksScreen() {
  const router = useRouter();
  const { data: providers, isLoading } = useStreamingProviders("sportsbook");
  const { data: connections } = useConnections("sportsbook");

  // Filter out prediction market providers from the sportsbooks list
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
});
