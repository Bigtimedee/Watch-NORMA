import { useState, useEffect, useRef } from "react";
import {
  View, Text, Pressable, TextInput, Linking,
  AppState, ScrollView, StyleSheet, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useConnectPolymarket } from "../hooks/usePolymarket";

const STEP_KEY = "wizard_polymarket_step";
const TOTAL = 3;

const FAQS: { q: string; a: string }[][] = [
  [
    { q: "What is a wallet address?", a: "A unique public identifier for your crypto wallet, starting with 0x. It's not sensitive — sharing it is safe." },
    { q: "What if I have multiple wallets?", a: "Use whichever wallet address you used on Polymarket to place your positions." },
  ],
  [
    { q: "Where do I find my wallet address on Polymarket?", a: "Go to your profile or portfolio page — the address appears near your account name, starting with 0x." },
    { q: "I use a browser extension wallet. Where do I find it?", a: "Open your wallet extension (MetaMask, Coinbase Wallet, etc.) and the address is displayed at the top." },
  ],
  [
    { q: "What format should the address be?", a: "Starts with 0x followed by exactly 40 hexadecimal characters — letters a–f and numbers 0–9." },
    { q: "Why does NORMA need this?", a: "Polymarket positions are stored on-chain. Your public wallet address is the only thing needed to read them." },
  ],
];

// ─── Main export ──────────────────────────────────────────────────────────────

interface PolymarketWizardProps {
  onSuccess: () => void;
  onBack: () => void;
}

