import { useState } from "react";
import {
  View, Text, Modal, Pressable, StyleSheet,
  Alert, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useKalshiConnection } from "../hooks/useKalshi";
import { usePolymarketConnection } from "../hooks/usePolymarket";
import { useUpdateAgentConfig } from "../hooks/useNormaAgent";

const STEPS = ["Accounts", "Sensitivity", "Notifications"] as const;

interface Props {
  onComplete: () => void;
  onDismiss: () => void;
  initialThresholdHigh?: number;
  initialThresholdLow?: number;
  initialSwingPct?: number;
  initialTimeWindow?: number;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const steps = Math.round((max - min) / step);
  const idx = Math.round((value - min) / step);

  return (
    <View style={sl.row}>
      <View style={sl.labelRow}>
        <Text style={sl.label}>{label}</Text>
        <Text style={sl.value}>{value}{unit}</Text>
      </View>
      <View style={sl.track}>
        <View style={[sl.fill, { flex: idx }]} />
        <View style={[sl.empty, { flex: steps - idx }]} />
      </View>
      <View style={sl.btnRow}>
        <Pressable
          style={sl.btn}
          onPress={() => onChange(Math.max(min, value - step))}
          accessibilityLabel={`Decrease ${label}`}
        >
          <Ionicons name="remove" size={18} color="#f97316" />
        </Pressable>
        <Pressable
          style={sl.btn}
          onPress={() => onChange(Math.min(max, value + step))}
          accessibilityLabel={`Increase ${label}`}
        >
          <Ionicons name="add" size={18} color="#f97316" />
        </Pressable>
      </View>
    </View>
  );
}

