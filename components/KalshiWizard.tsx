import { useState, useEffect, useRef } from "react";
import {
  View, Text, Pressable, TextInput, Alert, Linking,
  AppState, ScrollView, StyleSheet, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useConnectKalshi } from "../hooks/useKalshi";

const STEP_KEY = "wizard_kalshi_step";
const TOTAL = 5;

const FAQS: { q: string; a: string }[][] = [
  [
    { q: "What is a Kalshi API key?", a: "An API key lets NORMA securely read your open Kalshi positions without your password. NORMA can never place or cancel trades." },
    { q: "Do I need a Kalshi account?", a: "Yes — you need an active account at kalshi.com. Registration is free." },
  ],
  [
    { q: "I don't see a Create API Key button.", a: "Make sure you're on Settings → API Keys. Try scrolling down or refreshing the page in your browser." },
    { q: "Can I create more than one key?", a: "Yes. Create a dedicated key for NORMA and revoke it at any time from Kalshi's settings." },
  ],
  [
    { q: "What does the Key ID look like?", a: "A UUID — a long string in the format 12a3b4c5-d6e7-8f90-ab12-... Copy the entire value." },
    { q: "Can I come back and copy it later?", a: "Yes — the Key ID is always visible in Settings → API Keys. The Private Key file, however, can only be downloaded once." },
  ],
  [
    { q: "What is a .pem file?", a: "A plain-text file containing your RSA private key. You'll need to open it and paste the full contents — including the -----BEGIN PRIVATE KEY----- header and footer." },
    { q: "Where does Kalshi save it?", a: "Usually your browser's Downloads folder, or the iOS Files / Android Downloads app." },
  ],
  [
    { q: "Is it safe to paste my private key here?", a: "Yes. It's sent over HTTPS, stored in a secure server-side vault, and used only to sign read-only API requests. NORMA never places trades." },
    { q: "I'm getting a Connection Failed error.", a: "Make sure you pasted the complete Key ID and the full .pem contents — including the -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY----- lines." },
  ],
];

// ─── Main export ──────────────────────────────────────────────────────────────

interface KalshiWizardProps {
  onSuccess: () => void;
  onBack: () => void;
}

