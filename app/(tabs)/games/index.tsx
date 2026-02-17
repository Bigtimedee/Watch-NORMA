import { useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useGames, useFollowedGames } from "../../../hooks/useGames";
import { GameCard } from "../../../components/GameCard";
import { LIVE_STATUSES } from "../../../lib/constants";

type Tab = "all" | "live" | "following";

export default function GamesScreen() {
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const {
    data: allGames,
    isLoading,
    refetch,
    isRefetching,
  } = useGames();
  const { data: followedGames } = useFollowedGames();

  const games = (() => {
    switch (activeTab) {
      case "live":
        return (allGames ?? []).filter((g) =>
          LIVE_STATUSES.includes(g.status as any)
        );
      case "following":
        return followedGames ?? [];
      default:
        return allGames ?? [];
    }
  })();

  const liveCount = (allGames ?? []).filter((g) =>
    LIVE_STATUSES.includes(g.status as any)
  ).length;

  return (
    <SafeAreaView className="flex-1 bg-court-dark" edges={["top"]}>
      {/* Header */}
      <View className="px-4 pt-4 pb-2">
        <Text className="text-white text-2xl font-black">Games</Text>
        <Text className="text-slate-400 text-sm mt-1">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </Text>
      </View>

      {/* Tabs */}
      <View className="flex-row px-4 mb-4">
        {(
          [
            { key: "all", label: "All Games" },
            {
              key: "live",
              label: `Live${liveCount > 0 ? ` (${liveCount})` : ""}`,
            },
            { key: "following", label: "Following" },
          ] as const
        ).map((tab) => (
          <Pressable
            key={tab.key}
            className={`mr-3 px-4 py-2 rounded-full ${
              activeTab === tab.key ? "bg-brand-500" : "bg-court-card"
            }`}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              className={`text-sm font-semibold ${
                activeTab === tab.key ? "text-white" : "text-slate-400"
              }`}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Games list */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#f97316" />
          <Text className="text-slate-400 mt-4">Loading games...</Text>
        </View>
      ) : (
        <FlatList
          data={games}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <GameCard game={item} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#f97316"
            />
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-20">
              <Text className="text-slate-400 text-base text-center">
                {activeTab === "following"
                  ? "No followed games yet.\nTap a game to follow it!"
                  : activeTab === "live"
                    ? "No live games right now."
                    : "No games scheduled today."}
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </SafeAreaView>
  );
}
