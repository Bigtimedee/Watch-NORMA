// ReviewEmailWagersSheet — shows wagers imported from email confirmations.
// Displays wagers with source='email_parse' that are in 'active' status
// and haven't been reviewed yet (no reviewed_at timestamp — tracked client-side
// via a simple local dismissed state, since we don't add a DB column for this).
//
// The user can:
//   - See what was imported and from which sportsbook
//   - Delete individual wagers they don't want
//   - Dismiss the sheet (wagers stay active and appear in their wager history)

import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { SPORTSBOOK_NAMES } from "../lib/constants";

interface EmailWager {
  id: number;
  description: string;
  wager_type: string;
  sportsbook: string;
  odds?: string;
  stake?: number;
  potential_payout?: number;
  legs?: Array<{ description: string; odds?: string }>;
  created_at: string;
}

interface ReviewEmailWagersSheetProps {
  onClose: () => void;
}

function useEmailImportedWagers() {
  return useQuery<EmailWager[]>({
    queryKey: ["wagers-email-recent"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Show email_parse wagers created in the last 24 hours
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from("wagers")
        .select("id, description, wager_type, sportsbook, odds, stake, potential_payout, legs, created_at")
        .eq("user_id", user.id)
        .eq("source", "email_parse")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as EmailWager[];
    },
    staleTime: 30_000,
  });
}

function useDeleteWager() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (wagerId: number) => {
      const { error } = await supabase
        .from("wagers")
        .delete()
        .eq("id", wagerId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wagers"] });
      qc.invalidateQueries({ queryKey: ["wagers-email-recent"] });
    },
  });
}

function WagerRow({ wager, onDelete }: { wager: EmailWager; onDelete: () => void }) {
  const isParlay = wager.wager_type === "parlay" && Array.isArray(wager.legs) && wager.legs.length > 0;
  const bookName = SPORTSBOOK_NAMES[wager.sportsbook] ?? wager.sportsbook;

  return (
    <View style={s.wagerRow}>
      <View style={s.wagerRowTop}>
        <View style={s.bookBadge}>
          <Text style={s.bookBadgeText}>{bookName}</Text>
        </View>
        <Pressable onPress={onDelete} hitSlop={8} style={s.deleteBtn}>
          <Ionicons name="trash-outline" size={16} color="#ef4444" />
        </Pressable>
      </View>

      <Text style={s.wagerDesc}>{wager.description}</Text>

      <View style={s.wagerMeta}>
        {wager.odds ? (
          <View style={s.metaChip}>
            <Text style={s.metaChipText}>{wager.odds}</Text>
          </View>
        ) : null}
        {wager.stake != null ? (
          <View style={s.metaChip}>
            <Text style={s.metaChipText}>${wager.stake.toFixed(2)}</Text>
          </View>
        ) : null}
        {wager.potential_payout != null ? (
          <View style={[s.metaChip, s.metaChipGreen]}>
            <Text style={[s.metaChipText, s.metaChipTextGreen]}>
              to win ${wager.potential_payout.toFixed(2)}
            </Text>
          </View>
        ) : null}
      </View>

      {isParlay && (
        <View style={s.legsList}>
          {wager.legs!.map((leg, i) => (
            <View key={i} style={s.legRow}>
              <Ionicons name="arrow-forward" size={12} color="#64748b" style={{ marginTop: 1 }} />
              <Text style={s.legText}>{leg.description}</Text>
              {leg.odds ? <Text style={s.legOdds}>{leg.odds}</Text> : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function ReviewEmailWagersSheet({ onClose }: ReviewEmailWagersSheetProps) {
  const { data: wagers = [], isLoading } = useEmailImportedWagers();
  const deleteWager = useDeleteWager();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleDelete = (wagerId: number, description: string) => {
    Alert.alert(
      "Remove Wager",
      `Remove "${description}" from your wager history?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setDeletingId(wagerId);
            try {
              await deleteWager.mutateAsync(wagerId);
            } catch {
              Alert.alert("Error", "Failed to remove wager. Please try again.");
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={s.overlay}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.handle} />

        <View style={s.header}>
          <View>
            <Text style={s.title}>Imported Bets</Text>
            <Text style={s.subtitle}>From forwarded confirmation emails</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={24} color="#94a3b8" />
          </Pressable>
        </View>

        {isLoading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator color="#a855f7" />
          </View>
        ) : wagers.length === 0 ? (
          <View style={s.emptyWrap}>
            <Ionicons name="mail-open-outline" size={40} color="#334155" />
            <Text style={s.emptyTitle}>No recent imports</Text>
            <Text style={s.emptyDesc}>
              Forward bet confirmation emails to bets@getnorma.app and they'll appear here.
            </Text>
          </View>
        ) : (
          <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: 32 }}>
            <View style={s.infoBanner}>
              <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
              <Text style={s.infoBannerText}>
                {wagers.length} bet{wagers.length !== 1 ? "s" : ""} imported — added to your wager history.
              </Text>
            </View>

            {wagers.map((w) => (
              <View key={w.id} style={deletingId === w.id ? s.deletingWrap : undefined}>
                {deletingId === w.id ? (
                  <View style={s.deletingOverlay}>
                    <ActivityIndicator size="small" color="#ef4444" />
                  </View>
                ) : null}
                <WagerRow
                  wager={w}
                  onDelete={() => handleDelete(w.id, w.description)}
                />
              </View>
            ))}

            <Pressable style={s.doneBtn} onPress={onClose}>
              <Text style={s.doneBtnText}>Done</Text>
            </Pressable>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: "flex-end",
    zIndex: 100,
  },
  backdrop: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: "#1e293b",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    paddingBottom: 8,
  },
  handle: {
    width: 40, height: 4,
    backgroundColor: "#475569",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title:    { color: "#ffffff", fontSize: 18, fontWeight: "700" },
  subtitle: { color: "#64748b", fontSize: 13, marginTop: 2 },

  loadingWrap: { alignItems: "center", paddingVertical: 40 },

  emptyWrap: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 32 },
  emptyTitle: { color: "#e2e8f0", fontSize: 16, fontWeight: "700", marginTop: 12 },
  emptyDesc:  { color: "#64748b", fontSize: 14, textAlign: "center", marginTop: 6, lineHeight: 20 },

  list: { paddingHorizontal: 16 },

  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(34, 197, 94, 0.08)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  infoBannerText: { color: "#86efac", fontSize: 13, flex: 1 },

  wagerRow: {
    backgroundColor: "#0f172a",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  wagerRowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  bookBadge: {
    backgroundColor: "#1e293b",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#334155",
  },
  bookBadgeText: { color: "#94a3b8", fontSize: 11, fontWeight: "600" },
  deleteBtn: { padding: 4 },

  wagerDesc: { color: "#e2e8f0", fontSize: 15, fontWeight: "600", marginBottom: 8 },

  wagerMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaChip: {
    backgroundColor: "#334155",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metaChipText: { color: "#cbd5e1", fontSize: 12, fontWeight: "600" },
  metaChipGreen: { backgroundColor: "rgba(34, 197, 94, 0.12)" },
  metaChipTextGreen: { color: "#22c55e" },

  legsList: { marginTop: 10, gap: 4 },
  legRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  legText: { color: "#94a3b8", fontSize: 13, flex: 1 },
  legOdds: { color: "#64748b", fontSize: 12 },

  deletingWrap: { opacity: 0.5 },
  deletingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },

  doneBtn: {
    backgroundColor: "#a855f7",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
    marginHorizontal: 4,
  },
  doneBtnText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