export function PolymarketWizard({ onSuccess, onBack }: PolymarketWizardProps) {
  const [step, setStep] = useState(0);
  const [walletAddress, setWalletAddress] = useState("");
  const [addressError, setAddressError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const connectPoly = useConnectPolymarket();
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
    setAddressError("");
  }, [step]);

  // Auto-advance from step 1 (browser step) when the app regains foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && hasOpenedBrowser.current && stepRef.current === 1) {
        hasOpenedBrowser.current = false;
        setStep(2);
      }
    });
    return () => sub.remove();
  }, []);

  const openBrowser = () => {
    Linking.openURL("https://polymarket.com");
    hasOpenedBrowser.current = true;
  };

  const handleConnect = async () => {
    const trimmed = walletAddress.trim();
    if (!trimmed) {
      setAddressError("Please enter your wallet address.");
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      setAddressError("Invalid Ethereum or Polygon wallet address — please check and try again.");
      return;
    }
    setAddressError("");
    try {
      await connectPoly.mutateAsync(trimmed);
      SecureStore.deleteItemAsync(STEP_KEY).catch(() => {});
      onSuccess();
    } catch (err: any) {
      setAddressError(err.message ?? "Connection failed — please try again.");
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
        {/* ── Step 0: What we need ─────────────────────────────────────── */}
        {step === 0 && (
          <View>
            <Text style={wz.stepTitle}>We need your Polymarket wallet address.</Text>
            <View style={wz.infoCard}>
              <Ionicons name="wallet-outline" size={22} color="#f97316" style={{ marginTop: 2 }} />
              <Text style={wz.infoCardText}>
                This is your public Ethereum or Polygon wallet address. It is public information — no private key is required. We use it only to read your open positions.
              </Text>
            </View>
          </View>
        )}

        {/* ── Step 1: Open browser ─────────────────────────────────────── */}
        {step === 1 && (
          <View>
            <Text style={wz.stepTitle}>Open Polymarket and find your wallet address.</Text>
            <Pressable style={wz.browserBtn} onPress={openBrowser} accessibilityLabel="Open Polymarket">
              <Ionicons name="open-outline" size={20} color="#fff" />
              <Text style={wz.browserBtnText}>Open Polymarket</Text>
            </Pressable>
            <PolymarketMockupWallet />
            <Text style={wz.stepHint}>
              Copy your wallet address — it starts with 0x followed by 40 characters. Then return to NORMA.
            </Text>
            <Pressable style={wz.manualNext} onPress={next}>
              <Text style={wz.manualNextText}>Already copied? Continue manually →</Text>
            </Pressable>
          </View>
        )}

        {/* ── Step 2: Paste address ─────────────────────────────────────── */}
        {step === 2 && (
          <View>
            <Text style={wz.stepTitle}>Paste your wallet address into NORMA.</Text>

            <Text style={wz.fieldLabel}>Wallet Address — paste here</Text>
            <TextInput
              style={[wz.input, !!addressError && wz.inputError]}
              placeholder="0x..."
              placeholderTextColor="#475569"
              value={walletAddress}
              onChangeText={(v) => {
                setWalletAddress(v);
                if (addressError) setAddressError("");
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {!!addressError && (
              <Text style={wz.fieldError}>{addressError}</Text>
            )}

            <View style={wz.securityNote}>
              <Ionicons name="eye-outline" size={15} color="#6366f1" style={{ marginTop: 1 }} />
              <Text style={wz.securityText}>
                This is read-only. We only use your public wallet address to view your positions. No private keys required.
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

        {!isLast && (
          <Pressable style={wz.nextBtn} onPress={next} accessibilityLabel="Next step">
            <Text style={wz.nextText}>Next</Text>
            <Ionicons name="chevron-forward" size={16} color="#fff" />
          </Pressable>
        )}

        {isLast && (
          <Pressable
            style={[wz.nextBtn, connectPoly.isPending && wz.nextBtnDisabled]}
            onPress={handleConnect}
            disabled={connectPoly.isPending}
            accessibilityLabel="Connect Polymarket"
          >
            {connectPoly.isPending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={wz.nextText}>Connect Polymarket</Text>
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

// ─── Polymarket mockup illustration ──────────────────────────────────────────

function PolymarketMockupWallet() {
  return (
    <MockupFrame url="polymarket.com">
      <View style={mk.navRow}>
        <Text style={mk.navTitle}>My Portfolio</Text>
        <View style={mk.navAvatar}>
          <Ionicons name="person" size={12} color="#94a3b8" />
        </View>
      </View>
      <Text style={mk.mockFieldLabel}>Wallet</Text>
      <Annotated label="Copy your address">
        <View style={mk.mockFieldRow}>
          <Text style={mk.mockFieldText} numberOfLines={1}>0x1a2b3c4d5e6f789a...</Text>
          <Ionicons name="copy-outline" size={14} color="#94a3b8" />
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
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(249, 115, 22, 0.08)",
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  infoCardText: { color: "#cbd5e1", fontSize: 14, lineHeight: 22, flex: 1 },
  browserBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#8b5cf6",
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
    marginBottom: 16,
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
  inputError: { borderWidth: 1.5, borderColor: "#f87171" },
  fieldError: { color: "#f87171", fontSize: 13, marginTop: 8, lineHeight: 18 },
  securityNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(99, 102, 241, 0.08)",
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
    gap: 10,
  },
  securityText: { color: "#a5b4fc", fontSize: 12, lineHeight: 18, flex: 1 },
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
    backgroundColor: "#8b5cf6",
    borderRadius: 12,
    paddingVertical: 14,
    gap: 6,
  },
  nextBtnDisabled: { opacity: 0.5 },
  nextText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});

const prog = StyleSheet.create({
  outer: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  track: {
    height: 4,
    backgroundColor: "#1e293b",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 8,
  },
  fill: { height: "100%", backgroundColor: "#8b5cf6", borderRadius: 2 },
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
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  navTitle: { color: "#f1f5f9", fontSize: 15, fontWeight: "700" },
  navAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  mockFieldLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 4,
    marginTop: 4,
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
  annotatedOuter: { marginBottom: 4 },
  annotatedHighlight: { borderRadius: 8, borderWidth: 1.5, borderColor: "#8b5cf6" },
  annotationRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 5,
    paddingLeft: 4,
    gap: 4,
  },
  annotationLabel: { color: "#8b5cf6", fontSize: 11, fontWeight: "600" },
});
