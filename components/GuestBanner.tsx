// Guest mode banner on the games tab: the one place we ask for an account.
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

export function GuestBanner() {
  const router = useRouter();
  return (
    <View style={s.card}>
      <Text style={s.text}>Browsing as a guest. Create a free account to get alerts for games you follow.</Text>
      <Pressable style={s.btn} onPress={() => router.push("/(auth)/sign-up")} accessibilityLabel="Create free account">
        <Text style={s.btnText}>Create free account</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: "rgba(249,115,22,0.1)", borderColor: "rgba(249,115,22,0.35)", borderWidth: 1, borderRadius: 14, padding: 14, marginHorizontal: 16, marginBottom: 12 },
  text: { color: "#e2e8f0", fontSize: 14, marginBottom: 10 },
  btn: { backgroundColor: "#f97316", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
