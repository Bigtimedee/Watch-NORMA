import { useState } from "react";
import { View, Text, TextInput, Pressable, Alert, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useConnectPolymarket } from "../hooks/usePolymarket";

interface PolymarketConnectProps {
  onSuccess: () => void;
}

export function PolymarketConnect({ onSuccess }: PolymarketConnectProps) {
  const connectPoly = useConnectPolymarket();
  const [walletAddress, setWalletAddress] = useState("");

  const handleConnect = async () => {
    if (!walletAddress.trim()) {
      Alert.alert("Required", "Please enter your wallet address.");
      return;
    }

    try {
      await connectPoly.mutateAsync(walletAddress.trim());
      onSuccess();
    } catch (error: any) {
      Alert.alert("Connection Failed", error.message);
    }
  };

  return (
    <View style={s.container}>
      <View style={s.infoCard}>
        <Ionicons name="wallet-outline" size={20} color="#f97316" />
        <Text style={s.infoText}>
          Enter the Ethereum/Polygon wallet address you use on Polymarket.
          We'll read your public on-chain positions.
        </Text>
      </View>

      <Text style={s.label}>Wallet Address</Text>
      <TextInput
        style={s.input}
        placeholderTextColor="#64748b"
        placeholder="0x..."
        value={walletAddress}
        onChangeText={setWalletAddress}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={s.securityNote}>
        <Ionicons name="eye-outline" size={16} color="#6366f1" />
        <Text style={s.securityText}>
          This is read-only. We only use your public wallet address to view
          your positions. No private keys required.
        </Text>
      </View>

      <Pressable
        style={[s.connectBtn, connectPoly.isPending && s.connectBtnDisabled]}
        onPress={handleConnect}
        disabled={connectPoly.isPending}
      >
        <Text style={s.connectBtnText}>
          {connectPoly.isPending ? "Connecting..." : "Connect Polymarket"}
        </Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: 16 },
  infoCard: {
    backgroundColor: "rgba(249, 115, 22, 0.1)",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  infoText: { color: "#cbd5e1", fontSize: 14, marginLeft: 12, flex: 1 },
  label: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: "#ffffff",
    fontSize: 14,
    fontFamily: "monospace",
  },
  securityNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 16,
    paddingHorizontal: 4,
  },
  securityText: { color: "#94a3b8", fontSize: 12, marginLeft: 8, flex: 1 },
  connectBtn: {
    backgroundColor: "#f97316",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  connectBtnDisabled: { opacity: 0.6 },
  connectBtnText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
