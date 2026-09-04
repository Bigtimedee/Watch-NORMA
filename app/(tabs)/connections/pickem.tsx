import { View, Text, FlatList, ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useStreamingProviders,
  useConnections,
} from "../../../hooks/useConnections";
import { ConnectionToggle } from "../../../components/ConnectionToggle";
import { isPickEmProvider } from "../../../lib/fantasy-platforms";

export default function PickEmScreen() {
  const router = useRouter();
  const { data: sportsbookProviders, isLoading: loadingBooks } =
    useStreamingProviders("sportsbook");
  const { data: connections } = useConnections();

  const pickEmProviders = (sportsbookProviders ?? []).filter(
    (p) => isPickEmProvider(p.key) || p.category === "dfs_pickem"
  );

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#f97316" />
        </Pressable>
        <Text style={s.headerTitle}>Pick&apos;em &amp; DFS</Text>
      </View>

      <Text style={s.desc}>
        Mark the pick&apos;em apps you use. NORMA does not have a live API to
        PrizePicks or Underdog — connect here, then import your entry from
        Connections → Fantasy Roster, or scan an entry slip.
      </Text>

      {loadingBooks ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : pickEmProviders.length === 0 ? (
        <Text style={s.empty}>
          PrizePicks and Underdog are not in the provider catalog yet. You can
          still import player names from Fantasy Roster.
        </Text>
      ) : (
        <FlatList
          data={pickEmProviders}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#ffffff", fontSize: 18, fontWeight: "700", marginLeft: 8 },
  desc: { color: "#94a3b8", fontSize: 14, paddingHorizontal: 16, marginBottom: 16 },
  empty: { color: "#94a3b8", fontSize: 14, paddingHorizontal: 16, lineHeight: 20 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
});
