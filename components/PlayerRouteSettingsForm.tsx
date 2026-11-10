import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ATTESTATION_LABEL,
  DISCLOSURE_BODY,
  ENCODING_GATE_MESSAGE,
  REINSTALL_BODY,
  UNAVAILABLE_BODY,
} from "../lib/player-routes/copy";

export interface PlayerRouteSettingsRoute {
  id: string;
  feedLabel: string;
  label: string;
  enabled: boolean;
  confirmed: boolean;
}

export interface PlayerRouteSettingsModel {
  configurationAllowed: boolean;
  encodingBlocked: boolean;
  optIn: boolean;
  reinstallLocked: boolean;
  feeds: { id: string; label: string }[];
  routes: PlayerRouteSettingsRoute[];
  hasDeletableData: boolean;
}

export function PlayerRouteSettingsForm({
  model,
  onOptIn,
  onDisableOptIn,
  onSave,
  onTest,
  onConfirm,
  onToggleEnabled,
  onDelete,
  onDeleteAll,
  onAcknowledgeReinstall,
}: {
  model: PlayerRouteSettingsModel;
  onOptIn: () => Promise<string | null>;
  onDisableOptIn: () => Promise<void>;
  onSave: (input: { feedId: string; label: string; streamUrl: string }) => Promise<string | null>;
  onTest: (routeId: string) => Promise<{ message: string; accepted: boolean }>;
  onConfirm: (routeId: string) => Promise<string | null>;
  onToggleEnabled: (routeId: string, enabled: boolean) => Promise<void>;
  onDelete: (routeId: string) => Promise<void>;
  onDeleteAll: () => Promise<void>;
  onAcknowledgeReinstall: () => Promise<void>;
}) {
  const [attested, setAttested] = useState(false);
  const [feedId, setFeedId] = useState(model.feeds[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [reveal, setReveal] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tested, setTested] = useState<Record<string, boolean>>({});

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Your own player</Text>
      <Text style={styles.body}>{model.configurationAllowed ? DISCLOSURE_BODY : UNAVAILABLE_BODY}</Text>
      {model.reinstallLocked ? <Text style={styles.body}>{REINSTALL_BODY}</Text> : null}
      {model.encodingBlocked ? <Text style={styles.note}>{ENCODING_GATE_MESSAGE}</Text> : null}
      {message ? (
        <Text testID="player-route-message" style={styles.message}>
          {message}
        </Text>
      ) : null}

      {model.configurationAllowed ? (
        <View>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: attested }}
            onPress={() => setAttested((value) => !value)}
            style={styles.row}
          >
            <Text style={styles.body}>{attested ? "Checked. " : "Not checked. "}{ATTESTATION_LABEL}</Text>
          </Pressable>
          {!model.optIn ? (
            <Pressable
              accessibilityLabel="Turn on your own player for this account"
              disabled={!attested}
              onPress={() => {
                void onOptIn().then((error) => setMessage(error));
              }}
              style={[styles.primary, !attested ? styles.disabled : null]}
            >
              <Text style={styles.primaryText}>Turn on for this account</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityLabel="Turn off your own player" onPress={() => void onDisableOptIn()}>
              <Text style={styles.link}>Turn off for this account</Text>
            </Pressable>
          )}

          <Text style={styles.section}>National feed</Text>
          {model.feeds.map((feed) => (
            <Pressable key={feed.id} accessibilityLabel={feed.label} onPress={() => setFeedId(feed.id)} style={styles.row}>
              <Text style={styles.body}>{feed.id === feedId ? "Selected. " : ""}{feed.label}</Text>
            </Pressable>
          ))}
          <Text style={styles.section}>Optional label</Text>
          <TextInput
            accessibilityLabel="Route label"
            value={label}
            onChangeText={setLabel}
            maxLength={40}
            style={styles.input}
            placeholder="Label"
            placeholderTextColor="#64748b"
          />
          <Text style={styles.section}>HTTPS HLS address</Text>
          <TextInput
            accessibilityLabel="Stream address"
            testID="player-route-url-input"
            value={streamUrl}
            onChangeText={setStreamUrl}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!reveal}
            style={styles.input}
            placeholder="https://"
            placeholderTextColor="#64748b"
          />
          <Pressable accessibilityLabel={reveal ? "Hide address" : "Show address"} onPress={() => setReveal((value) => !value)}>
            <Text style={styles.link}>{reveal ? "Hide address" : "Show address"}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Save stream mapping"
            onPress={() => {
              void onSave({ feedId, label, streamUrl }).then((error) => {
                setMessage(error ?? "Saved on this device only.");
                if (!error) setStreamUrl("");
              });
            }}
            style={styles.primary}
          >
            <Text style={styles.primaryText}>Save mapping</Text>
          </Pressable>
        </View>
      ) : null}

      {model.routes.map((route) => (
        <View key={route.id} style={styles.card}>
          <Text style={styles.body}>{route.feedLabel}</Text>
          {route.label ? <Text style={styles.note}>{route.label}</Text> : null}
          <Text style={styles.note}>{route.confirmed ? "You confirmed this mapping." : "Not confirmed. NORMA will not open it."}</Text>
          <View style={styles.inline}>
            <Text style={styles.body}>Enabled</Text>
            <Switch
              accessibilityLabel={`Enable ${route.feedLabel}`}
              value={route.enabled}
              onValueChange={(enabled) => void onToggleEnabled(route.id, enabled)}
            />
          </View>
          <Pressable
            accessibilityLabel="Test in StrymTV"
            onPress={() => {
              void onTest(route.id).then((result) => {
                setMessage(result.message);
                setTested((current) => ({ ...current, [route.id]: result.accepted }));
              });
            }}
          >
            <Text style={styles.link}>Test in StrymTV</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Confirm this feed"
            disabled={!tested[route.id] || model.encodingBlocked}
            onPress={() => void onConfirm(route.id).then((error) => setMessage(error))}
          >
            <Text style={styles.link}>This opened the feed I expected</Text>
          </Pressable>
          <Pressable accessibilityLabel={`Delete ${route.feedLabel}`} onPress={() => void onDelete(route.id)}>
            <Text style={styles.danger}>Delete</Text>
          </Pressable>
        </View>
      ))}

      {model.reinstallLocked ? (
        <Pressable accessibilityLabel="Keep locked player routes for review" onPress={() => void onAcknowledgeReinstall()}>
          <Text style={styles.link}>Keep locked and review later</Text>
        </Pressable>
      ) : null}
      {model.hasDeletableData || model.routes.length > 0 || model.reinstallLocked ? (
        <Pressable accessibilityLabel="Delete all player routes" onPress={() => void onDeleteAll()} style={styles.dangerButton}>
          <Text style={styles.danger}>Delete all player routes</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0f172a" },
  content: { padding: 16, paddingBottom: 40 },
  title: { color: "#ffffff", fontSize: 24, fontWeight: "900", marginBottom: 12 },
  section: { color: "#94a3b8", fontSize: 12, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  body: { color: "#e2e8f0", fontSize: 15, lineHeight: 22 },
  note: { color: "#94a3b8", fontSize: 13, marginTop: 8, lineHeight: 18 },
  message: { color: "#fdba74", fontSize: 14, marginTop: 12 },
  row: { paddingVertical: 8 },
  card: { backgroundColor: "#1e293b", borderRadius: 16, padding: 16, marginTop: 16 },
  inline: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  input: {
    backgroundColor: "#1e293b",
    color: "#ffffff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  primary: { backgroundColor: "#f97316", borderRadius: 12, padding: 14, marginTop: 12, alignItems: "center" },
  primaryText: { color: "#ffffff", fontWeight: "700" },
  disabled: { opacity: 0.4 },
  link: { color: "#fdba74", fontSize: 15, marginTop: 12 },
  danger: { color: "#f87171", fontSize: 15, fontWeight: "700" },
  dangerButton: { marginTop: 20, padding: 14, alignItems: "center" },
});
