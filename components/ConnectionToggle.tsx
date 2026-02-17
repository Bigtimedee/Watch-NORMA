import { View, Text, Pressable, Switch } from "react-native";
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
    <Pressable
      className="bg-court-card rounded-xl p-4 mb-2 mx-4 flex-row items-center justify-between"
      onPress={handleToggle}
    >
      <View className="flex-row items-center flex-1">
        <View className="w-10 h-10 rounded-lg bg-court-surface items-center justify-center mr-3">
          <Text className="text-white text-xs font-bold">
            {provider.name.slice(0, 3).toUpperCase()}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-white text-base font-medium">
            {provider.name}
          </Text>
          <Text className="text-slate-400 text-xs capitalize">
            {provider.provider_type}
          </Text>
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
