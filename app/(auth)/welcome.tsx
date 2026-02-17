import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-court-dark">
      <View className="flex-1 justify-center items-center px-8">
        {/* Logo area */}
        <View className="w-24 h-24 rounded-3xl bg-brand-500 items-center justify-center mb-8">
          <Text className="text-white text-4xl font-black">N</Text>
        </View>

        <Text className="text-white text-4xl font-black text-center mb-3">
          NORMA
        </Text>
        <Text className="text-slate-400 text-lg text-center mb-2">
          Never miss the moment.
        </Text>
        <Text className="text-slate-500 text-base text-center mb-12 px-4">
          Live NCAA basketball scores, smart alerts, and 1-tap streaming —
          all in one place.
        </Text>

        {/* Feature highlights */}
        <View className="w-full mb-12">
          {[
            ["Live Scores", "Real-time scores for every NCAAMB game"],
            ["Smart Alerts", "Get notified for close games, runs, and upsets"],
            ["Watch Now", "One tap to open the right streaming app"],
          ].map(([title, desc]) => (
            <View key={title} className="flex-row items-start mb-4">
              <View className="w-2 h-2 rounded-full bg-brand-500 mt-2 mr-3" />
              <View className="flex-1">
                <Text className="text-white text-base font-semibold">
                  {title}
                </Text>
                <Text className="text-slate-400 text-sm">{desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Bottom CTAs */}
      <View className="px-8 pb-8">
        <Pressable
          className="bg-brand-500 rounded-xl py-4 items-center mb-3"
          onPress={() => router.push("/(auth)/sign-up")}
        >
          <Text className="text-white text-base font-bold">Get Started</Text>
        </Pressable>

        <Pressable
          className="py-3 items-center"
          onPress={() => router.push("/(auth)/sign-in")}
        >
          <Text className="text-slate-400 text-base">
            Already have an account?{" "}
            <Text className="text-brand-400 font-semibold">Sign In</Text>
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
