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
import type { WagerTarget } from "../lib/wager-target-parser";

interface AddWagerSheetProps {
  game: Game;
  onClose: () => void;
}

type MarketType = "spread" | "moneyline" | "over_under" | "player_prop" | "parlay";

const MARKET_TYPES: { value: MarketType; label: string }[] = [
  { value: "spread", label: "Spread" },
  { value: "moneyline", label: "Moneyline" },
  { value: "over_under", label: "Over/Under" },
  { value: "player_prop", label: "Player Prop" },
  { value: "parlay", label: "Parlay" },
];

// Map market_type to legacy wager_type for backward compat
function toWagerType(mt: MarketType): WagerType {
  if (mt === "player_prop") return "prop";
  if (mt === "parlay") return "spread"; // parlays stored with first leg type
  return mt as WagerType;
}

interface ParlayLeg {
  description: string;
  line: string;
  odds: string;
}

export function AddWagerSheet({ game, onClose }: AddWagerSheetProps) {
  const addWager = useAddWager();
  const { data: connections } = useConnections();

  const connectedBooks = (connections ?? [])
    .filter((c) => c.connected && c.provider_key !== "kalshi" && c.provider_key !== "polymarket")
    .map((c) => c.provider_key);

  const [sportsbook, setSportsbook] = useState(connectedBooks[0] ?? "draftkings");
  const [marketType, setMarketType] = useState<MarketType>("spread");
  const [description, setDescription] = useState("");
  const [line, setLine] = useState("");
  const [odds, setOdds] = useState("");
  const [stake, setStake] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>(
    game.home_team_id ?? undefined
  );

  // Player prop structured fields (bypass parsing when filled)
  const [propPlayerName, setPropPlayerName] = useState("");
  const [propStatType, setPropStatType] = useState("points");
  const [propLine, setPropLine] = useState("");
  const [propIsOver, setPropIsOver] = useState(true);

  const PROP_STAT_TYPES = [
    { value: "points", label: "Points" },
    { value: "rebounds", label: "Rebounds" },
    { value: "assists", label: "Assists" },
    { value: "three_pointers", label: "3-Pointers" },
    { value: "steals", label: "Steals" },
    { value: "blocks", label: "Blocks" },
  ];

  // Parlay state
  const [parlayLegs, setParlayLegs] = useState<ParlayLeg[]>([
    { description: "", line: "", odds: "" },
    { description: "", line: "", odds: "" },
  ]);

  const updateLeg = (index: number, field: keyof ParlayLeg, value: string) => {
    const updated = [...parlayLegs];
    updated[index] = { ...updated[index], [field]: value };
    setParlayLegs(updated);
  };

  const addLeg = () => {
    if (parlayLegs.length < 10) {
      setParlayLegs([...parlayLegs, { description: "", line: "", odds: "" }]);
    }
  };

  const removeLeg = (index: number) => {
    if (parlayLegs.length > 2) {
      setParlayLegs(parlayLegs.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async () => {
    if (marketType === "parlay") {
      const validLegs = parlayLegs.filter((l) => l.description.trim());
      if (validLegs.length < 2) {
        Alert.alert("Required", "A parlay needs at least 2 legs.");
        return;
      }

      const parlayDesc = validLegs.map((l) => l.description.trim()).join(" + ");

      try {
        await addWager.mutateAsync({
          game_id: game.id,
          sportsbook,
          wager_type: "spread", // legacy field
          description: parlayDesc,
          team_id: selectedTeamId,
          line: undefined,
          odds: odds || undefined,
          market_type: "parlay",
          stake: stake ? parseFloat(stake) : undefined,
          legs: validLegs.map((l) => ({
            game_id: game.id,
            market_type: "spread",
            description: l.description.trim(),
            line: l.line ? parseFloat(l.line) : undefined,
            odds: l.odds || undefined,
          })),
          source: "manual",
        });
        onClose();
      } catch (error: any) {
        Alert.alert("Error", error.message);
      }
      return;
    }

    // Single bet flow
    if (!description.trim()) {
      Alert.alert("Required", "Please enter a description for your wager.");
      return;
    }

    // Build parsed_target from structured fields if available (player_prop)
    let parsed_target: WagerTarget | null | undefined;
    if (marketType === "player_prop" && propPlayerName.trim() && propLine.trim()) {
      parsed_target = {
        target_type: "player_stat",
        player_name: propPlayerName.trim(),
        stat_type: propStatType,
        line: parseFloat(propLine),
        is_over: propIsOver,
      };
    }

    try {
      await addWager.mutateAsync({
        game_id: game.id,
        sportsbook,
        wager_type: toWagerType(marketType),
        description: description.trim(),
        team_id: selectedTeamId,
        line: line ? parseFloat(line) : undefined,
        odds: odds || undefined,
        market_type: marketType,
        stake: stake ? parseFloat(stake) : undefined,
        source: "manual",
        parsed_target,
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
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

          {/* Market type */}
          <Text style={s.label}>Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
            {MARKET_TYPES.map((t) => (
              <Pressable
                key={t.value}
                style={[s.chip, marketType === t.value && s.chipActive]}
                onPress={() => setMarketType(t.value)}
              >
                <Text
                  style={[
                    s.chipText,
                    marketType === t.value && s.chipTextActive,
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Team selection for spread/moneyline */}
          {(marketType === "spread" || marketType === "moneyline") && (
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

          {/* Parlay legs */}
          {marketType === "parlay" ? (
            <>
              <Text style={s.label}>Legs</Text>
              {parlayLegs.map((leg, i) => (
                <View key={i} style={s.legContainer}>
                  <View style={s.legHeader}>
                    <Text style={s.legLabel}>Leg {i + 1}</Text>
                    {parlayLegs.length > 2 && (
                      <Pressable onPress={() => removeLeg(i)}>
                        <Ionicons name="close-circle" size={20} color="#64748b" />
                      </Pressable>
                    )}
                  </View>
                  <TextInput
                    style={s.input}
                    placeholderTextColor="#64748b"
                    placeholder="e.g. Duke -3.5"
                    value={leg.description}
                    onChangeText={(v) => updateLeg(i, "description", v)}
                  />
                  <View style={s.inputRow}>
                    <View style={s.inputCol}>
                      <TextInput
                        style={s.input}
                        placeholderTextColor="#64748b"
                        placeholder="Line"
                        value={leg.line}
                        onChangeText={(v) => updateLeg(i, "line", v)}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={s.inputCol}>
                      <TextInput
                        style={s.input}
                        placeholderTextColor="#64748b"
                        placeholder="Odds"
                        value={leg.odds}
                        onChangeText={(v) => updateLeg(i, "odds", v)}
                      />
                    </View>
                  </View>
                </View>
              ))}
              <Pressable style={s.addLegBtn} onPress={addLeg}>
                <Ionicons name="add-circle-outline" size={18} color="#f97316" />
                <Text style={s.addLegText}>Add Leg</Text>
              </Pressable>
            </>
          ) : (
            <>
              {/* Single bet: Description */}
              <Text style={s.label}>Description</Text>
              <TextInput
                style={s.input}
                placeholderTextColor="#64748b"
                placeholder={marketType === "player_prop" ? "e.g. Zion Williamson Over 22.5 points" : "e.g. Duke -3.5"}
                value={description}
                onChangeText={setDescription}
              />

              {/* Structured player prop fields */}
              {marketType === "player_prop" && (
                <>
                  <Text style={s.label}>Player Name (optional)</Text>
                  <TextInput
                    style={s.input}
                    placeholderTextColor="#64748b"
                    placeholder="e.g. Anthony Edwards"
                    value={propPlayerName}
                    onChangeText={setPropPlayerName}
                  />

                  <Text style={s.label}>Stat</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
                    {PROP_STAT_TYPES.map((st) => (
                      <Pressable
                        key={st.value}
                        style={[s.chip, propStatType === st.value && s.chipActive]}
                        onPress={() => setPropStatType(st.value)}
                      >
                        <Text style={[s.chipText, propStatType === st.value && s.chipTextActive]}>
                          {st.label}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  <View style={s.inputRow}>
                    <View style={s.inputCol}>
                      <Text style={s.label}>Prop Line</Text>
                      <TextInput
                        style={s.input}
                        placeholderTextColor="#64748b"
                        placeholder="27.5"
                        value={propLine}
                        onChangeText={setPropLine}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={s.inputCol}>
                      <Text style={s.label}>Direction</Text>
                      <View style={s.chipRow}>
                        <Pressable
                          style={[s.chip, propIsOver && s.chipActive]}
                          onPress={() => setPropIsOver(true)}
                        >
                          <Text style={[s.chipText, propIsOver && s.chipTextActive]}>Over</Text>
                        </Pressable>
                        <Pressable
                          style={[s.chip, !propIsOver && s.chipActive]}
                          onPress={() => setPropIsOver(false)}
                        >
                          <Text style={[s.chipText, !propIsOver && s.chipTextActive]}>Under</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </>
              )}

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
            </>
          )}

          {/* Stake + Overall Odds (for parlays) */}
          <View style={s.inputRow}>
            <View style={s.inputCol}>
              <Text style={s.label}>Stake</Text>
              <TextInput
                style={s.input}
                placeholderTextColor="#64748b"
                placeholder="$25"
                value={stake}
                onChangeText={setStake}
                keyboardType="numeric"
              />
            </View>
            {marketType === "parlay" && (
              <View style={s.inputCol}>
                <Text style={s.label}>Parlay Odds</Text>
                <TextInput
                  style={s.input}
                  placeholderTextColor="#64748b"
                  placeholder="+450"
                  value={odds}
                  onChangeText={setOdds}
                />
              </View>
            )}
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
  legContainer: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  legHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  legLabel: { color: "#94a3b8", fontSize: 12, fontWeight: "600" },
  addLegBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 6,
  },
  addLegText: { color: "#f97316", fontSize: 14, fontWeight: "600" },
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
