import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useConnections } from "../../../hooks/useConnections";

export default function ConnectionsScreen() {
  const router = useRouter();
  const { data: connections } = useConnections();

  const streamingCount = (connections ?? []).filter(
    (c) => c.provider_type === "streaming" && c.connected
  ).length;
  const tvCount = (connections ?? []).filter(
    (c) => c.provider_type === "tv" && c.connected
  ).length;
  const bookCount = (connections ?? []).filter(
    (c) => c.provider_type === "sportsbook" && c.connected
  ).length;

  const sections = [
    {
      title: "Streaming Services",
      subtitle: "Apps where you can watch games",
      icon: "play-circle-outline" as const,
      count: streamingCount,
      route: "/(tabs)/connections/streaming" as const,
    },
    {
      title: "TV Providers",
      subtitle: "Cable, satellite, or live TV streaming",
      icon: "tv-outline" as const,
      count: tvCount,
      route: "/(tabs)/connections/tv-provider" as const,
    },
    {
      title: "Sportsbooks",
      subtitle: "Track your wagers (coming soon)",
      icon: "cash-outline" as const,
      count: bookCount,
      route: "/(tabs)/connections/sportsbooks" as const,
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-court-dark" edges={["top"]}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View className="px-4 pt-4 pb-2">
          <Text className="text-white text-2xl font-black">Connections</Text>
          <Text className="text-slate-400 text-sm mt-1">
            Connect your services for 1-tap watching
          </Text>
        </View>

        {/* Info card */}
        <View className="mx-4 my-4 bg-brand-500/10 rounded-2xl p-4 flex-row items-start">
          <Ionicons name="information-circle" size={24} color="#f97316" />
          <Text className="text-slate-300 text-sm ml-3 flex-1">
            Tell us which streaming services and TV providers you have. We'll
            show you the right "Watch Now" button for each game.
          </Text>
        </View>

        {/* Section cards */}
        {sections.map((section) => (
          <Pressable
            key={section.title}
            className="mx-4 mb-3 bg-court-card rounded-2xl p-4 flex-row items-center"
            onPress={() => router.push(section.route)}
          >
            <View className="w-12 h-12 rounded-xl bg-court-surface items-center justify-center mr-4">
              <Ionicons name={section.icon} size={24} color="#f97316" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-base font-semibold">
                {section.title}
              </Text>
              <Text className="text-slate-400 text-sm">{section.subtitle}</Text>
            </View>
            <View className="flex-row items-center">
              {section.count > 0 && (
                <View className="bg-brand-500/20 px-2.5 py-1 rounded-full mr-2">
                  <Text className="text-brand-400 text-xs font-bold">
                    {section.count}
                  </Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={20} color="#64748b" />
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
