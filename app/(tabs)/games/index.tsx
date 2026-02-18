import { useState } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";

const normaLogo = require("../../../assets/norma-logo.png");
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
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Image source={normaLogo} style={s.headerLogo} resizeMode="contain" />
        <Text style={s.headerDate}>
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </Text>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
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
            style={[s.tab, activeTab === tab.key ? s.tabActive : s.tabInactive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              style={[
                s.tabText,
                activeTab === tab.key ? s.tabTextActive : s.tabTextInactive,
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Games list */}
      {isLoading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color="#f97316" />
          <Text style={s.loadingText}>Loading games...</Text>
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
            <View style={s.emptyContainer}>
              <Text style={s.emptyText}>
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  headerLogo: { width: 140, height: 47 },
  headerDate: { color: "#94a3b8", fontSize: 14, marginTop: 4 },
  tabs: { flexDirection: "row", paddingHorizontal: 16, marginBottom: 16 },
  tab: { marginRight: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9999 },
  tabActive: { backgroundColor: "#f97316" },
  tabInactive: { backgroundColor: "#1e293b" },
  tabText: { fontSize: 14, fontWeight: "600" },
  tabTextActive: { color: "#ffffff" },
  tabTextInactive: { color: "#94a3b8" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: "#94a3b8", marginTop: 16 },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80 },
  emptyText: { color: "#94a3b8", fontSize: 16, textAlign: "center" },
});
