import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../hooks/useAuth";
import {
  PlayerRouteSettingsForm,
  type PlayerRouteSettingsModel,
} from "../../../components/PlayerRouteSettingsForm";
import { listMappableFeeds, feedById } from "../../../lib/player-routes/canonical-feeds";
import {
  ENCODING_GATE_MESSAGE,
  handoffFailureCopy,
  validationMessage,
} from "../../../lib/player-routes/copy";
import { STRYMTV_ENCODING_GATE, productionHandoffPermitted } from "../../../lib/player-routes/encoding-gate";
import { refreshPlayerRouteControl, shippedPlayerRouteRepository } from "../../../lib/player-routes/runtime";
import type { ValidationReason } from "../../../lib/player-routes/url-validation";

const VALIDATION_REASONS = new Set<ValidationReason>([
  "empty",
  "malformed",
  "too_long",
  "whitespace_or_control",
  "bad_percent_encoding",
  "null_byte",
  "not_https",
  "not_hls",
  "userinfo",
  "credential_query",
  "credential_path",
  "nested_scheme",
  "fragment",
  "ambiguous_normalization",
  "local_or_private_host",
  "invalid_host",
]);

function messageFor(reason: string | undefined): string {
  if (reason && VALIDATION_REASONS.has(reason as ValidationReason)) {
    return validationMessage(reason as ValidationReason);
  }
  if (reason === "encoding_gate") return ENCODING_GATE_MESSAGE;
  if (reason === "feature_unavailable") return "This experimental player option is not available.";
  if (reason === "attestation_required") return "Turn on your own player and confirm the rights statement first.";
  if (reason === "label") return "Use a short label with no web address.";
  if (reason === "feed") return "Choose one national feed from the list.";
  if (reason) return "NORMA could not save that player route.";
  return "Saved on this device only.";
}

export default function PlayerRoutesScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const accountId = session?.user?.id ?? null;
  const [model, setModel] = useState<PlayerRouteSettingsModel | null>(null);
  const [allowed, setAllowed] = useState(false);

  const reload = useCallback(async () => {
    const decision = await refreshPlayerRouteControl();
    setAllowed(decision.allowed);
    const repo = shippedPlayerRouteRepository();
    const loaded = accountId ? await repo.load(accountId) : null;
    setModel({
      configurationAllowed: decision.allowed,
      encodingBlocked: !productionHandoffPermitted(STRYMTV_ENCODING_GATE),
      optIn: loaded?.optIn ?? false,
      reinstallLocked: loaded?.reinstallLock ?? false,
      feeds: listMappableFeeds().map((feed) => ({ id: feed.id, label: feed.label })),
      routes: (loaded?.routes ?? []).map((route) => ({
        id: route.id,
        feedLabel: feedById(route.feedId)?.label ?? "Saved feed",
        label: route.label,
        enabled: route.enabled,
        confirmed: route.userConfirmedAt != null,
      })),
      hasDeletableData: loaded?.hasDeletableData ?? false,
    });
  }, [accountId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!model || !accountId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0f172a" }} edges={["top"]}>
        <ActivityIndicator color="#f97316" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const repo = shippedPlayerRouteRepository();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0f172a" }} edges={["top"]}>
      <Pressable accessibilityLabel="Back" onPress={() => router.back()} style={{ padding: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Ionicons name="chevron-back" size={22} color="#f97316" />
          <Text style={{ color: "#f97316", fontSize: 16 }}>Profile</Text>
        </View>
      </Pressable>
      <PlayerRouteSettingsForm
        model={model}
        onOptIn={async () => {
          const result = await repo.setOptIn(accountId, true, allowed);
          await reload();
          return result.ok ? null : messageFor(result.reason);
        }}
        onDisableOptIn={async () => {
          await repo.setOptIn(accountId, false, allowed);
          await reload();
        }}
        onSave={async (input) => {
          const result = await repo.saveRoute(accountId, input, allowed);
          await reload();
          return result.ok ? null : messageFor(result.reason);
        }}
        onTest={async (routeId) => {
          const result = await repo.testRoute(accountId, routeId);
          if (result.outcome === "blocked_unverified_encoding") {
            return { accepted: false, message: ENCODING_GATE_MESSAGE };
          }
          if (result.handoffAccepted) {
            return {
              accepted: true,
              message: "iOS accepted the handoff. NORMA cannot tell whether the feed played. Confirm only if you saw the feed you expected.",
            };
          }
          return { accepted: false, message: handoffFailureCopy(null).body };
        }}
        onConfirm={async (routeId) => {
          const result = await repo.confirmRoute(accountId, routeId);
          await reload();
          return result.ok ? null : messageFor(result.reason);
        }}
        onToggleEnabled={async (routeId, enabled) => {
          await repo.setRouteEnabled(accountId, routeId, enabled);
          await reload();
        }}
        onDelete={async (routeId) => {
          await repo.deleteRoute(accountId, routeId);
          await reload();
        }}
        onDeleteAll={async () => {
          await repo.deleteAll(accountId);
          await reload();
        }}
        onAcknowledgeReinstall={async () => {
          await repo.acknowledgeReinstall(accountId);
          await reload();
        }}
      />
    </SafeAreaView>
  );
}
