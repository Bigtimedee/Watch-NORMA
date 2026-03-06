import { useState } from "react";
import {
  View, Text, Pressable, ScrollView, Switch, StyleSheet, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useAgentConfig,
  useUpdateAgentConfig,
  useAgentAlerts,
  useAgentPositions,
} from "../../../hooks/useNormaAgent";
import { AgentPositionCard } from "../../../components/AgentPositionCard";
import { AgentOnboardingModal } from "../../../components/AgentOnboardingModal";
import { useQueryClient } from "@tanstack/react-query";
import type { AgentStatus } from "../../../lib/types";

function StatusDot({ status }: { status: AgentStatus }) {
  const color = status === "monitoring"
    ? "#22c55e"
    : status === "alert_triggered"
    ? "#f97316"
    : "#64748b";
  return (
    <View style={[dot.outer, { borderColor: color + "40" }]}>
      <View style={[dot.inner, { backgroundColor: color }]} />
    </View>
  );
}

function timeAgoShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function alertTypeLabel(type: string): string {
  if (type === "imminent_resolution") return "Resolving";
  if (type === "probability_swing") return "Swing";
  if (type === "time_expiry") return "Expiring";
  return type;
}

function alertTypeColor(type: string): string {
  if (type === "imminent_resolution") return "#f97316";
  if (type === "probability_swing") return "#60a5fa";
  if (type === "time_expiry") return "#a78bfa";
  return "#94a3b8";
}

