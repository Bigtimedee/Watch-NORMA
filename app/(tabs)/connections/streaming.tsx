import { View, Text, FlatList, ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useStreamingProviders,
  useConnections,
} from "../../../hooks/useConnections";
import { ConnectionToggle } from "../../../components/ConnectionToggle";
import { useAppDetection } from "../../../hooks/useAppDetection";

export default function StreamingScreen() {
  const router = useRouter();
  const { data: providers, isLoading } = useStreamingProviders("streaming");
  const { data: connections } = useConnections("streaming");
  const { detectApps, detecting, detectedCount } = useAppDetection();

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#f97316" />
        </Pressable>
        <Text style={s.headerTitle}>Streaming Services</Text>
      </View>

      <Text style={s.desc}>
        Toggle the services you subscribe to. We'll use this to show you the
        right watch button.
      </Text>

      {/* Auto-detect button */}
      <Pressable
        style={s.detectBtn}
        onPress={detectApps}
        disabled={detecting}
      >
        <Ionicons
          name={detecting ? "hourglass-outline" : "search-outline"}
          size={18}
          color="#f97316"
        />
        <Text style={s.detectText}>
          {detecting
            ? "Detecting..."
            : detectedCount > 0
              ? `Detected ${detectedCount} app${detectedCount !== 1 ? "s" : ""}`
              : "Detect Installed Apps"}
        </Text>
      </Pressable>

      {isLoading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : (
        <FlatList
          data={providers}
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
  desc: { color: "#94a3b8", fontSize: 14, paddingHorizontal: 16, marginBottom: 8 },
  detectBtn: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "rgba(249, 115, 22, 0.1)",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  detectText: { color: "#f97316", fontSize: 14, fontWeight: "600", marginLeft: 8 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
});
