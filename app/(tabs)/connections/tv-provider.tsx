import { View, Text, FlatList, ActivityIndicator, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useStreamingProviders,
  useConnections,
} from "../../../hooks/useConnections";
import { ConnectionToggle } from "../../../components/ConnectionToggle";

export default function TVProviderScreen() {
  const router = useRouter();
  const { data: providers, isLoading } = useStreamingProviders("tv");
  const { data: connections } = useConnections("tv");

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
        <Text className="text-white text-lg font-bold ml-2">TV Providers</Text>
      </View>

      <Text className="text-slate-400 text-sm px-4 mb-4">
        Select your cable, satellite, or live TV streaming provider.
      </Text>

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
