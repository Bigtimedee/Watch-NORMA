// Spec C fix 5: 3-step onboarding checklist with progress bar. Renders for
// signed-in users until all steps are done or it is dismissed.
import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { useFollows } from "../hooks/useFollows";
import { useConnections } from "../hooks/useConnections";
import { CHECKLIST_STEPS, completeStep, dismissChecklist, getChecklist, type ChecklistState, type ChecklistStep } from "../lib/onboarding";

export function OnboardingChecklist() {
  const router = useRouter();
  const [state, setState] = useState<ChecklistState | null>(null);
  const { data: follows } = useFollows();
  const { data: connections } = useConnections();

  const refresh = useCallback(async () => {
    let s = await getChecklist();
    if ((follows?.length ?? 0) >= 2) s = await completeStep("follow_teams");
    if ((connections?.length ?? 0) > 0) s = await completeStep("connect_account");
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === "granted") s = await completeStep("notifications");
    } catch {
      /* ignore */
    }
    setState({ ...s, done: [...s.done] });
  }, [follows?.length, connections?.length]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  if (!state || state.dismissed || state.done.length >= CHECKLIST_STEPS.length) return null;

  const go = async (key: ChecklistStep) => {
    if (key === "follow_teams") return; // follow from the list below
    if (key === "connect_account") {
      router.push("/(tabs)/connections/sportsbooks");
      return;
    }
    router.push("/push-primer");
  };

  const skip = async (key: ChecklistStep) => {
    setState({ ...(await completeStep(key, { skipped: true })) });
  };

  const pct = state.done.length / CHECKLIST_STEPS.length;
  return (
    <View style={s.card}>
      <View style={s.headRow}>
        <Text style={s.title}>Get set up: {state.done.length} of 3</Text>
        <Pressable onPress={async () => { await dismissChecklist(); setState({ ...state, dismissed: true }); }} accessibilityLabel="Dismiss checklist">
          <Text style={s.dismiss}>Hide</Text>
        </Pressable>
      </View>
      <View style={s.bar}><View style={[s.fill, { width: `${pct * 100}%` }]} /></View>
      {CHECKLIST_STEPS.map((st) => {
        const done = state.done.includes(st.key);
        return (
          <Pressable key={st.key} style={s.row} onPress={() => !done && go(st.key)} disabled={done}>
            <Text style={[s.check, done && s.checkDone]}>{done ? "\u2713" : "\u25CB"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.stepTitle, done && s.stepDone]}>{st.title}</Text>
              {!done && <Text style={s.stepDesc}>{st.desc}</Text>}
            </View>
            {!done && st.key === "connect_account" && (
              <Pressable onPress={() => skip(st.key)} accessibilityLabel="Skip">
                <Text style={s.dismiss}>Skip</Text>
              </Pressable>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: "#1e293b", borderRadius: 14, padding: 16, marginHorizontal: 16, marginBottom: 12 },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#fff", fontSize: 16, fontWeight: "700" },
  dismiss: { color: "#94a3b8", fontSize: 13, paddingHorizontal: 4 },
  bar: { height: 6, backgroundColor: "#334155", borderRadius: 3, marginTop: 10, marginBottom: 8, overflow: "hidden" },
  fill: { height: 6, backgroundColor: "#f97316" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 10 },
  check: { color: "#64748b", fontSize: 18, width: 22 },
  checkDone: { color: "#4ade80" },
  stepTitle: { color: "#e2e8f0", fontSize: 14, fontWeight: "600" },
  stepDone: { color: "#64748b", textDecorationLine: "line-through" },
  stepDesc: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
});
