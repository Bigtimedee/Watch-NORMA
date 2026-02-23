import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAddWager } from "../hooks/useWagers";
import { SPORTSBOOK_NAMES } from "../lib/constants";
import type { ScannedWager } from "../hooks/useBetSlipScanner";
import type { WagerType, Game } from "../lib/types";

interface ReviewScannedWagersSheetProps {
  game: Game;
  wagers: ScannedWager[];
  confidence: "high" | "medium" | "low";
  onClose: () => void;
}

const WAGER_TYPES: { value: WagerType; label: string }[] = [
  { value: "spread", label: "Spread" },
  { value: "moneyline", label: "Moneyline" },
  { value: "over_under", label: "Over/Under" },
  { value: "prop", label: "Prop" },
];

const ALL_BOOKS = ["draftkings", "fanduel", "betmgm", "espnbet", "caesars"];

export function ReviewScannedWagersSheet({
  game,
  wagers: initialWagers,
  confidence,
  onClose,
}: ReviewScannedWagersSheetProps) {
  const addWager = useAddWager();
  const [wagers, setWagers] = useState(initialWagers.map((w, i) => ({ ...w, _key: i })));
  const [isSaving, setIsSaving] = useState(false);

  const updateWager = (key: number, field: string, value: string) => {
    setWagers((prev) =>
      prev.map((w) => {
        if (w._key !== key) return w;
        if (field === "line") {
          return { ...w, line: value ? parseFloat(value) || null : null };
        }
        return { ...w, [field]: value };
      })
    );
  };

  const removeWager = (key: number) => {
    setWagers((prev) => prev.filter((w) => w._key !== key));
  };

  const resolveTeamId = (teamName: string | null): string | undefined => {
    if (!teamName) return undefined;
    const lower = teamName.toLowerCase();
    if (game.home_team && game.home_team.name.toLowerCase().includes(lower)) {
      return game.home_team_id ?? undefined;
    }
    if (game.away_team && game.away_team.name.toLowerCase().includes(lower)) {
      return game.away_team_id ?? undefined;
    }
    // Try partial match the other direction
    if (game.home_team && lower.includes(game.home_team.name.toLowerCase())) {
      return game.home_team_id ?? undefined;
    }
    if (game.away_team && lower.includes(game.away_team.name.toLowerCase())) {
      return game.away_team_id ?? undefined;
    }
    return undefined;
  };

  const handleSave = async () => {
    if (wagers.length === 0) return;

    setIsSaving(true);
    try {
      for (const w of wagers) {
        await addWager.mutateAsync({
          game_id: game.id,
          sportsbook: w.sportsbook,
          wager_type: w.wager_type,
          description: w.description,
          team_id: resolveTeamId(w.team_name),
          line: w.line ?? undefined,
          odds: w.odds ?? undefined,
        });
      }
      onClose();
    } catch (error: any) {
      Alert.alert("Error", error.message ?? "Failed to save wagers.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={s.overlay}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.handle} />

        <View style={s.header}>
          <Text style={s.title}>Review Scanned Wagers</Text>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={24} color="#94a3b8" />
          </Pressable>
        </View>

        {confidence === "low" && (
          <View style={s.warningBanner}>
            <Ionicons name="warning" size={16} color="#f59e0b" />
            <Text style={s.warningText}>
              Low confidence — please verify all fields carefully.
            </Text>
          </View>
        )}

        <ScrollView style={s.form} keyboardShouldPersistTaps="handled">
          {wagers.map((w, index) => (
            <View key={w._key} style={s.wagerCard}>
              <View style={s.wagerCardHeader}>
                <Text style={s.wagerCardTitle}>Wager {index + 1}</Text>
                <Pressable onPress={() => removeWager(w._key)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </Pressable>
              </View>

              {/* Sportsbook */}
              <Text style={s.label}>Sportsbook</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
                {ALL_BOOKS.map((book) => (
                  <Pressable
                    key={book}
                    style={[s.chip, w.sportsbook === book && s.chipActive]}
                    onPress={() => updateWager(w._key, "sportsbook", book)}
                  >
                    <Text
                      style={[s.chipText, w.sportsbook === book && s.chipTextActive]}
                    >
                      {SPORTSBOOK_NAMES[book] ?? book}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Wager Type */}
              <Text style={s.label}>Type</Text>
              <View style={s.chipRow}>
                {WAGER_TYPES.map((t) => (
                  <Pressable
                    key={t.value}
                    style={[s.chip, w.wager_type === t.value && s.chipActive]}
                    onPress={() => updateWager(w._key, "wager_type", t.value)}
                  >
                    <Text
                      style={[s.chipText, w.wager_type === t.value && s.chipTextActive]}
                    >
                      {t.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Description */}
              <Text style={s.label}>Description</Text>
              <TextInput
                style={s.input}
                placeholderTextColor="#64748b"
                placeholder="e.g. Duke -3.5"
                value={w.description}
                onChangeText={(v) => updateWager(w._key, "description", v)}
              />

              {/* Line + Odds */}
              <View style={s.inputRow}>
                <View style={s.inputCol}>
                  <Text style={s.label}>Line</Text>
                  <TextInput
                    style={s.input}
                    placeholderTextColor="#64748b"
                    placeholder="-3.5"
                    value={w.line != null ? String(w.line) : ""}
                    onChangeText={(v) => updateWager(w._key, "line", v)}
                    keyboardType="numeric"
                  />
                </View>
                <View style={s.inputCol}>
                  <Text style={s.label}>Odds</Text>
                  <TextInput
                    style={s.input}
                    placeholderTextColor="#64748b"
                    placeholder="-110"
                    value={w.odds ?? ""}
                    onChangeText={(v) => updateWager(w._key, "odds", v)}
                  />
                </View>
              </View>

              {index < wagers.length - 1 && <View style={s.divider} />}
            </View>
          ))}

          {wagers.length === 0 && (
            <Text style={s.emptyText}>All wagers removed. Close to cancel.</Text>
          )}

          {/* Save button */}
          {wagers.length > 0 && (
            <Pressable
              style={[s.submitBtn, isSaving && s.submitBtnDisabled]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={s.submitText}>
                  Save {wagers.length} Wager{wagers.length !== 1 ? "s" : ""}
                </Text>
              )}
            </Pressable>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
    zIndex: 100,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  sheet: {
    backgroundColor: "#1e293b",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#475569",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: { color: "#ffffff", fontSize: 18, fontWeight: "700" },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    marginHorizontal: 20,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 4,
  },
  warningText: { color: "#f59e0b", fontSize: 13, flex: 1 },
  form: { paddingHorizontal: 20 },
  wagerCard: { marginBottom: 8 },
  wagerCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  wagerCardTitle: { color: "#e2e8f0", fontSize: 15, fontWeight: "700" },
  label: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 16,
  },
  chipRow: { flexDirection: "row", gap: 8 },
  chip: {
    backgroundColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  chipActive: { backgroundColor: "#f97316" },
  chipText: { color: "#cbd5e1", fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#ffffff" },
  input: {
    backgroundColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: "#ffffff",
    fontSize: 16,
  },
  inputRow: { flexDirection: "row", gap: 12 },
  inputCol: { flex: 1 },
  divider: {
    height: 1,
    backgroundColor: "#475569",
    marginTop: 20,
  },
  emptyText: { color: "#64748b", fontSize: 14, textAlign: "center", marginTop: 24 },
  submitBtn: {
    backgroundColor: "#a855f7",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
