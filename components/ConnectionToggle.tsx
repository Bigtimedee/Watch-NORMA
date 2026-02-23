import { View, Text, Pressable, Switch, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import type { StreamingProvider, Connection } from "../lib/types";
import { useToggleConnection } from "../hooks/useConnections";

interface ConnectionToggleProps {
  provider: StreamingProvider;
  connection?: Connection;
}

export function ConnectionToggle({
  provider,
  connection,
}: ConnectionToggleProps) {
  const toggleMutation = useToggleConnection();
  const isConnected = connection?.connected ?? false;

  const handleToggle = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleMutation.mutate({ provider, currentConnection: connection });
  };

  return (
    <Pressable style={s.card} onPress={handleToggle} accessibilityLabel={`${provider.name}, ${isConnected ? "connected" : "not connected"}`}>
      <View style={s.info}>
        <View style={s.icon}>
          <Text style={s.iconText}>
            {provider.name.slice(0, 3).toUpperCase()}
          </Text>
        </View>
        <View style={s.textCol}>
          <Text style={s.name}>{provider.name}</Text>
          <Text style={s.type}>{provider.provider_type}</Text>
        </View>
      </View>

      <Switch
        value={isConnected}
        onValueChange={handleToggle}
        trackColor={{ false: "#475569", true: "#f97316" }}
        thumbColor="#fff"
        disabled={toggleMutation.isPending}
      />
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    marginHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  info: { flexDirection: "row", alignItems: "center", flex: 1 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  iconText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  textCol: { flex: 1 },
  name: { color: "#ffffff", fontSize: 16, fontWeight: "500" },
  type: { color: "#94a3b8", fontSize: 12, textTransform: "capitalize" },
});
