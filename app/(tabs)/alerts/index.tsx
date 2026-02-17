import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAlerts } from "../../../hooks/useAlerts";
import { AlertCard } from "../../../components/AlertCard";

export default function AlertsScreen() {
  const { data: alerts, isLoading, refetch, isRefetching } = useAlerts();

  return (
    <SafeAreaView className="flex-1 bg-court-dark" edges={["top"]}>
      {/* Header */}
      <View className="px-4 pt-4 pb-4">
        <Text className="text-white text-2xl font-black">Alerts</Text>
        <Text className="text-slate-400 text-sm mt-1">
          Key moments from your followed games
        </Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#f97316" />
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
            <View className="flex-1 items-center justify-center py-20 px-8">
              <Ionicons
                name="notifications-off-outline"
                size={48}
                color="#475569"
              />
              <Text className="text-slate-400 text-base text-center mt-4">
                No alerts yet
              </Text>
              <Text className="text-slate-500 text-sm text-center mt-2">
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