export default function AgentScreen() {
  const queryClient = useQueryClient();
  const { data: config, isLoading: configLoading } = useAgentConfig();
  const { data: positions = [], isLoading: posLoading, refetch: refetchPos } = useAgentPositions();
  const { data: agentAlerts = [], refetch: refetchAlerts } = useAgentAlerts(20);
  const updateConfig = useUpdateAgentConfig();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const isActive = config?.is_active ?? false;
  const status = config?.status ?? "idle";
  const onboardingDone = config?.onboarding_completed ?? false;

  const handleToggle = async (value: boolean) => {
    if (value && !onboardingDone) {
      setShowOnboarding(true);
      return;
    }
    await updateConfig.mutateAsync({ is_active: value });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchPos(), refetchAlerts()]);
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <ScrollView
        style={s.flex}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f97316" />}
      >
        {/* Header */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerTitle}>NORMA Agent</Text>
            {config && (
              <View style={s.statusRow}>
                <StatusDot status={status} />
                <Text style={s.statusText}>
                  {status === "monitoring"
                    ? "Monitoring"
                    : status === "alert_triggered"
                    ? "Alert Triggered"
                    : "Idle"}
                </Text>
              </View>
            )}
          </View>
          <Switch
            value={isActive}
            onValueChange={handleToggle}
            trackColor={{ false: "#475569", true: "#f97316" }}
            thumbColor="#fff"
            disabled={updateConfig.isPending || configLoading}
          />
        </View>

        {/* Last sync */}
        {config?.last_synced_at && (
          <Text style={s.syncText}>
            Last synced {timeAgoShort(config.last_synced_at)}
          </Text>
        )}

        {/* Explainer when inactive */}
        {!isActive && (
          <View style={s.explainerCard}>
            <Ionicons name="flask-outline" size={28} color="#f97316" style={{ marginBottom: 10 }} />
            <Text style={s.explainerTitle}>Activate NORMA Agent</Text>
            <Text style={s.explainerBody}>
              When active, NORMA Agent continuously monitors your open prediction market
              positions and automatically queues smart alerts for your connected streaming accounts.
            </Text>
            {!onboardingDone && (
              <Pressable style={s.setupBtn} onPress={() => setShowOnboarding(true)}>
                <Text style={s.setupBtnText}>Set Up Agent</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Open Positions */}
        {isActive && (
          <View style={s.section}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionLabel}>Open Positions</Text>
              <Text style={s.sectionCount}>{positions.length}</Text>
            </View>

            {posLoading ? (
              <Text style={s.empty}>Loading positions…</Text>
            ) : positions.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyTitle}>No open positions</Text>
                <Text style={s.emptyBody}>
                  Connect Kalshi or Polymarket accounts to see your positions here.
                </Text>
              </View>
            ) : (
              positions.map((p) => (
                <AgentPositionCard key={`${p.platform}-${p.market_id}-${p.id}`} position={p} />
              ))
            )}
          </View>
        )}

        {/* Alert History */}
        <View style={s.section}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionLabel}>Alert History</Text>
            {isActive && (
              <Pressable
                style={s.editBtn}
                onPress={() => setShowSettings(true)}
                accessibilityLabel="Edit Alert Settings"
              >
                <Ionicons name="settings-outline" size={16} color="#f97316" />
                <Text style={s.editBtnText}>Edit Settings</Text>
              </Pressable>
            )}
          </View>

          {agentAlerts.length === 0 ? (
            <Text style={s.empty}>No alerts yet.</Text>
          ) : (
            agentAlerts.map((a) => (
              <View key={a.id} style={s.alertRow}>
                <View style={[s.alertTypeBadge, { backgroundColor: alertTypeColor(a.alert_type) + "26" }]}>
                  <Text style={[s.alertTypeText, { color: alertTypeColor(a.alert_type) }]}>
                    {alertTypeLabel(a.alert_type)}
                  </Text>
                </View>
                <View style={s.alertInfo}>
                  <Text style={s.alertTitle} numberOfLines={1}>{a.market_title}</Text>
                  <Text style={s.alertMeta}>
                    {a.platform === "kalshi" ? "Kalshi" : "Polymarket"} ·{" "}
                    {a.position_direction.toUpperCase()} · {a.current_probability}% ·{" "}
                    {timeAgoShort(a.created_at)}
                  </Text>
                </View>
                {a.push_sent && (
                  <Ionicons name="notifications" size={14} color="#60a5fa" />
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Onboarding Modal */}
      {showOnboarding && (
        <AgentOnboardingModal
          initialThresholdHigh={config?.threshold_high}
          initialThresholdLow={config?.threshold_low}
          initialSwingPct={config?.swing_pct}
          initialTimeWindow={config?.time_window_minutes}
          onComplete={() => setShowOnboarding(false)}
          onDismiss={() => setShowOnboarding(false)}
        />
      )}

      {/* Settings Sheet */}
      {showSettings && config && (
        <AgentSettingsSheet
          config={config}
          onClose={() => setShowSettings(false)}
        />
      )}
    </SafeAreaView>
  );
}

// Inline settings sheet — keep agent screen self-contained
import { Modal } from "react-native";
import type { AgentConfig } from "../../../lib/types";

function SliderRow({
  label, value, min, max, step, unit, onChange,
}: {
  label: string; value: number; min: number; max: number;
  step: number; unit: string; onChange: (v: number) => void;
}) {
  return (
    <View style={ss.row}>
      <View style={ss.labelRow}>
        <Text style={ss.label}>{label}</Text>
        <Text style={ss.val}>{value}{unit}</Text>
      </View>
      <View style={ss.btnRow}>
        <Pressable style={ss.btn} onPress={() => onChange(Math.max(min, value - step))}>
          <Ionicons name="remove" size={18} color="#f97316" />
        </Pressable>
        <Pressable style={ss.btn} onPress={() => onChange(Math.min(max, value + step))}>
          <Ionicons name="add" size={18} color="#f97316" />
        </Pressable>
      </View>
    </View>
  );
}

function AgentSettingsSheet({
  config, onClose,
}: { config: AgentConfig; onClose: () => void }) {
  const [high, setHigh] = useState(config.threshold_high);
  const [low, setLow] = useState(config.threshold_low);
  const [swing, setSwing] = useState(config.swing_pct);
  const [timeWin, setTimeWin] = useState(config.time_window_minutes);
  const [interval, setInterval] = useState(config.poll_interval_seconds);
  const update = useUpdateAgentConfig();

  const save = async () => {
    await update.mutateAsync({
      threshold_high: high,
      threshold_low: low,
      swing_pct: swing,
      time_window_minutes: timeWin,
      poll_interval_seconds: interval,
    });
    onClose();
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <View style={ss.container}>
        <View style={ss.header}>
          <Text style={ss.title}>Alert Settings</Text>
          <Pressable onPress={onClose} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color="#94a3b8" />
          </Pressable>
        </View>
        <ScrollView style={ss.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
          <SliderRow label="Resolving YES threshold" value={high} min={60} max={98} step={5} unit="%" onChange={setHigh} />
          <SliderRow label="Resolving NO threshold" value={low} min={2} max={40} step={5} unit="%" onChange={(v) => setLow(Math.min(v, high - 10))} />
          <SliderRow label="Swing sensitivity" value={swing} min={5} max={40} step={5} unit="%" onChange={setSwing} />
          <SliderRow label="Time expiry window" value={timeWin} min={5} max={60} step={5} unit=" min" onChange={setTimeWin} />
          <SliderRow label="Poll interval" value={interval} min={30} max={120} step={30} unit="s" onChange={setInterval} />
        </ScrollView>
        <View style={ss.footer}>
          <Pressable style={ss.saveBtn} onPress={save} disabled={update.isPending}>
            <Text style={ss.saveBtnText}>Save</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const ss = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: "#1e293b",
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "700" },
  scroll: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  row: { marginBottom: 24 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  label: { color: "#f1f5f9", fontSize: 14, fontWeight: "600" },
  val: { color: "#f97316", fontSize: 14, fontWeight: "700" },
  btnRow: { flexDirection: "row", gap: 8 },
  btn: {
    backgroundColor: "#1e293b", borderRadius: 8,
    width: 36, height: 36, alignItems: "center", justifyContent: "center",
  },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: "#1e293b" },
  saveBtn: {
    backgroundColor: "#f97316", borderRadius: 14,
    paddingVertical: 16, alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  flex: { flex: 1 },
  headerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4,
  },
  headerTitle: { color: "#fff", fontSize: 24, fontWeight: "900" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  statusText: { color: "#94a3b8", fontSize: 13 },
  syncText: { color: "#64748b", fontSize: 12, paddingHorizontal: 16, marginBottom: 16 },
  explainerCard: {
    margin: 16,
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  explainerTitle: { color: "#fff", fontSize: 17, fontWeight: "700", marginBottom: 10, textAlign: "center" },
  explainerBody: { color: "#94a3b8", fontSize: 14, lineHeight: 21, textAlign: "center", marginBottom: 20 },
  setupBtn: {
    backgroundColor: "#f97316", borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  setupBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  section: { marginHorizontal: 16, marginTop: 8 },
  sectionHeaderRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionLabel: {
    color: "#94a3b8", fontSize: 12, fontWeight: "700",
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  sectionCount: {
    color: "#64748b", fontSize: 12, backgroundColor: "#1e293b",
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
  },
  editBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#1e293b", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  editBtnText: { color: "#f97316", fontSize: 12, fontWeight: "700" },
  empty: { color: "#64748b", fontSize: 14, textAlign: "center", paddingVertical: 12 },
  emptyCard: {
    backgroundColor: "#1e293b", borderRadius: 14,
    padding: 20, alignItems: "center",
  },
  emptyTitle: { color: "#94a3b8", fontSize: 15, fontWeight: "600", marginBottom: 6 },
  emptyBody: { color: "#64748b", fontSize: 13, textAlign: "center", lineHeight: 19 },
  alertRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#1e293b", borderRadius: 12,
    padding: 12, marginBottom: 8,
  },
  alertTypeBadge: {
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
    alignSelf: "flex-start",
  },
  alertTypeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  alertInfo: { flex: 1 },
  alertTitle: { color: "#f1f5f9", fontSize: 13, fontWeight: "600" },
  alertMeta: { color: "#64748b", fontSize: 11, marginTop: 2 },
});

const dot = StyleSheet.create({
  outer: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2, alignItems: "center", justifyContent: "center",
  },
  inner: { width: 6, height: 6, borderRadius: 3 },
});
