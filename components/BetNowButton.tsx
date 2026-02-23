import { Pressable, Text, StyleSheet, Linking, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

interface BetNowButtonProps {
  ctaUrl: string;
  ctaText?: string;
  logoUrl?: string | null;
  alertId: number;
  providerKey?: string;
}

// Brand colors for sportsbook providers
const BRAND_COLORS: Record<string, { bg: string; text: string }> = {
  draftkings: { bg: "#53D337", text: "#000000" },
  fanduel: { bg: "#1493FF", text: "#FFFFFF" },
  betmgm: { bg: "#BFA15C", text: "#000000" },
  caesars: { bg: "#1B4D3E", text: "#FFFFFF" },
  espnbet: { bg: "#FF4438", text: "#FFFFFF" },
};

const DISPLAY_NAMES: Record<string, string> = {
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  betmgm: "BetMGM",
  caesars: "Caesars",
  espnbet: "ESPN BET",
};

function detectProvider(url: string): string | null {
  for (const key of Object.keys(BRAND_COLORS)) {
    if (url.toLowerCase().includes(key)) return key;
  }
  return null;
}

export function BetNowButton({
  ctaUrl,
  ctaText,
  logoUrl,
  alertId,
  providerKey,
}: BetNowButtonProps) {
  const provider = providerKey ?? detectProvider(ctaUrl);
  const colors = provider ? BRAND_COLORS[provider] : { bg: "#f97316", text: "#fff" };
  const displayName = provider ? DISPLAY_NAMES[provider] : null;
  const label = ctaText ?? (displayName ? `Bet Now on ${displayName}` : "Bet Now");

  const handlePress = async () => {
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
    } catch {
      // If deep link fails, try web fallback
      const webUrl = ctaUrl.replace(/^[a-z]+:\/\//, "https://");
      try {
        await Linking.openURL(webUrl);
      } catch {
        // Nothing to do
      }
    }
  };

  return (
    <Pressable
      style={[s.button, { backgroundColor: colors.bg }]}
      onPress={handlePress}
      accessibilityLabel={label}
    >
      {logoUrl ? (
        <Image source={{ uri: logoUrl }} style={s.logo} />
      ) : (
        <Ionicons name="cash-outline" size={16} color={colors.text} />
      )}
      <Text style={[s.text, { color: colors.text }]}>{label}</Text>
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
