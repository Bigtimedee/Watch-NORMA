import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useGameDetail, useGameFollow } from "../../../hooks/useGameDetail";
import { useWagers } from "../../../hooks/useWagers";
import { useBetSlipScanner, type ScanResult } from "../../../hooks/useBetSlipScanner";
import { ScoreHeader } from "../../../components/ScoreHeader";
import { FootballScoreboard } from "../../../components/FootballScoreboard";
import { WatchNowButton } from "../../../components/WatchNowButton";
import { OddsDisplay } from "../../../components/OddsDisplay";
import { WagerCard } from "../../../components/WagerCard";
import { AddWagerSheet } from "../../../components/AddWagerSheet";
import { ReviewScannedWagersSheet } from "../../../components/ReviewScannedWagersSheet";
import { MarketPrices } from "../../../components/MarketPrices";
import { LIVE_STATUSES } from "../../../lib/constants";
import { formatPeriodLabel } from "../../../lib/alert-helpers";

export default function GameDetailScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const router = useRouter();
  const { data: game, isLoading, error, refetch } = useGameDetail(gameId);
  const { isFollowing, toggleFollow, isToggling } = useGameFollow(gameId);
  const { data: wagers } = useWagers(gameId);
  const { scanBetSlip, isScanning } = useBetSlipScanner();
  const [showAddWager, setShowAddWager] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  const handleScanSlip = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await scanBetSlip(gameId);
    if (result) {
      setScanResult(result);
    }
  };

  if (isLoading || !game) {
    if (error && !isLoading) {
      return (
        <SafeAreaView style={s.loadingContainer}>
          <Text style={s.errorText}>Failed to load game details.</Text>
          <Pressable style={s.retryBtn} onPress={() => refetch()}>
            <Text style={s.retryText}>Try Again</Text>
          </Pressable>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={s.loadingContainer}>
        <ActivityIndicator size="large" color="#f97316" />
      </SafeAreaView>
    );
  }

  const isLive = LIVE_STATUSES.includes(game.status as any);

  const handleFollow = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toggleFollow();
  };

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.headerBtn}>
          <Ionicons name="chevron-back" size={24} color="#f97316" />
        </Pressable>
        <Text style={s.headerTitle}>Game Detail</Text>
        <Pressable onPress={handleFollow} disabled={isToggling} style={s.headerBtn}>
          <Ionicons
            name={isFollowing ? "heart" : "heart-outline"}
            size={24}
            color={isFollowing ? "#f97316" : "#64748b"}
          />
        </Pressable>
      </View>

      <ScrollView style={s.flex} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Score */}
        <ScoreHeader game={game} />

        {/* Football scoreboard — quarter line score, possession, scoring plays */}
        {(game.sport === "ncaaf" || game.sport === "nfl") && (
          <FootballScoreboard
            game={game}
            sport={game.sport}
          />
        )}

        {/* Odds */}
        <OddsDisplay gameId={gameId} />

        {/* Watch Now */}
        {(isLive || game.broadcast) && <WatchNowButton game={game} />}

        {/* Your Wagers */}
        <View style={s.wagerSection}>
          <View style={s.wagerHeader}>
            <Text style={s.sectionLabel}>Your Wagers</Text>
            <View style={s.wagerActions}>
              <Pressable
                style={s.scanSlipBtn}
                onPress={handleScanSlip}
                disabled={isScanning}
              >
                {isScanning ? (
                  <ActivityIndicator size={14} color="#a855f7" />
                ) : (
                  <Ionicons name="scan-outline" size={16} color="#a855f7" />
                )}
                <Text style={s.scanSlipText}>Scan Slip</Text>
              </Pressable>
              <Pressable
                style={s.logWagerBtn}
                onPress={() => setShowAddWager(true)}
              >
                <Ionicons name="add" size={16} color="#f97316" />
                <Text style={s.logWagerText}>Log Wager</Text>
              </Pressable>
            </View>
          </View>
          {(wagers ?? []).length > 0 ? (
            (wagers ?? []).map((w) => <WagerCard key={w.id} wager={w} />)
          ) : (
            <Text style={s.emptyText}>
              No wagers logged for this game yet.
            </Text>
          )}
        </View>

        {/* Prediction Markets */}
        <MarketPrices gameId={gameId} />

        {/* Follow CTA */}
        <Pressable
          style={[s.followBtn, isFollowing && s.followBtnActive]}
          onPress={handleFollow}
          disabled={isToggling}
        >
          <Ionicons
            name={isFollowing ? "heart" : "heart-outline"}
            size={20}
            color={isFollowing ? "#f97316" : "#94a3b8"}
          />
          <Text style={[s.followText, isFollowing ? s.followTextActive : s.followTextDefault]}>
            {isFollowing ? "Following This Game" : "Follow This Game"}
          </Text>
        </Pressable>

        {/* Game info cards */}
        <View style={s.infoSection}>
          <Text style={s.sectionLabel}>Game Info</Text>

          <View style={s.infoCard}>
            {(
              [
                ["Status", game.status.charAt(0).toUpperCase() + game.status.slice(1)],
                ["Scheduled", new Date(game.scheduled_at).toLocaleString()],
                game.venue ? ["Venue", game.venue] : null,
                game.broadcast ? ["Broadcast", game.broadcast] : null,
                game.tournament_round ? ["Round", game.tournament_round] : null,
                game.period ? ["Period", formatPeriodLabel(game.sport, game.period)] : null,
              ].filter((item): item is [string, string] => item !== null)
            ).map(([label, value], i) => (
              <View
                key={label}
                style={[s.infoRow, i > 0 && s.infoRowBorder]}
              >
                <Text style={s.infoLabel}>{label}</Text>
                <Text style={s.infoValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Following indicator */}
        {isFollowing && (
          <View style={s.alertBanner}>
            <View style={s.alertBannerInner}>
              <Ionicons name="notifications" size={20} color="#f97316" />
              <Text style={s.alertBannerText}>
                You'll receive alerts for key moments in this game.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Add Wager Sheet */}
      {showAddWager && (
        <AddWagerSheet game={game} onClose={() => setShowAddWager(false)} />
      )}

      {/* Review Scanned Wagers Sheet */}
      {scanResult && (
        <ReviewScannedWagersSheet
          game={game}
          wagers={scanResult.wagers}
          confidence={scanResult.confidence}
          onClose={() => setScanResult(null)}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  flex: { flex: 1 },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#ffffff", fontSize: 18, fontWeight: "700" },
  wagerSection: { marginHorizontal: 16, marginBottom: 16 },
  wagerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  wagerActions: { flexDirection: "row", gap: 8 },
  scanSlipBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(168, 85, 247, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  scanSlipText: { color: "#a855f7", fontSize: 13, fontWeight: "600", marginLeft: 4 },
  logWagerBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(249, 115, 22, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  logWagerText: { color: "#f97316", fontSize: 13, fontWeight: "600", marginLeft: 4 },
  emptyText: { color: "#64748b", fontSize: 14 },
  followBtn: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1e293b",
  },
  followBtnActive: { borderWidth: 1, borderColor: "rgba(249, 115, 22, 0.3)" },
  followText: { marginLeft: 8, fontSize: 16, fontWeight: "600" },
  followTextActive: { color: "#fb923c" },
  followTextDefault: { color: "#cbd5e1" },
  infoSection: { marginHorizontal: 16 },
  sectionLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  infoCard: { backgroundColor: "#1e293b", borderRadius: 16, padding: 16 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12 },
  infoRowBorder: { borderTopWidth: 1, borderTopColor: "#475569" },
  infoLabel: { color: "#94a3b8", fontSize: 14 },
  infoValue: { color: "#ffffff", fontSize: 14, fontWeight: "500" },
  alertBanner: { marginHorizontal: 16, marginTop: 16 },
  alertBannerInner: {
    backgroundColor: "rgba(249, 115, 22, 0.1)",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  alertBannerText: { color: "#fb923c", fontSize: 14, marginLeft: 12, flex: 1 },
  errorText: { color: "#94a3b8", fontSize: 16, textAlign: "center", marginBottom: 16 },
  retryBtn: {
    backgroundColor: "#f97316",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
});
