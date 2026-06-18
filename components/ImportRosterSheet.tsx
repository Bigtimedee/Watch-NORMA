import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { parseRosterInput, buildRosterFollowRows } from "../lib/roster-import";

const FANTASY_PLATFORMS = [
  { value: "draftkings_dfs", label: "DraftKings DFS" },
  { value: "yahoo_fantasy", label: "Yahoo Fantasy" },
  { value: "sleeper", label: "Sleeper" },
  { value: "espn_fantasy", label: "ESPN Fantasy" },
  { value: "underdog", label: "Underdog" },
  { value: "other", label: "Other" },
] as const;

type FantasyPlatform = (typeof FANTASY_PLATFORMS)[number]["value"];

interface ImportRosterSheetProps {
  onClose: () => void;
}

export function ImportRosterSheet({ onClose }: ImportRosterSheetProps) {
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState<FantasyPlatform>("draftkings_dfs");
  const [playerInput, setPlayerInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  const handleImport = async () => {
    const playerNames = parseRosterInput(playerInput);

    if (playerNames.length === 0) {
      Alert.alert("No Players", "Enter at least one player name (one per line).");
      return;
    }

    setIsSubmitting(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Not Signed In", "Please sign in to import a roster.");
        return;
      }

      const rows = buildRosterFollowRows(playerNames, user.id);

      const { error } = await supabase
        .from("follows")
        .upsert(rows, {
          onConflict: "user_id,entity_type,entity_id",
          ignoreDuplicates: true,
        });

      if (error) throw error;

      setImportedCount(playerNames.length);
      setConfirmed(true);

      queryClient.invalidateQueries({ queryKey: ["follows"] });
    } catch (err: any) {
      Alert.alert("Import Failed", err.message ?? "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={s.overlay}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.handle} />

        <View style={s.header}>
          <Text style={s.title}>Import Fantasy Roster</Text>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={24} color="#94a3b8" />
          </Pressable>
        </View>

        {confirmed ? (
          <View style={s.confirmedContainer}>
            <Ionicons name="checkmark-circle" size={56} color="#22c55e" />
            <Text style={s.confirmedTitle}>Roster Imported!</Text>
            <Text style={s.confirmedBody}>
              NORMA will now alert you when{" "}
              {importedCount === 1 ? "this player is" : `these ${importedCount} players are`} having
              key moments.
            </Text>
            <Pressable style={s.doneBtn} onPress={onClose}>
              <Text style={s.doneBtnText}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView style={s.form} keyboardShouldPersistTaps="handled">
            {/* Platform picker */}
            <Text style={s.label}>Fantasy Platform</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.chipRow}
            >
              {FANTASY_PLATFORMS.map((p) => (
                <Pressable
                  key={p.value}
                  style={[s.chip, platform === p.value && s.chipActive]}
                  onPress={() => setPlatform(p.value)}
                >
                  <Text
                    style={[
                      s.chipText,
                      platform === p.value && s.chipTextActive,
                    ]}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Player names input */}
            <Text style={s.label}>Player Names (one per line)</Text>
            <TextInput
              style={s.multilineInput}
              placeholderTextColor="#64748b"
              placeholder={"Jaylen Brown\nDerrick White\nJayson Tatum"}
              value={playerInput}
              onChangeText={setPlayerInput}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              autoCapitalize="words"
              autoCorrect={false}
            />

            <Text style={s.hint}>
              Paste your roster directly — one player per line. NORMA will
              follow each player and alert you when they hit key moments.
            </Text>

            <Pressable
              style={[
                s.submitBtn,
                (isSubmitting || playerInput.trim().length === 0) &&
                  s.submitBtnDisabled,
              ]}
              onPress={handleImport}
              disabled={isSubmitting || playerInput.trim().length === 0}
            >
              <Text style={s.submitText}>
                {isSubmitting ? "Importing..." : "Import Roster"}
              </Text>
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
    maxHeight: "85%",
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
  form: { paddingHorizontal: 20 },
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
  multilineInput: {
    backgroundColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: "#ffffff",
    fontSize: 16,
    minHeight: 130,
    lineHeight: 24,
  },
  hint: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 10,
    lineHeight: 18,
  },
  submitBtn: {
    backgroundColor: "#f97316",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 8,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  // Confirmation state
  confirmedContainer: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 32,
    gap: 16,
  },
  confirmedTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "800",
  },
  confirmedBody: {
    color: "#94a3b8",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  doneBtn: {
    backgroundColor: "#f97316",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 48,
    marginTop: 8,
  },
  doneBtnText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
