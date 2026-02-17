import { View, Text, FlatList, ActivityIndicator, Pressable } from "react-native";
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

  return (
    <SafeAreaView className="flex-1 bg-court-dark" edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center"
        >
          <Ionicons name="chevron-back" size={24} color="#f97316" />
        </Pressable>
        <Text className="text-white text-lg font-bold ml-2">Sportsbooks</Text>
      </View>

      <Text className="text-slate-400 text-sm px-4 mb-2">
        Connect your sportsbooks to get personalized alerts for games you've
        wagered on.
      </Text>

      <View className="mx-4 mb-4 bg-court-card rounded-xl p-3 flex-row items-center">
        <Ionicons name="construct-outline" size={18} color="#f97316" />
        <Text className="text-slate-400 text-xs ml-2 flex-1">
          Full sportsbook integration coming in v1.1. For now, toggle the
          services you use.
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color="#f97316" className="mt-10" />
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
