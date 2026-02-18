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
import { useAddWager } from "../hooks/useWagers";
import { useConnections } from "../hooks/useConnections";
import { SPORTSBOOK_NAMES } from "../lib/constants";
import type { WagerType, Game } from "../lib/types";

interface AddWagerSheetProps {
  game: Game;
  onClose: () => void;
}

const WAGER_TYPES: { value: WagerType; label: string }[] = [
  { value: "spread", label: "Spread" },
  { value: "moneyline", label: "Moneyline" },
  { value: "over_under", label: "Over/Under" },
  { value: "prop", label: "Prop" },
];

export function AddWagerSheet({ game, onClose }: AddWagerSheetProps) {
  const addWager = useAddWager();
  const { data: connections } = useConnections("sportsbook");

  const connectedBooks = (connections ?? [])
    .filter((c) => c.connected && c.provider_key !== "kalshi" && c.provider_key !== "polymarket")
    .map((c) => c.provider_key);

  const [sportsbook, setSportsbook] = useState(connectedBooks[0] ?? "draftkings");
  const [wagerType, setWagerType] = useState<WagerType>("spread");
  const [description, setDescription] = useState("");
  const [line, setLine] = useState("");
  const [odds, setOdds] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>(
    game.home_team_id ?? undefined
  );

  const handleSubmit = async () => {
    if (!description.trim()) {
      Alert.alert("Required", "Please enter a description for your wager.");
      return;
    }

    try {
      await addWager.mutateAsync({
        game_id: game.id,
        sportsbook,
        wager_type: wagerType,
        description: description.trim(),
        team_id: selectedTeamId,
        line: line ? parseFloat(line) : undefined,
        odds: odds || undefined,
      });
      onClose();
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

  const allBooks = [
    ...new Set([...connectedBooks, "draftkings", "fanduel", "betmgm", "espnbet", "caesars"]),
  ];

  return (
    <View style={s.overlay}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.handle} />

        <View style={s.header}>
          <Text style={s.title}>Log Wager</Text>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={24} color="#94a3b8" />
          </Pressable>
        </View>

        <ScrollView style={s.form} keyboardShouldPersistTaps="handled">
          {/* Sportsbook picker */}
          <Text style={s.label}>Sportsbook</Text>
          <ScrollView horizontal showsScrollIndicator={false} style={s.chipRow}>
            {allBooks.map((book) => (
              <Pressable
                key={book}
                style={[s.chip, sportsbook === book && s.chipActive]}
                onPress={() => setSportsbook(book)}
              >
                <Text
                  style={[
                    s.chipText,
                    sportsbook === book && s.chipTextActive,
                  ]}
                >
                  {SPORTSBOOK_NAMES[book] ?? book}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Wager type */}
          <Text style={s.label}>Type</Text>
          <View style={s.chipRow}>
            {WAGER_TYPES.map((t) => (
              <Pressable
                key={t.value}
                style={[s.chip, wagerType === t.value && s.chipActive]}
                onPress={() => setWagerType(t.value)}
              >
                <Text
                  style={[
                    s.chipText,
                    wagerType === t.value && s.chipTextActive,
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Team selection for spread/moneyline */}
          {(wagerType === "spread" || wagerType === "moneyline") && (
            <>
              <Text style={s.label}>Team</Text>
              <View style={s.chipRow}>
                {game.away_team && (
                  <Pressable
                    style={[
                      s.chip,
                      selectedTeamId === game.away_team_id && s.chipActive,
                    ]}
                    onPress={() =>
                      setSelectedTeamId(game.away_team_id ?? undefined)
                    }
                  >
                    <Text
                      style={[
                        s.chipText,
                        selectedTeamId === game.away_team_id &&
                          s.chipTextActive,
                      ]}
                    >
                      {game.away_team.name}
                    </Text>
                  </Pressable>
                )}
                {game.home_team && (
                  <Pressable
                    style={[
                      s.chip,
                      selectedTeamId === game.home_team_id && s.chipActive,
                    ]}
                    onPress={() =>
                      setSelectedTeamId(game.home_team_id ?? undefined)
                    }
                  >
                    <Text
                      style={[
                        s.chipText,
                        selectedTeamId === game.home_team_id &&
                          s.chipTextActive,
                      ]}
                    >
                      {game.home_team.name}
                    </Text>
                  </Pressable>
                )}
              </View>
            </>
          )}

          {/* Description */}
          <Text style={s.label}>Description</Text>
          <TextInput
            style={s.input}
            placeholderTextColor="#64748b"
            placeholder="e.g. Duke -3.5"
            value={description}
            onChangeText={setDescription}
          />

          {/* Line + Odds row */}
          <View style={s.inputRow}>
            <View style={s.inputCol}>
              <Text style={s.label}>Line</Text>
              <TextInput
                style={s.input}
                placeholderTextColor="#64748b"
                placeholder="-3.5"
                value={line}
                onChangeText={setLine}
                keyboardType="numeric"
              />
            </View>
            <View style={s.inputCol}>
              <Text style={s.label}>Odds</Text>
              <TextInput
                style={s.input}
                placeholderTextColor="#64748b"
                placeholder="-110"
                value={odds}
                onChangeText={setOdds}
              />
            </View>
          </View>

          {/* Submit */}
          <Pressable
            style={[s.submitBtn, addWager.isPending && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={addWager.isPending}
          >
            <Text style={s.submitText}>
              {addWager.isPending ? "Saving..." : "Log Wager"}
            </Text>
          </Pressable>
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
  submitBtn: {
    backgroundColor: "#f97316",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
