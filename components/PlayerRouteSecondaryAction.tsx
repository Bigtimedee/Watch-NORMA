import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { ENCODING_GATE_MESSAGE, handoffFailureCopy, STRYMTV_APP_STORE_URL } from "../lib/player-routes/copy";
import { loadPlayerRouteSecondaryOffer, shippedPlayerRouteRepository } from "../lib/player-routes/runtime";
import type { PlayerRouteSecondaryOffer } from "../lib/player-routes/resolve";

/**
 * Secondary control only. It does not replace WatchNowButton.
 * With the shipped flags and encoding gate it renders nothing.
 */
export function PlayerRouteSecondaryAction({ broadcast }: { broadcast: string | null }) {
  const [offer, setOffer] = useState<PlayerRouteSecondaryOffer | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const next = await loadPlayerRouteSecondaryOffer(broadcast, data.session?.user?.id ?? null);
      if (!cancelled) setOffer(next);
    })().catch(() => {
      if (!cancelled) setOffer(null);
    });
    return () => {
      cancelled = true;
    };
  }, [broadcast]);

  if (!offer) return null;

  const onPress = () => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const accountId = data.session?.user?.id;
      if (!accountId) return;
      const result = await shippedPlayerRouteRepository().testRoute(accountId, offer.routeId);
      if (result.handoffAccepted) return;
      const copy = handoffFailureCopy(null);
      const blocked = result.outcome === "blocked_unverified_encoding";
      Alert.alert(blocked ? "StrymTV handoff is blocked" : copy.title, blocked ? ENCODING_GATE_MESSAGE : copy.body, [
        { text: "Not now", style: "cancel" },
        {
          text: "StrymTV in the App Store",
          onPress: () => {
            void Linking.openURL(STRYMTV_APP_STORE_URL);
          },
        },
      ]);
    })();
  };

  return (
    <Pressable
      testID="player-route-secondary"
      accessibilityLabel="Open your stream in StrymTV"
      onPress={onPress}
      style={styles.button}
    >
      <Ionicons name="open-outline" size={22} color="#e2e8f0" />
      <View style={styles.text}>
        <Text style={styles.label}>Open your stream in StrymTV</Text>
        <Text style={styles.sub}>
          Your saved {offer.feedLabel} stream. NORMA cannot confirm playback. Your usual watch button stays first.
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    marginHorizontal: 16,
    marginBottom: 16,
    marginTop: -4,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#1e293b",
    flexDirection: "row",
    alignItems: "center",
  },
  text: { marginLeft: 12, flex: 1 },
  label: { color: "#e2e8f0", fontSize: 15, fontWeight: "700" },
  sub: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
});
