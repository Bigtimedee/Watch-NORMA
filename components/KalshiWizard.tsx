import { useState, useEffect, useRef } from "react";
import {
  View, Text, Pressable, TextInput, Alert, Linking,
  AppState, ScrollView, StyleSheet, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useConnectKalshi } from "../hooks/useKalshi";

const STEP_KEY = "wizard_kalshi_step";
const TOTAL = 7;

// Step index constants for clarity
const STEP_WHY = 0;        // Why connect Kalshi? (new)
const STEP_BROWSER = 1;    // Open Kalshi in browser
const STEP_CREATE = 2;     // Create API Key
const STEP_KEY_ID = 3;     // Copy Key ID
const STEP_PEM = 4;        // Download .pem
const STEP_CREDS = 5;      // Paste credentials + Test Connection
const STEP_DONE = 6;       // What happens next (confirmation)

const FAQS: { q: string; a: string }[][] = [
  // Step 0: Why connect
  [
    { q: "Will NORMA be able to place trades for me?", a: "No. NORMA only reads your open positions — it can never place, modify, or cancel trades on your behalf." },
    { q: "Do I need a Kalshi account?", a: "Yes — you need an active account at kalshi.com. Registration is free." },
  ],
  // Step 1: Open browser
  [
    { q: "What is a Kalshi API key?", a: "An API key lets NORMA securely read your open Kalshi positions without your password. NORMA can never place or cancel trades." },
    { q: "Do I need a Kalshi account?", a: "Yes — you need an active account at kalshi.com. Registration is free." },
  ],
  // Step 2: Create API Key
  [
    { q: "I don't see a Create API Key button.", a: "Make sure you're on Settings → API Keys. Try scrolling down or refreshing the page in your browser." },
    { q: "Can I create more than one key?", a: "Yes. Create a dedicated key for NORMA and revoke it at any time from Kalshi's settings." },
  ],
  // Step 3: Copy Key ID
  [
    { q: "What does the Key ID look like?", a: "A UUID — a long string in the format 12a3b4c5-d6e7-8f90-ab12-... Copy the entire value." },
    { q: "Can I come back and copy it later?", a: "Yes — the Key ID is always visible in Settings → API Keys. The Private Key file, however, can only be downloaded once." },
  ],
  // Step 4: Download .pem
  [
    { q: "What is a .pem file?", a: "A plain-text file containing your RSA private key. You'll need to open it and paste the full contents — including the -----BEGIN PRIVATE KEY----- header and footer." },
    { q: "Where does Kalshi save it?", a: "Usually your browser's Downloads folder, or the iOS Files / Android Downloads app." },
  ],
  // Step 5: Paste credentials
  [
    { q: "Is it safe to paste my private key here?", a: "Yes. It's sent over HTTPS, stored in a secure server-side vault, and used only to sign read-only API requests. NORMA never places trades." },
    { q: "I'm getting a Connection Failed error.", a: "Make sure you pasted the complete Key ID and the full .pem contents — including the -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY----- lines." },
  ],
  // Step 6: Done — no help needed
  [],
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
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testError, setTestError] = useState<string | null>(null);
  const connectKalshi = useConnectKalshi();
  const hasOpenedBrowser = useRef(false);
  const stepRef = useRef(0);

  // Restore last step on mount (don't restore the "done" confirmation screen)
  useEffect(() => {
    SecureStore.getItemAsync(STEP_KEY).then((v) => {
      if (v !== null) {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n > 0 && n < STEP_DONE) {
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
    // Reset test status when leaving the credentials step
    if (step !== STEP_CREDS) {
      setTestStatus("idle");
      setTestError(null);
    }
  }, [step]);

  // Auto-advance from the browser step when the app regains foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && hasOpenedBrowser.current && stepRef.current === STEP_BROWSER) {
        hasOpenedBrowser.current = false;
        setStep(STEP_CREATE);
      }
    });
    return () => sub.remove();
  }, []);

  const openBrowser = () => {
    Linking.openURL("https://kalshi.com/account/settings");
    hasOpenedBrowser.current = true;
  };

  const handleTestConnection = async () => {
    if (!apiKeyId.trim() || !privateKey.trim()) {
      Alert.alert("Required", "Please enter both your Key ID and Private Key.");
      return;
    }
    setTestStatus("testing");
    setTestError(null);
    try {
      await connectKalshi.mutateAsync({
        apiKeyId: apiKeyId.trim(),
        privateKey: privateKey.trim(),
      });
      setTestStatus("success");
      SecureStore.deleteItemAsync(STEP_KEY).catch(() => {});
    } catch (err: any) {
      setTestStatus("error");
      setTestError(err.message ?? "Connection failed. Check your Key ID and Private Key.");
    }
  };

  const back = () => (step === 0 ? onBack() : setStep((s) => s - 1));
  const next = () => setStep((s) => Math.min(s + 1, TOTAL - 1));

  return (
    <View style={wz.container}>
      {/* Hide progress bar on the done screen */}
      {step < STEP_DONE && <WizardProgress step={step} total={STEP_DONE} />}

      <ScrollView
        style={wz.scroll}
        contentContainerStyle={wz.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Step 0: Why connect Kalshi? ───────────────────────────────── */}
        {step === STEP_WHY && (
          <View>
            <Text style={wz.stepTitle}>Know when your Kalshi positions are resolving.</Text>
            <Text style={wz.stepIntro}>
              NORMA will alert you when your Kalshi positions are resolving — no need to watch the game yourself.
            </Text>
            <View style={wz.bulletList}>
              <BulletRow icon="alert-circle-outline" text="Know when your sports position is at risk" />
              <BulletRow icon="timer-outline" text="Get alerted in the final 5 minutes of a resolving market" />
              <BulletRow icon="stats-chart-outline" text="Track all your positions in one place" />
            </View>
            <Pressable style={wz.primaryCta} onPress={next} accessibilityLabel="Connect Kalshi">
              <Text style={wz.primaryCtaText}>Connect Kalshi</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </Pressable>
          </View>
        )}

        {/* ── Step 1: Open browser ─────────────────────────────────────── */}
        {step === STEP_BROWSER && (
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

        {/* ── Step 2: Tap Create API Key ────────────────────────────────── */}
        {step === STEP_CREATE && (
          <View>
            <Text style={wz.stepTitle}>Tap "Create API Key."</Text>
            <KalshiMockupApiKeys />
            <Text style={wz.stepHint}>Once you've created your key, tap Next.</Text>
          </View>
        )}

        {/* ── Step 3: Copy Key ID ───────────────────────────────────────── */}
        {step === STEP_KEY_ID && (
          <View>
            <Text style={wz.stepTitle}>Copy your Key ID.</Text>
            <KalshiMockupKeyId />
            <Text style={wz.stepHint}>
              This is a long string of letters and numbers. Copy it to your clipboard — you'll paste it into NORMA in a moment.
            </Text>
          </View>
        )}

        {/* ── Step 4: Download .pem ─────────────────────────────────────── */}
        {step === STEP_PEM && (
          <View>
            <Text style={wz.stepTitle}>Download your Private Key file.</Text>
            <KalshiMockupDownloadPem />
            <Text style={wz.stepHint}>
              Kalshi will save a .pem file to your device. You'll need the contents of that file in the next step.
            </Text>
          </View>
        )}

        {/* ── Step 5: Paste credentials + Test Connection ───────────────── */}
        {step === STEP_CREDS && (
          <View>
            <Text style={wz.stepTitle}>Paste your credentials into NORMA.</Text>

            {/* Inline tutorial */}
            <View style={wz.tutorial}>
              <Ionicons name="information-circle-outline" size={16} color="#f97316" />
              <Text style={wz.tutorialText}>
                Log in to kalshi.com → Settings → API → Create Key. Copy the Key ID (not the private key).
              </Text>
            </View>

            <Text style={wz.fieldLabel}>Key ID — paste here</Text>
            <TextInput
              style={wz.input}
              placeholder="e.g. 12a3b4c5-d6e7-8f90-..."
              placeholderTextColor="#475569"
              value={apiKeyId}
              onChangeText={(v) => { setApiKeyId(v); setTestStatus("idle"); setTestError(null); }}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={wz.fieldLabel}>Private Key — paste the full contents of your .pem file here</Text>
            <TextInput
              style={[wz.input, wz.inputMultiline]}
              placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
              placeholderTextColor="#475569"
              value={privateKey}
              onChangeText={(v) => { setPrivateKey(v); setTestStatus("idle"); setTestError(null); }}
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

            {/* Inline test feedback */}
            {testStatus === "error" && testError && (
              <View style={wz.feedbackError}>
                <Ionicons name="close-circle-outline" size={16} color="#f87171" />
                <Text style={wz.feedbackErrorText}>{testError}</Text>
              </View>
            )}
            {testStatus === "success" && (
              <View style={wz.feedbackSuccess}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#22c55e" />
                <Text style={wz.feedbackSuccessText}>Connection verified! Tap Next to continue.</Text>
              </View>
            )}

            {/* Test Connection button */}
            <Pressable
              style={[
                wz.testBtn,
                testStatus === "testing" && wz.testBtnDisabled,
                testStatus === "success" && wz.testBtnSuccess,
              ]}
              onPress={testStatus === "success" ? next : handleTestConnection}
              disabled={testStatus === "testing"}
              accessibilityLabel={testStatus === "success" ? "Next" : "Test Connection"}
            >
              {testStatus === "testing" ? (
                <>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={wz.testBtnText}>Verifying…</Text>
                </>
              ) : testStatus === "success" ? (
                <>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={wz.testBtnText}>Next</Text>
                </>
              ) : (
                <Text style={wz.testBtnText}>Test Connection</Text>
              )}
            </Pressable>
          </View>
        )}

        {/* ── Step 6: What happens next (confirmation) ─────────────────── */}
        {step === STEP_DONE && (
          <View style={wz.doneContainer}>
            <View style={wz.doneIconWrap}>
              <Ionicons name="checkmark-circle" size={56} color="#22c55e" />
            </View>
            <Text style={wz.doneTitle}>Kalshi connected.</Text>
            <View style={wz.doneCard}>
              <Text style={wz.doneCardHeading}>What happens next</Text>
              <Text style={wz.doneCardBody}>
                NORMA will check your Kalshi positions every 5 minutes. You'll receive a push notification when a sports position is entering its final resolution window.
              </Text>
            </View>
            <Pressable style={wz.doneCta} onPress={onSuccess} accessibilityLabel="Done">
              <Text style={wz.doneCtaText}>Done</Text>
            </Pressable>
          </View>
        )}

        {step < STEP_DONE && (
          <NeedHelp
            faqs={FAQS[step] ?? []}
            open={helpOpen}
            onToggle={() => setHelpOpen((v) => !v)}
          />
        )}
      </ScrollView>

      {/* ── Footer (hidden on done screen) ──────────────────────────────── */}
      {step < STEP_DONE && (
        <View style={wz.footer}>
          <Pressable style={wz.backBtn} onPress={back} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={16} color="#94a3b8" />
            <Text style={wz.backText}>Back</Text>
          </Pressable>

          {/* Show Next on all steps except WHY (has its own CTA) and CREDS (has Test btn) */}
          {step > STEP_WHY && step < STEP_CREDS && (
            <Pressable style={wz.nextBtn} onPress={next} accessibilityLabel="Next step">
              <Text style={wz.nextText}>Next</Text>
              <Ionicons name="chevron-forward" size={16} color="#fff" />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Bullet row helper ────────────────────────────────────────────────────────

function BulletRow({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>["name"]; text: string }) {
  return (
    <View style={bl.row}>
      <Ionicons name={icon} size={20} color="#f97316" style={bl.icon} />
      <Text style={bl.text}>{text}</Text>
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
  if (faqs.length === 0) return null;
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
    marginBottom: 16,
    marginTop: 4,
  },
  stepIntro: {
    color: "#94a3b8",
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 24,
  },
  stepHint: {
    color: "#94a3b8",
    fontSize: 14,
    lineHeight: 22,
    marginTop: 16,
  },
  // "Why connect" bullet list
  bulletList: {
    marginBottom: 32,
    gap: 12,
  },
  // "Why connect" primary CTA
  primaryCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f97316",
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
  },
  primaryCtaText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  // Browser step button
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
  // Credentials step
  tutorial: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(249, 115, 22, 0.08)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
    gap: 10,
  },
  tutorialText: { color: "#fdba74", fontSize: 13, lineHeight: 20, flex: 1 },
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
  // Inline feedback
  feedbackError: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(248, 113, 113, 0.1)",
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  feedbackErrorText: { color: "#f87171", fontSize: 13, lineHeight: 19, flex: 1 },
  feedbackSuccess: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  feedbackSuccessText: { color: "#22c55e", fontSize: 13, lineHeight: 19, flex: 1 },
  // Test Connection button
  testBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1e293b",
    borderWidth: 1.5,
    borderColor: "#f97316",
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 20,
    gap: 8,
  },
  testBtnDisabled: { opacity: 0.5 },
  testBtnSuccess: { backgroundColor: "#166534", borderColor: "#22c55e" },
  testBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  // Done screen
  doneContainer: {
    alignItems: "center",
    paddingTop: 32,
  },
  doneIconWrap: {
    marginBottom: 20,
  },
  doneTitle: {
    color: "#f1f5f9",
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 28,
  },
  doneCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    marginBottom: 32,
  },
  doneCardHeading: {
    color: "#f97316",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  doneCardBody: {
    color: "#cbd5e1",
    fontSize: 15,
    lineHeight: 24,
  },
  doneCta: {
    backgroundColor: "#f97316",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: "center",
  },
  doneCtaText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  // Footer
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

const bl = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  icon: { marginTop: 1 },
  text: {
    color: "#cbd5e1",
    fontSize: 15,
    lineHeight: 22,
    flex: 1,
  },
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