export function KalshiWizard({ onSuccess, onBack }: KalshiWizardProps) {
  const [step, setStep] = useState(0);
  const [apiKeyId, setApiKeyId] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const connectKalshi = useConnectKalshi();
  const hasOpenedBrowser = useRef(false);
  const stepRef = useRef(0);

  // Restore last step on mount
  useEffect(() => {
    SecureStore.getItemAsync(STEP_KEY).then((v) => {
      if (v !== null) {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n > 0 && n < TOTAL) {
          setStep(n);
          stepRef.current = n;
        }
      }
    }).catch(() => {});
  }, []);

  // Persist step + collapse help on each step change
  useEffect(() => {
    stepRef.current = step;
    SecureStore.setItemAsync(STEP_KEY, step.toString()).catch(() => {});
    setHelpOpen(false);
  }, [step]);

  // Auto-advance from the browser step when the app regains foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && hasOpenedBrowser.current && stepRef.current === 0) {
        hasOpenedBrowser.current = false;
        setStep(1);
      }
    });
    return () => sub.remove();
  }, []);

  const openBrowser = () => {
    Linking.openURL("https://kalshi.com/account/settings");
    hasOpenedBrowser.current = true;
  };

  const handleConnect = async () => {
    if (!apiKeyId.trim() || !privateKey.trim()) {
      Alert.alert("Required", "Please enter both your Key ID and Private Key.");
      return;
    }
    try {
      await connectKalshi.mutateAsync({
        apiKeyId: apiKeyId.trim(),
        privateKey: privateKey.trim(),
      });
      SecureStore.deleteItemAsync(STEP_KEY).catch(() => {});
      onSuccess();
    } catch (err: any) {
      Alert.alert("Connection Failed", err.message);
    }
  };

  const back = () => (step === 0 ? onBack() : setStep((s) => s - 1));
  const next = () => setStep((s) => Math.min(s + 1, TOTAL - 1));
  const isLast = step === TOTAL - 1;

  return (
    <View style={wz.container}>
      <WizardProgress step={step} total={TOTAL} />

      <ScrollView
        style={wz.scroll}
        contentContainerStyle={wz.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Step 0: Open browser ─────────────────────────────────────── */}
        {step === 0 && (
          <View>
            <Text style={wz.stepTitle}>Open your Kalshi account settings.</Text>
            <Pressable style={wz.browserBtn} onPress={openBrowser} accessibilityLabel="Open Kalshi">
              <Ionicons name="open-outline" size={20} color="#fff" />
              <Text style={wz.browserBtnText}>Open Kalshi</Text>
            </Pressable>
            <Text style={wz.stepHint}>
              This opens Kalshi in your browser. Come back here when you arrive at the API Keys page.
            </Text>
            <Pressable style={wz.manualNext} onPress={next}>
              <Text style={wz.manualNextText}>Already on the API Keys page? Continue →</Text>
            </Pressable>
          </View>
        )}

        {/* ── Step 1: Tap Create API Key ────────────────────────────────── */}
        {step === 1 && (
          <View>
            <Text style={wz.stepTitle}>Tap "Create API Key."</Text>
            <KalshiMockupApiKeys />
            <Text style={wz.stepHint}>Once you've created your key, tap Next.</Text>
          </View>
        )}

        {/* ── Step 2: Copy Key ID ───────────────────────────────────────── */}
        {step === 2 && (
          <View>
            <Text style={wz.stepTitle}>Copy your Key ID.</Text>
            <KalshiMockupKeyId />
            <Text style={wz.stepHint}>
              This is a long string of letters and numbers. Copy it to your clipboard — you'll paste it into NORMA in a moment.
            </Text>
          </View>
        )}

        {/* ── Step 3: Download .pem ─────────────────────────────────────── */}
        {step === 3 && (
          <View>
            <Text style={wz.stepTitle}>Download your Private Key file.</Text>
            <KalshiMockupDownloadPem />
            <Text style={wz.stepHint}>
              Kalshi will save a .pem file to your device. You'll need the contents of that file in the next step.
            </Text>
          </View>
        )}

        {/* ── Step 4: Paste credentials ─────────────────────────────────── */}
        {step === 4 && (
          <View>
            <Text style={wz.stepTitle}>Paste your credentials into NORMA.</Text>

            <Text style={wz.fieldLabel}>Key ID — paste here</Text>
            <TextInput
              style={wz.input}
              placeholder="e.g. 12a3b4c5-d6e7-8f90-..."
              placeholderTextColor="#475569"
              value={apiKeyId}
              onChangeText={setApiKeyId}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={wz.fieldLabel}>Private Key — paste the full contents of your .pem file here</Text>
            <TextInput
              style={[wz.input, wz.inputMultiline]}
              placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
              placeholderTextColor="#475569"
              value={privateKey}
              onChangeText={setPrivateKey}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              textAlignVertical="top"
            />

            <View style={wz.securityNote}>
              <Ionicons name="shield-checkmark-outline" size={15} color="#22c55e" />
              <Text style={wz.securityText}>
                Your key is stored securely and only used server-side to read your positions. NORMA will never place trades on your behalf.
              </Text>
            </View>
          </View>
        )}

        <NeedHelp
          faqs={FAQS[step] ?? []}
          open={helpOpen}
          onToggle={() => setHelpOpen((v) => !v)}
        />
      </ScrollView>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <View style={wz.footer}>
        <Pressable style={wz.backBtn} onPress={back} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={16} color="#94a3b8" />
          <Text style={wz.backText}>Back</Text>
        </Pressable>

        {!isLast && step > 0 && (
          <Pressable style={wz.nextBtn} onPress={next} accessibilityLabel="Next step">
            <Text style={wz.nextText}>Next</Text>
            <Ionicons name="chevron-forward" size={16} color="#fff" />
          </Pressable>
        )}

        {isLast && (
          <Pressable
            style={[wz.nextBtn, connectKalshi.isPending && wz.nextBtnDisabled]}
            onPress={handleConnect}
            disabled={connectKalshi.isPending}
            accessibilityLabel="Connect Kalshi"
          >
            {connectKalshi.isPending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={wz.nextText}>Connect Kalshi</Text>
            }
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function WizardProgress({ step, total }: { step: number; total: number }) {
  const pct = Math.round(((step + 1) / total) * 100);
  return (
    <View style={prog.outer}>
      <View style={prog.track}>
        <View style={[prog.fill, { width: `${pct}%` as `${number}%` }]} />
      </View>
      <Text style={prog.label}>Step {step + 1} of {total}</Text>
    </View>
  );
}

function NeedHelp({
  faqs, open, onToggle,
}: {
  faqs: { q: string; a: string }[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={nh.container}>
      <Pressable style={nh.trigger} onPress={onToggle} accessibilityLabel="Need help?">
        <Ionicons
          name={open ? "chevron-up-circle-outline" : "help-circle-outline"}
          size={16}
          color="#f97316"
        />
        <Text style={nh.triggerText}>Need help?</Text>
      </Pressable>
      {open && (
        <View style={nh.list}>
          {faqs.map((item, i) => (
            <View key={i} style={[nh.item, i < faqs.length - 1 && nh.itemBorder]}>
              <Text style={nh.q}>{item.q}</Text>
              <Text style={nh.a}>{item.a}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function MockupFrame({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <View style={mk.frame}>
      <View style={mk.chrome}>
        <Ionicons name="lock-closed" size={9} color="#64748b" />
        <Text style={mk.chromeUrl} numberOfLines={1}>{url}</Text>
      </View>
      <View style={mk.page}>{children}</View>
    </View>
  );
}

function Annotated({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={mk.annotatedOuter}>
      <View style={mk.annotatedHighlight}>{children}</View>
      <View style={mk.annotationRow}>
        <Ionicons name="arrow-up" size={13} color="#f97316" />
        <Text style={mk.annotationLabel}>{label}</Text>
      </View>
    </View>
  );
}

// ─── Kalshi mockup illustrations ─────────────────────────────────────────────

function KalshiMockupApiKeys() {
  return (
    <MockupFrame url="kalshi.com/account/settings">
      <Text style={mk.pageTitle}>API Keys</Text>
      <View style={mk.emptyCard}>
        <Text style={mk.emptyText}>No API keys created yet.</Text>
      </View>
      <Annotated label="Tap this button">
        <View style={mk.mockActionBtn}>
          <Ionicons name="add" size={14} color="#f97316" />
          <Text style={mk.mockActionBtnText}>Create API Key</Text>
        </View>
      </Annotated>
    </MockupFrame>
  );
}

function KalshiMockupKeyId() {
  return (
    <MockupFrame url="kalshi.com/account/settings">
      <Text style={mk.pageTitle}>Key Details</Text>
      <Text style={mk.mockFieldLabel}>Key ID</Text>
      <Annotated label="Copy this value">
        <View style={mk.mockFieldRow}>
          <Text style={mk.mockFieldText} numberOfLines={1}>12a3b4c5-d6e7-8f90-ab12-...</Text>
          <Ionicons name="copy-outline" size={14} color="#94a3b8" />
        </View>
      </Annotated>
      <Text style={mk.mockFieldLabel}>Private Key</Text>
      <View style={mk.mockFieldRow}>
        <Text style={mk.mockFieldMuted}>Available for download below</Text>
      </View>
    </MockupFrame>
  );
}

function KalshiMockupDownloadPem() {
  return (
    <MockupFrame url="kalshi.com/account/settings">
      <Text style={mk.pageTitle}>Key Details</Text>
      <Text style={mk.mockFieldLabel}>Key ID</Text>
      <View style={mk.mockFieldRow}>
        <Text style={mk.mockFieldText} numberOfLines={1}>12a3b4c5-d6e7-8f90-ab12-...</Text>
      </View>
      <Text style={mk.mockFieldLabel}>Private Key</Text>
      <Annotated label="Tap to download .pem file">
        <View style={mk.mockActionBtn}>
          <Ionicons name="download-outline" size={14} color="#f97316" />
          <Text style={mk.mockActionBtnText}>Download Private Key</Text>
        </View>
      </Annotated>
    </MockupFrame>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const wz = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 },
  stepTitle: {
    color: "#f1f5f9",
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 30,
    marginBottom: 20,
    marginTop: 4,
  },
  stepHint: {
    color: "#94a3b8",
    fontSize: 14,
    lineHeight: 22,
    marginTop: 16,
  },
  browserBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f97316",
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
    marginBottom: 4,
  },
  browserBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  manualNext: { alignSelf: "center", paddingVertical: 14 },
  manualNextText: { color: "#64748b", fontSize: 13 },
  fieldLabel: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 20,
  },
  input: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: "#f1f5f9",
    fontSize: 14,
    fontFamily: "monospace",
  },
  inputMultiline: { minHeight: 120, textAlignVertical: "top" },
  securityNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(34, 197, 94, 0.08)",
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
    gap: 10,
  },
  securityText: { color: "#86efac", fontSize: 12, lineHeight: 18, flex: 1 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
    gap: 12,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  backText: { color: "#94a3b8", fontSize: 15, fontWeight: "600" },
  nextBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f97316",
    borderRadius: 12,
    paddingVertical: 14,
    gap: 6,
  },
  nextBtnDisabled: { opacity: 0.5 },
  nextText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});

const prog = StyleSheet.create({
  outer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  track: {
    height: 4,
    backgroundColor: "#1e293b",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 8,
  },
  fill: {
    height: "100%",
    backgroundColor: "#f97316",
    borderRadius: 2,
  },
  label: { color: "#64748b", fontSize: 12, fontWeight: "600" },
});

const nh = StyleSheet.create({
  container: { marginTop: 28, marginBottom: 8 },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  triggerText: { color: "#f97316", fontSize: 14, fontWeight: "600" },
  list: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    marginTop: 12,
    overflow: "hidden",
  },
  item: { padding: 14 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: "#334155" },
  q: { color: "#f1f5f9", fontSize: 13, fontWeight: "600", marginBottom: 4 },
  a: { color: "#94a3b8", fontSize: 13, lineHeight: 19 },
});

const mk = StyleSheet.create({
  frame: {
    backgroundColor: "#1e293b",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 4,
  },
  chrome: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#0f172a",
    gap: 6,
  },
  chromeUrl: { color: "#64748b", fontSize: 11, flex: 1 },
  page: { padding: 14 },
  pageTitle: { color: "#f1f5f9", fontSize: 15, fontWeight: "700", marginBottom: 12 },
  emptyCard: {
    backgroundColor: "#334155",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    alignItems: "center",
  },
  emptyText: { color: "#64748b", fontSize: 12 },
  mockActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#334155",
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  mockActionBtnText: { color: "#f97316", fontSize: 13, fontWeight: "600" },
  mockFieldLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 4,
    marginTop: 10,
  },
  mockFieldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#334155",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mockFieldText: { color: "#94a3b8", fontSize: 12, flex: 1, fontFamily: "monospace" },
  mockFieldMuted: { color: "#475569", fontSize: 12, fontStyle: "italic" },
  annotatedOuter: { marginBottom: 4 },
  annotatedHighlight: { borderRadius: 8, borderWidth: 1.5, borderColor: "#f97316" },
  annotationRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 5,
    paddingLeft: 4,
    gap: 4,
  },
  annotationLabel: { color: "#f97316", fontSize: 11, fontWeight: "600" },
});
