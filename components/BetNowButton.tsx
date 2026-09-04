import { Pressable, Text, StyleSheet, Linking, Image, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSportsbookGeo } from "../hooks/useSportsbookGeo";
import { supabase } from "../lib/supabase";
import {
  SPORTSBOOK_BRAND_COLORS,
  detectSportsbookProvider,
  defaultCtaLabel,
} from "../lib/sportsbook-brands";

interface BetNowButtonProps {
  ctaUrl: string;
  ctaText?: string;
  logoUrl?: string | null;
  alertId: number;
  providerKey?: string;
}

export function BetNowButton({
  ctaUrl,
  ctaText,
  logoUrl,
  alertId,
  providerKey,
}: BetNowButtonProps) {
  const provider = detectSportsbookProvider(ctaUrl, providerKey);
  const geo = useSportsbookGeo(provider);
  const colors = (provider && SPORTSBOOK_BRAND_COLORS[provider]) || {
    bg: "#f97316",
    text: "#fff",
  };
  const label = defaultCtaLabel(provider, geo.eligible, { ctaText });

  const handlePress = async () => {
    if (!geo.eligible) return;

    // Record tap on impression
    try {
      await supabase
        .from("impressions")
        .update({ tapped_at: new Date().toISOString() })
        .eq("alert_id", alertId);
    } catch {
      // Non-critical
    }

    // Open deep link with 3-step fallback
    try {
      await Linking.openURL(ctaUrl);
      return;
    } catch {
      // scheme URL failed — try web fallback
    }
    const webUrl = ctaUrl.replace(/^[a-z]+:\/\//, "https://");
    try {
      await Linking.openURL(webUrl);
      return;
    } catch {
      // web URL also failed
    }
    // All fallbacks exhausted — notify the user
    Alert.alert("Couldn't open link", "Please open the app manually.");
  };

  return (
    <Pressable
      style={[
        s.button,
        { backgroundColor: colors.bg },
        !geo.eligible ? s.disabledButton : null,
      ]}
      onPress={handlePress}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !geo.eligible }}
      disabled={!geo.eligible}
    >
      {logoUrl ? (
        <Image source={{ uri: logoUrl }} style={[s.logo, !geo.eligible ? s.disabledLogo : null]} />
      ) : (
        <Ionicons name="cash-outline" size={16} color={geo.eligible ? colors.text : "#6b7280"} />
      )}
      <Text style={[s.text, { color: geo.eligible ? colors.text : "#6b7280" }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
  },
  disabledButton: {
    backgroundColor: "#e5e7eb",
  },
  disabledLogo: {
    opacity: 0.5,
  },
  logo: {
    width: 18,
    height: 18,
    borderRadius: 4,
    marginRight: 2,
  },
  text: {
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 6,
  },
});
