import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAlerts } from "../../../hooks/useAlerts";
import { AlertCard } from "../../../components/AlertCard";
import { useSport } from "../../../lib/sport-context";

export default function AlertsScreen() {
  const { selectedSport } = useSport();
  const { data: alerts, isLoading, error, refetch, isRefetching } = useAlerts(selectedSport);

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Alerts</Text>
        <Text style={s.headerSubtitle}>
          Key moments from your followed games
        </Text>
      </View>

      {isLoading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : error ? (
        <View style={s.loadingContainer}>
          <Text style={s.errorText}>Failed to load alerts.</Text>
          <Pressable style={s.retryBtn} onPress={() => refetch()}>
            <Text style={s.retryText}>Try Again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <AlertCard alert={item} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#f97316"
            />
          }
          ListEmptyComponent={
            <View style={s.emptyContainer}>
              <Ionicons
                name="notifications-off-outline"
                size={48}
                color="#475569"
              />
              <Text style={s.emptyTitle}>No alerts yet</Text>
              <Text style={s.emptyDesc}>
                Follow games in the Games tab to receive alerts for close games,
                big runs, and other key moments.
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 },
  headerTitle: { color: "#ffffff", fontSize: 24, fontWeight: "900" },
  headerSubtitle: { color: "#94a3b8", fontSize: 14, marginTop: 4 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: { color: "#94a3b8", fontSize: 16, textAlign: "center", marginTop: 16 },
  emptyDesc: { color: "#64748b", fontSize: 14, textAlign: "center", marginTop: 8 },
  errorText: { color: "#94a3b8", fontSize: 16, textAlign: "center", marginBottom: 16 },
  retryBtn: {
    backgroundColor: "#f97316",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
});
