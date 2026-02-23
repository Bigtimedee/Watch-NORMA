import { useState, useMemo } from "react";
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
import { usePreferences, useUpdatePreferences, useTeams } from "../hooks/usePreferences";

interface PreferencesSheetProps {
  onClose: () => void;
}

export function PreferencesSheet({ onClose }: PreferencesSheetProps) {
  const { data: prefs } = usePreferences();
  const { data: teams } = useTeams();
  const updatePrefs = useUpdatePreferences();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(
    () => (prefs?.favorite_teams ?? []).map((t) => t.team_id)
  );
  const [maxPerGame, setMaxPerGame] = useState(
    () => String(prefs?.notification_settings?.max_alerts_per_game ?? 5)
  );
  const [maxPerHour, setMaxPerHour] = useState(
    () => String(prefs?.notification_settings?.max_alerts_per_hour ?? 10)
  );
  const [quietStart, setQuietStart] = useState(
    () => prefs?.notification_settings?.quiet_hours_start ?? ""
  );
  const [quietEnd, setQuietEnd] = useState(
    () => prefs?.notification_settings?.quiet_hours_end ?? ""
  );

  const filteredTeams = useMemo(() => {
    if (!teams) return [];
    if (!searchQuery.trim()) {
      // Show selected teams first, then by conference
      return [...teams].sort((a, b) => {
        const aSelected = selectedTeamIds.includes(a.id) ? 0 : 1;
        const bSelected = selectedTeamIds.includes(b.id) ? 0 : 1;
        if (aSelected !== bSelected) return aSelected - bSelected;
        return a.name.localeCompare(b.name);
      });
    }
    const q = searchQuery.toLowerCase();
    return teams.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.market ?? "").toLowerCase().includes(q) ||
        (t.abbreviation ?? "").toLowerCase().includes(q) ||
        (t.conference ?? "").toLowerCase().includes(q)
    );
  }, [teams, searchQuery, selectedTeamIds]);

  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  };

  const handleSave = async () => {
    const parsedMaxPerGame = parseInt(maxPerGame) || 5;
    const parsedMaxPerHour = parseInt(maxPerHour) || 10;

    try {
      await updatePrefs.mutateAsync({
        favorite_teams: selectedTeamIds.map((team_id) => ({
          team_id,
          added_at: new Date().toISOString(),
        })),
        notification_settings: {
          quiet_hours_start: quietStart.trim() || null,
          quiet_hours_end: quietEnd.trim() || null,
          max_alerts_per_game: parsedMaxPerGame,
          max_alerts_per_hour: parsedMaxPerHour,
          channels: prefs?.notification_settings?.channels ?? {
            push: true,
            in_app: true,
          },
        },
      });
      onClose();
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

  return (
    <View style={s.overlay}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.handle} />

        <View style={s.header}>
          <Text style={s.title}>Preferences</Text>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={24} color="#94a3b8" />
          </Pressable>
        </View>

        <ScrollView style={s.form} keyboardShouldPersistTaps="handled">
          {/* Favorite Teams */}
          <Text style={s.label}>Favorite Teams</Text>
          <Text style={s.hint}>
            Follow your teams to get alerts when their games get exciting.
          </Text>
          <TextInput
            style={s.searchInput}
            placeholderTextColor="#64748b"
            placeholder="Search teams..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />

          <View style={s.teamGrid}>
            {filteredTeams.slice(0, 30).map((team) => {
              const isSelected = selectedTeamIds.includes(team.id);
              return (
                <Pressable
                  key={team.id}
                  style={[s.teamChip, isSelected && s.teamChipActive]}
                  onPress={() => toggleTeam(team.id)}
                >
                  <Text
                    style={[s.teamChipText, isSelected && s.teamChipTextActive]}
                    numberOfLines={1}
                  >
                    {team.abbreviation ?? team.name}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark" size={14} color="#fff" style={{ marginLeft: 4 }} />
                  )}
                </Pressable>
              );
            })}
          </View>

          {selectedTeamIds.length > 0 && (
            <Text style={s.selectedCount}>
              {selectedTeamIds.length} team{selectedTeamIds.length !== 1 ? "s" : ""} selected
            </Text>
          )}

          {/* Notification Settings */}
          <Text style={[s.label, { marginTop: 24 }]}>Alert Limits</Text>

          <View style={s.inputRow}>
            <View style={s.inputCol}>
              <Text style={s.inputLabel}>Max per game</Text>
              <TextInput
                style={s.input}
                placeholderTextColor="#64748b"
                placeholder="5"
                value={maxPerGame}
                onChangeText={setMaxPerGame}
                keyboardType="number-pad"
              />
            </View>
            <View style={s.inputCol}>
              <Text style={s.inputLabel}>Max per hour</Text>
              <TextInput
                style={s.input}
                placeholderTextColor="#64748b"
                placeholder="10"
                value={maxPerHour}
                onChangeText={setMaxPerHour}
                keyboardType="number-pad"
              />
            </View>
          </View>

          {/* Quiet Hours */}
          <Text style={[s.label, { marginTop: 24 }]}>Quiet Hours</Text>
          <Text style={s.hint}>
            No push notifications during these hours. In-app alerts still appear.
          </Text>

          <View style={s.inputRow}>
            <View style={s.inputCol}>
              <Text style={s.inputLabel}>Start (e.g. 23:00)</Text>
              <TextInput
                style={s.input}
                placeholderTextColor="#64748b"
                placeholder="23:00"
                value={quietStart}
                onChangeText={setQuietStart}
              />
            </View>
            <View style={s.inputCol}>
              <Text style={s.inputLabel}>End (e.g. 08:00)</Text>
              <TextInput
                style={s.input}
                placeholderTextColor="#64748b"
                placeholder="08:00"
                value={quietEnd}
                onChangeText={setQuietEnd}
              />
            </View>
          </View>

          {/* Save */}
          <Pressable
            style={[s.saveBtn, updatePrefs.isPending && s.saveBtnDisabled]}
            onPress={handleSave}
            disabled={updatePrefs.isPending}
          >
            <Text style={s.saveText}>
              {updatePrefs.isPending ? "Saving..." : "Save Preferences"}
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
  form: { paddingHorizontal: 20 },
  label: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  hint: {
    color: "#64748b",
    fontSize: 13,
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#ffffff",
    fontSize: 15,
    marginBottom: 12,
  },
  teamGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  teamChip: {
    backgroundColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  teamChipActive: {
    backgroundColor: "#f97316",
  },
  teamChipText: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "600",
  },
  teamChipTextActive: {
    color: "#ffffff",
  },
  selectedCount: {
    color: "#fb923c",
    fontSize: 13,
    marginTop: 8,
  },
  inputRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  inputCol: { flex: 1 },
  inputLabel: {
    color: "#94a3b8",
    fontSize: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: "#ffffff",
    fontSize: 16,
  },
  saveBtn: {
    backgroundColor: "#f97316",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 20,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
