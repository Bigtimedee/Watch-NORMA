import { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";

const normaLogo = require("../../../assets/norma-logo.png");
import { SafeAreaView } from "react-native-safe-area-context";
import { useGames, useFollowedGames } from "../../../hooks/useGames";
import { GameCard } from "../../../components/GameCard";
import DatePicker, { offsetToDateStr } from "../../../components/DatePicker";
import { LIVE_STATUSES } from "../../../lib/constants";
import type { SportKey } from "../../../lib/types";

type Tab = "all" | "live" | "following";

export default function GamesScreen() {
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [selectedOffset, setSelectedOffset] = useState<number>(0);
  const [selectedSport, setSelectedSport] = useState<SportKey | undefined>(undefined);

  const selectedDateStr = offsetToDateStr(selectedOffset);

  const {
    data: allGames,
    isLoading,
    refetch,
    isRefetching,
  } = useGames(selectedDateStr, selectedSport);
  const { data: followedGamesRaw } = useFollowedGames();

  const toEasternDateStr = (isoStr: string): string => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(isoStr));
    const y = parts.find((p) => p.type === "year")!.value;
    const m = parts.find((p) => p.type === "month")!.value;
    const d = parts.find((p) => p.type === "day")!.value;
    return `${y}-${m}-${d}`;
  };

  // Filter followed games to the selected date using Eastern timezone
  const followedGames = (followedGamesRaw ?? []).filter(
    (g) =>
      toEasternDateStr(g.scheduled_at) === selectedDateStr &&
      (selectedSport === undefined || g.sport === selectedSport)
  );

  // When navigating away from today, force off the Live tab
  useEffect(() => {
    if (selectedOffset !== 0 && activeTab === "live") {
      setActiveTab("all");
    }
  }, [selectedOffset, activeTab]);

  const games = (() => {
    switch (activeTab) {
      case "live":
        return (allGames ?? []).filter((g) =>
          LIVE_STATUSES.includes(g.status as any)
        );
      case "following":
        return followedGames;
      default:
        return allGames ?? [];
    }
  })();

  const liveCount = (allGames ?? []).filter((g) =>
    LIVE_STATUSES.includes(g.status as any)
  ).length;

  const selectedDayName = new Date(
    selectedDateStr + "T12:00:00"
  ).toLocaleDateString("en-US", { weekday: "long" });

  const SPORT_PILLS: Array<{ key: SportKey | undefined; label: string }> = [
    { key: undefined, label: "All Sports" },
    { key: "ncaam",  label: "NCAA" },
    { key: "nba",    label: "NBA" },
    { key: "mlb",    label: "MLB" },
    { key: "ncaaf",  label: "NCAAF" },
    { key: "nfl",    label: "NFL" },
  ];

  const selectedSportLabel =
    selectedSport === "ncaam" ? "NCAA" :
    selectedSport === "nba"   ? "NBA" :
    selectedSport === "mlb"   ? "MLB" :
    selectedSport === "ncaaf" ? "NCAAF" :
    selectedSport === "nfl"   ? "NFL" :
    null;

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Image source={normaLogo} style={s.headerLogo} resizeMode="contain" />
        <Text style={s.headerDate}>
          {new Date(selectedDateStr + "T12:00:00").toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </Text>
      </View>

      {/* Date picker */}
      <DatePicker
        selectedOffset={selectedOffset}
        onSelectOffset={setSelectedOffset}
      />

      {/* Sport selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.sportRow}
      >
        {SPORT_PILLS.map((pill) => {
          const isActive = pill.key === selectedSport;
          return (
            <Pressable
              key={pill.key ?? "all"}
              style={[s.sportPill, isActive ? s.sportPillActive : s.sportPillInactive]}
              onPress={() => setSelectedSport(pill.key)}
              accessibilityRole="button"
              accessibilityLabel={pill.label}
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[s.sportPillText, isActive ? s.sportPillTextActive : s.sportPillTextInactive]}>
                {pill.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Tabs */}
      <View style={s.tabs}>
        {(
          [
            { key: "all", label: "All Games" },
            ...(selectedOffset === 0
              ? [
                  {
                    key: "live" as Tab,
                    label: `Live${liveCount > 0 ? ` (${liveCount})` : ""}`,
                  },
                ]
              : []),
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
                    : selectedOffset !== 0
                      ? `No ${selectedSportLabel ? selectedSportLabel + " " : ""}games on ${selectedDayName}.`
                      : `No ${selectedSportLabel ? selectedSportLabel + " " : ""}games scheduled today.`}
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
  sportRow: { flexDirection: "row", paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  sportPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 9999 },
  sportPillActive: { backgroundColor: "#f97316" },
  sportPillInactive: { backgroundColor: "#1e293b" },
  sportPillText: { fontSize: 13, fontWeight: "600" },
  sportPillTextActive: { color: "#ffffff" },
  sportPillTextInactive: { color: "#94a3b8" },
});
