import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

const normaLogo = require("../../assets/norma-logo.png");

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.container}>
      <View style={s.center}>
        {/* Logo */}
        <Image source={normaLogo} style={s.logo} resizeMode="contain" />

        <Text style={s.subtitle}>Never miss the moment.</Text>
        <Text style={s.desc}>
          Live NCAA basketball scores, smart alerts, and 1-tap streaming —
          all in one place.
        </Text>

        {/* Feature highlights */}
        <View style={s.features}>
          {[
            ["Live Scores", "Real-time scores for every NCAAMB game"],
            ["Smart Alerts", "Get notified for close games, runs, and upsets"],
            ["Watch Now", "One tap to open the right streaming app"],
          ].map(([title, desc]) => (
            <View key={title} style={s.featureRow}>
              <View style={s.bullet} />
              <View style={s.featureText}>
                <Text style={s.featureTitle}>{title}</Text>
                <Text style={s.featureDesc}>{desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Bottom CTAs */}
      <View style={s.ctas}>
        <Pressable
          style={s.ctaButton}
          onPress={() => router.push("/(auth)/sign-up")}
        >
          <Text style={s.ctaText}>Get Started</Text>
        </Pressable>

        <Pressable
          style={s.signInLink}
          onPress={() => router.push("/(auth)/sign-in")}
        >
          <Text style={s.signInText}>
            Already have an account?{" "}
            <Text style={s.signInHighlight}>Sign In</Text>
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 },
  logo: {
    width: 280,
    height: 187,
    marginBottom: 24,
  },
  subtitle: { color: "#94a3b8", fontSize: 18, textAlign: "center", marginBottom: 8 },
  desc: { color: "#64748b", fontSize: 16, textAlign: "center", marginBottom: 48, paddingHorizontal: 16 },
  features: { width: "100%", marginBottom: 48 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 16 },
  bullet: { width: 8, height: 8, borderRadius: 9999, backgroundColor: "#f97316", marginTop: 8, marginRight: 12 },
  featureText: { flex: 1 },
  featureTitle: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  featureDesc: { color: "#94a3b8", fontSize: 14 },
  ctas: { paddingHorizontal: 32, paddingBottom: 32 },
  ctaButton: { backgroundColor: "#f97316", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginBottom: 12 },
  ctaText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  signInLink: { paddingVertical: 12, alignItems: "center" },
  signInText: { color: "#94a3b8", fontSize: 16 },
  signInHighlight: { color: "#fb923c", fontWeight: "600" },
});
