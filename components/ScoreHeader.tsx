import { useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Share, Modal } from "react-native";
import { captureRef } from "react-native-view-shot";
import { Ionicons } from "@expo/vector-icons";
import type { Game } from "../lib/types";
import { formatClock } from "../lib/alert-helpers";
import { LIVE_STATUSES, NORMA_APP_STORE_URL } from "../lib/constants";
import { supabase } from "../lib/supabase";
import { trackEvent } from "../lib/analytics";
import { MomentShareCard } from "./MomentShareCard";
import { formatGameShareCard } from "../lib/formatShareCard";

interface ScoreHeaderProps {
  game: Game;
}

export function ScoreHeader({ game }: ScoreHeaderProps) {
  const isLive = LIVE_STATUSES.includes(game.status as any);
  const isFinal = game.status === "closed";
  const [showShareSheet, setShowShareSheet] = useState(false);
  const shareCardRef = useRef<View>(null);

  const handleShareCapture = async () => {
    if (!shareCardRef.current) return;
    try {
      const uri = await captureRef(shareCardRef, { format: "jpg", quality: 0.92 });
      setShowShareSheet(false);
      await Share.share({ url: uri, message: `Live game via Watch NORMA · ${NORMA_APP_STORE_URL}` });
      trackEvent("share_moment", { source: "game" });
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.from("share_events").insert({
          user_id: session.user.id,
          source: "game",
          game_id: game.id,
        });
      }
    } catch {
      // Non-critical
    }
  };

  return (
    <View style={s.container}>
      {/* Status badge + share button */}
      <View style={s.statusContainer}>
        {game.tournament_round && (
          <Text style={s.tournamentText}>{game.tournament_round}</Text>
        )}
        <View style={s.statusRow}>
          <View style={[s.statusBadge, isLive ? s.statusLive : s.statusDefault]}>
            <Text
              style={[s.statusText, isLive ? s.statusTextLive : s.statusTextDefault]}
            >
              {isLive ? `LIVE \u00B7 ${formatClock(game)}` : formatClock(game)}
            </Text>
          </View>
          <Pressable
            onPress={() => setShowShareSheet(true)}
            style={s.shareBtn}
            accessibilityLabel="Share this game"
          >
            <Ionicons name="share-social-outline" size={18} color="#64748b" />
          </Pressable>
        </View>
      </View>

      {/* Score display */}
      <View style={s.scoreRow}>
        {/* Away team */}
        <View style={s.teamCol}>
          <View style={s.teamLogo}>
            <Text style={s.teamLogoText}>
              {game.away_team?.abbreviation?.slice(0, 4) ?? "AWY"}
            </Text>
          </View>
          <Text style={s.teamName} numberOfLines={2}>
            {game.away_team?.market ?? game.away_team?.name ?? "Away"}
          </Text>
        </View>

        {/* Score */}
        <View style={s.scoreCenterCol}>
          {game.status === "scheduled" ? (
            <Text style={s.vsText}>vs</Text>
          ) : (
            <View style={s.scoreNumbers}>
              <Text
                style={[
                  s.bigScore,
                  isFinal && game.away_score > game.home_score
                    ? s.bigScoreWinner
                    : s.bigScoreDefault,
                ]}
              >
                {game.away_score}
              </Text>
              <Text style={s.scoreSeparator}>-</Text>
              <Text
                style={[
                  s.bigScore,
                  isFinal && game.home_score > game.away_score
                    ? s.bigScoreWinner
                    : s.bigScoreDefault,
                ]}
              >
                {game.home_score}
              </Text>
            </View>
          )}
        </View>

        {/* Home team */}
        <View style={s.teamCol}>
          <View style={s.teamLogo}>
            <Text style={s.teamLogoText}>
              {game.home_team?.abbreviation?.slice(0, 4) ?? "HME"}
            </Text>
          </View>
          <Text style={s.teamName} numberOfLines={2}>
            {game.home_team?.market ?? game.home_team?.name ?? "Home"}
          </Text>
        </View>
      </View>

      {/* Venue + broadcast */}
      <View style={s.infoRow}>
        {game.venue && <Text style={s.venueText}>{game.venue}</Text>}
        {game.broadcast && (
          <Text style={s.broadcastText}>{game.broadcast}</Text>
        )}
      </View>

      {/* Share sheet modal */}
      <Modal
        visible={showShareSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowShareSheet(false)}
      >
        <Pressable style={s.modalOverlay} onPress={() => setShowShareSheet(false)}>
          <Pressable style={s.shareSheet} onPress={() => {}}>
            <Text style={s.shareSheetTitle}>Share This Game</Text>
            <View style={s.shareCardPreview}>
              <MomentShareCard ref={shareCardRef} data={formatGameShareCard(game)} />
            </View>
            <Pressable style={s.shareActionBtn} onPress={handleShareCapture} accessibilityLabel="Share">
              <Ionicons name="share-social" size={16} color="#fff" />
              <Text style={s.shareActionText}>Share</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  statusContainer: { alignItems: "center", marginBottom: 16 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tournamentText: { color: "#fb923c", fontSize: 12, fontWeight: "700", marginBottom: 4 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 9999 },
  statusLive: { backgroundColor: "rgba(239, 68, 68, 0.2)" },
  statusDefault: { backgroundColor: "#334155" },
  statusText: { fontSize: 14, fontWeight: "700" },
  statusTextLive: { color: "#f87171" },
  statusTextDefault: { color: "#cbd5e1" },
  scoreRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  teamCol: { flex: 1, alignItems: "center" },
  teamLogo: {
    width: 64,
    height: 64,
    borderRadius: 9999,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  teamLogoText: { color: "#ffffff", fontSize: 18, fontWeight: "700" },
  teamName: { color: "#ffffff", fontSize: 14, fontWeight: "500", textAlign: "center" },
  scoreCenterCol: { marginHorizontal: 16, alignItems: "center" },
  vsText: { color: "#94a3b8", fontSize: 18, fontWeight: "500" },
  scoreNumbers: { flexDirection: "row", alignItems: "baseline" },
  bigScore: { fontSize: 36, fontWeight: "700" },
  bigScoreWinner: { color: "#fb923c" },
  bigScoreDefault: { color: "#ffffff" },
  scoreSeparator: { color: "#64748b", fontSize: 24, fontWeight: "700", marginHorizontal: 8 },
  infoRow: { alignItems: "center", marginTop: 16 },
  venueText: { color: "#94a3b8", fontSize: 12 },
  broadcastText: { color: "#64748b", fontSize: 12, marginTop: 4 },
  shareBtn: { padding: 6 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  shareSheet: {
    backgroundColor: "#1e293b",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  shareSheetTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 16,
  },
  shareCardPreview: {
    alignItems: "center",
    marginBottom: 16,
  },
  shareActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f97316",
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  shareActionText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