export function AgentOnboardingModal({
  onComplete,
  onDismiss,
  initialThresholdHigh = 85,
  initialThresholdLow = 15,
  initialSwingPct = 20,
  initialTimeWindow = 10,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [thresholdHigh, setThresholdHigh] = useState(initialThresholdHigh);
  const [thresholdLow, setThresholdLow] = useState(initialThresholdLow);
  const [swingPct, setSwingPct] = useState(initialSwingPct);
  const [timeWindow, setTimeWindow] = useState(initialTimeWindow);
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);
  const [notifRequesting, setNotifRequesting] = useState(false);

  const { data: kalshiConn } = useKalshiConnection();
  const { data: polyConn } = usePolymarketConnection();
  const updateConfig = useUpdateAgentConfig();

  const kalshiConnected = !!kalshiConn?.connected;
  const polyConnected = !!polyConn?.connected;
  const anyConnected = kalshiConnected || polyConnected;

  const handleNext = async () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      // Final step — save config and complete
      try {
        await updateConfig.mutateAsync({
          threshold_high: thresholdHigh,
          threshold_low: thresholdLow,
          swing_pct: swingPct,
          time_window_minutes: timeWindow,
          is_active: true,
          onboarding_completed: true,
        });
        onComplete();
      } catch (err: any) {
        Alert.alert("Error", err.message ?? "Failed to save settings");
      }
    }
  };

  const handleRequestNotifications = async () => {
    setNotifRequesting(true);
    try {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: true },
      });
      setNotifGranted(status === "granted");
    } catch {
      setNotifGranted(false);
    } finally {
      setNotifRequesting(false);
    }
  };

  const canAdvance = step === 0 ? anyConnected : true;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>Set Up NORMA Agent</Text>
          <Pressable style={s.closeBtn} onPress={onDismiss} accessibilityLabel="Dismiss">
            <Ionicons name="close" size={22} color="#94a3b8" />
          </Pressable>
        </View>

        {/* Step indicators */}
        <View style={s.stepRow}>
          {STEPS.map((label, i) => (
            <View key={label} style={s.stepItem}>
              <View style={[s.stepDot, i <= step ? s.stepDotActive : s.stepDotInactive]}>
                {i < step
                  ? <Ionicons name="checkmark" size={13} color="#fff" />
                  : <Text style={s.stepNum}>{i + 1}</Text>
                }
              </View>
              <Text style={[s.stepLabel, i === step && s.stepLabelActive]}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Step content */}
        <View style={s.content}>
          {step === 0 && (
            <View>
              <Text style={s.stepTitle}>Connect Prediction Accounts</Text>
              <Text style={s.stepBody}>
                NORMA Agent monitors your open Kalshi and Polymarket positions.
                Connect at least one account to continue.
              </Text>

              <AccountRow
                name="Kalshi"
                connected={kalshiConnected}
                onConnect={() => {
                  onDismiss();
                  router.push("/(tabs)/connections/kalshi-connect");
                }}
              />
              <AccountRow
                name="Polymarket"
                connected={polyConnected}
                onConnect={() => {
                  onDismiss();
                  router.push("/(tabs)/connections/polymarket-connect");
                }}
              />

              {!anyConnected && (
                <Text style={s.hint}>
                  Connect at least one account above, then return to continue setup.
                </Text>
              )}
            </View>
          )}

          {step === 1 && (
            <View>
              <Text style={s.stepTitle}>Configure Alert Sensitivity</Text>
              <Text style={s.stepBody}>
                NORMA Agent fires alerts when these conditions are met.
              </Text>

              <SliderRow
                label="Resolving YES threshold"
                value={thresholdHigh}
                min={60}
                max={98}
                step={5}
                unit="%"
                onChange={setThresholdHigh}
              />
              <SliderRow
                label="Resolving NO threshold"
                value={thresholdLow}
                min={2}
                max={40}
                step={5}
                unit="%"
                onChange={(v) => setThresholdLow(Math.min(v, thresholdHigh - 10))}
              />
              <SliderRow
                label="Swing alert sensitivity"
                value={swingPct}
                min={5}
                max={40}
                step={5}
                unit="%"
                onChange={setSwingPct}
              />
              <SliderRow
                label="Time expiry window"
                value={timeWindow}
                min={5}
                max={60}
                step={5}
                unit=" min"
                onChange={setTimeWindow}
              />
            </View>
          )}

          {step === 2 && (
            <View>
              <Text style={s.stepTitle}>Enable Notifications</Text>
              <Text style={s.stepBody}>
                NORMA Agent sends push alerts when your positions are about to
                resolve, swing sharply, or expire soon.
              </Text>

              <View style={s.notifExample}>
                <Text style={s.notifTitle}>🎯 NORMA Agent — Duke vs UNC</Text>
                <Text style={s.notifBody}>
                  87% chance your YES position resolves ✅. Tap to watch live on YouTube TV.
                </Text>
              </View>

              {notifGranted === null ? (
                <Pressable
                  style={s.notifBtn}
                  onPress={handleRequestNotifications}
                  disabled={notifRequesting}
                >
                  {notifRequesting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.notifBtnText}>Enable Notifications</Text>
                  }
                </Pressable>
              ) : notifGranted ? (
                <View style={s.notifGrantedRow}>
                  <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                  <Text style={s.notifGrantedText}>Notifications enabled</Text>
                </View>
              ) : (
                <Text style={s.notifDenied}>
                  Notifications denied. You can enable them in iOS Settings → NORMA.
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={s.footer}>
          {step > 0 && (
            <Pressable style={s.backBtn} onPress={() => setStep(step - 1)}>
              <Text style={s.backBtnText}>Back</Text>
            </Pressable>
          )}

          <Pressable
            style={[s.nextBtn, !canAdvance && s.nextBtnDisabled]}
            onPress={handleNext}
            disabled={!canAdvance || updateConfig.isPending}
          >
            {updateConfig.isPending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.nextBtnText}>
                  {step === STEPS.length - 1 ? "Activate Agent" : "Continue"}
                </Text>
            }
          </Pressable>
        </View>

        {step === 0 && (
          <Pressable style={s.skipBtn} onPress={onDismiss}>
            <Text style={s.skipText}>Skip for now</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

function AccountRow({
  name,
  connected,
  onConnect,
}: {
  name: string;
  connected: boolean;
  onConnect: () => void;
}) {
  return (
    <View style={ar.row}>
      <View style={ar.info}>
        <Text style={ar.name}>{name}</Text>
        <Text style={[ar.status, connected ? ar.statusConnected : ar.statusNot]}>
          {connected ? "Connected" : "Not connected"}
        </Text>
      </View>
      {connected ? (
        <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
      ) : (
        <Pressable style={ar.connectBtn} onPress={onConnect}>
          <Text style={ar.connectBtnText}>Connect</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "800" },
  closeBtn: { padding: 4 },
  stepRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 32,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    marginBottom: 4,
  },
  stepItem: { alignItems: "center", gap: 6 },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: { backgroundColor: "#f97316" },
  stepDotInactive: { backgroundColor: "#1e293b", borderWidth: 1, borderColor: "#475569" },
  stepNum: { color: "#94a3b8", fontSize: 12, fontWeight: "700" },
  stepLabel: { color: "#64748b", fontSize: 11, fontWeight: "600" },
  stepLabelActive: { color: "#f97316" },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 24 },
  stepTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 10 },
  stepBody: { color: "#94a3b8", fontSize: 14, lineHeight: 21, marginBottom: 24 },
  hint: { color: "#64748b", fontSize: 13, textAlign: "center", marginTop: 16 },
  notifExample: {
    backgroundColor: "#1e293b",
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  notifTitle: { color: "#fff", fontSize: 14, fontWeight: "700", marginBottom: 4 },
  notifBody: { color: "#94a3b8", fontSize: 13, lineHeight: 19 },
  notifBtn: {
    backgroundColor: "#f97316",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  notifBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  notifGrantedRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  notifGrantedText: { color: "#22c55e", fontSize: 16, fontWeight: "600" },
  notifDenied: { color: "#94a3b8", fontSize: 14, lineHeight: 20 },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
  },
  backBtn: {
    flex: 1,
    backgroundColor: "#1e293b",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  backBtnText: { color: "#94a3b8", fontSize: 16, fontWeight: "600" },
  nextBtn: {
    flex: 2,
    backgroundColor: "#f97316",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  nextBtnDisabled: { backgroundColor: "#64748b" },
  nextBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  skipBtn: { paddingVertical: 12, alignItems: "center" },
  skipText: { color: "#64748b", fontSize: 14 },
});

const ar = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1e293b",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  info: { flex: 1 },
  name: { color: "#fff", fontSize: 16, fontWeight: "600" },
  status: { fontSize: 13, marginTop: 2 },
  statusConnected: { color: "#22c55e" },
  statusNot: { color: "#64748b" },
  connectBtn: {
    backgroundColor: "#f97316",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  connectBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});

const sl = StyleSheet.create({
  row: { marginBottom: 20 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  label: { color: "#f1f5f9", fontSize: 14, fontWeight: "600" },
  value: { color: "#f97316", fontSize: 14, fontWeight: "700" },
  track: { flexDirection: "row", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 8 },
  fill: { backgroundColor: "#f97316", minWidth: 4 },
  empty: { backgroundColor: "#334155", minWidth: 4 },
  btnRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  btn: {
    backgroundColor: "#1e293b",
    borderRadius: 8,
    padding: 6,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
