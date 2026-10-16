import { View, Text, FlatList, ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useStreamingProviders,
  useConnections,
} from "../../../hooks/useConnections";
import { ConnectionToggle } from "../../../components/ConnectionToggle";
import { useToggleConnection } from "../../../hooks/useConnections";
import { useInstalledApps } from "../../../hooks/useInstalledApps";
import { suggestInstalledProviders } from "../../../lib/installed-apps";

export default function StreamingScreen() {
  const router = useRouter();
  const { data: providers, isLoading } = useStreamingProviders("streaming");
  const { data: connections } = useConnections();
  const installed = useInstalledApps(providers);
  const toggle = useToggleConnection();
  const connectedKeys = (connections ?? []).filter((c) => c.connected).map((c) => c.provider_key);
  // Installed apps the user hasn't toggled on yet. Empty on web/Android
  // (detection unsupported), so the section simply doesn't render there.
  const suggestions = suggestInstalledProviders(providers ?? [], connectedKeys, installed);

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

      {suggestions.length > 0 && (
        <View style={s.suggestBox} testID="installed-suggestions">
          <Text style={s.suggestTitle}>Found on your phone</Text>
          {suggestions.map((p) => (
            <View key={p.key} style={s.suggestRow}>
              <Text style={s.suggestName}>{p.name}</Text>
              <Pressable
                accessibilityLabel={`Add ${p.name}`}
                style={s.suggestBtn}
                disabled={toggle.isPending}
                onPress={() =>
                  toggle.mutate({
                    provider: p,
                    currentConnection: (connections ?? []).find((c) => c.provider_key === p.key),
                  })
                }
              >
                <Text style={s.detectText}>Add</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

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
            return (
              <ConnectionToggle
                provider={item}
                connection={conn}
                appInstalled={installed[item.key]}
              />
            );
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
  suggestBox: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "rgba(249, 115, 22, 0.1)",
    borderRadius: 12,
    padding: 12,
  },
  suggestTitle: { color: "#f97316", fontSize: 13, fontWeight: "700", marginBottom: 6 },
  suggestRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  suggestName: { color: "#ffffff", fontSize: 14 },
  suggestBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: "#f97316" },
  detectText: { color: "#f97316", fontSize: 14, fontWeight: "600" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
});
