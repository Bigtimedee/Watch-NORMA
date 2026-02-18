import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  Linking,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useConnectKalshi } from "../hooks/useKalshi";

interface KalshiConnectProps {
  onSuccess: () => void;
}

export function KalshiConnect({ onSuccess }: KalshiConnectProps) {
  const connectKalshi = useConnectKalshi();
  const [apiKeyId, setApiKeyId] = useState("");
  const [privateKey, setPrivateKey] = useState("");

  const handleConnect = async () => {
    if (!apiKeyId.trim() || !privateKey.trim()) {
      Alert.alert("Required", "Please enter both your API Key ID and Private Key.");
      return;
    }

    try {
      await connectKalshi.mutateAsync({
        apiKeyId: apiKeyId.trim(),
        privateKey: privateKey.trim(),
      });
      onSuccess();
    } catch (error: any) {
      Alert.alert("Connection Failed", error.message);
    }
  };

  return (
    <View style={s.container}>
      {/* Step-by-step instructions */}
      <View style={s.infoCard}>
        <Ionicons name="key-outline" size={20} color="#f97316" />
        <View style={s.infoContent}>
          <Text style={s.infoTitle}>How to get your API key:</Text>
          <Text style={s.infoStep}>1. Log in to kalshi.com</Text>
          <Text style={s.infoStep}>
            2. Go to Settings {'>'} API Keys
          </Text>
          <Text style={s.infoStep}>3. Create a new API key</Text>
          <Text style={s.infoStep}>
            4. Copy the Key ID and download the Private Key file
          </Text>
        </View>
      </View>

      <Pressable
        style={s.linkBtn}
        onPress={() => Linking.openURL("https://kalshi.com/account/settings")}
      >
        <Ionicons name="open-outline" size={16} color="#fb923c" />
        <Text style={s.linkText}>Open Kalshi Settings</Text>
      </Pressable>

      <Text style={s.label}>API Key ID</Text>
      <TextInput
        style={s.input}
        placeholderTextColor="#64748b"
        placeholder="e.g. 12a3b4c5-d6e7-8f90-..."
        value={apiKeyId}
        onChangeText={setApiKeyId}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={s.label}>RSA Private Key</Text>
      <TextInput
        style={[s.input, s.multilineInput]}
        placeholderTextColor="#64748b"
        placeholder={"Paste the contents of your .pem file"}
        value={privateKey}
        onChangeText={setPrivateKey}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        textAlignVertical="top"
      />

      <View style={s.securityNote}>
        <Ionicons name="shield-checkmark-outline" size={16} color="#22c55e" />
        <Text style={s.securityText}>
          Your key is stored securely and only used server-side to read your
          positions. NORMA will never place trades on your behalf.
        </Text>
      </View>

      <Pressable
        style={[s.connectBtn, connectKalshi.isPending && s.connectBtnDisabled]}
        onPress={handleConnect}
        disabled={connectKalshi.isPending}
      >
        <Text style={s.connectBtnText}>
          {connectKalshi.isPending ? "Verifying..." : "Connect Kalshi"}
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
    marginBottom: 12,
  },
  infoContent: { marginLeft: 12, flex: 1 },
  infoTitle: { color: "#cbd5e1", fontSize: 14, fontWeight: "600", marginBottom: 8 },
  infoStep: { color: "#94a3b8", fontSize: 13, marginBottom: 4 },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  linkText: { color: "#fb923c", fontSize: 14, fontWeight: "600", marginLeft: 6 },
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
  multilineInput: { minHeight: 100 },
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
