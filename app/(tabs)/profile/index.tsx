import { View, Text, Pressable, Switch, Alert, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../hooks/useAuth";

export default function ProfileScreen() {
  const { session, profile, signOut, updateProfile } = useAuth();

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut();
          } catch (error: any) {
            Alert.alert("Error", error.message);
          }
        },
      },
    ]);
  };

  const toggleNotifications = async () => {
    if (!profile) return;
    try {
      await updateProfile({
        notifications_enabled: !profile.notifications_enabled,
      });
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-court-dark" edges={["top"]}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View className="px-4 pt-4 pb-2">
          <Text className="text-white text-2xl font-black">Profile</Text>
        </View>

        {/* User info */}
        <View className="mx-4 my-4 bg-court-card rounded-2xl p-5">
          <View className="flex-row items-center">
            <View className="w-14 h-14 rounded-full bg-brand-500 items-center justify-center mr-4">
              <Text className="text-white text-xl font-bold">
                {(profile?.display_name ?? session?.user.email ?? "?")
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-white text-lg font-semibold">
                {profile?.display_name ?? "User"}
              </Text>
              <Text className="text-slate-400 text-sm">
                {session?.user.email}
              </Text>
            </View>
          </View>
        </View>

        {/* Settings */}
        <View className="mx-4">
          <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">
            Settings
          </Text>

          <View className="bg-court-card rounded-2xl overflow-hidden">
            {/* Notifications toggle */}
            <View className="flex-row items-center justify-between p-4 border-b border-court-border">
              <View className="flex-row items-center flex-1">
                <Ionicons
                  name="notifications-outline"
                  size={20}
                  color="#f97316"
                />
                <Text className="text-white text-base ml-3">
                  Push Notifications
                </Text>
              </View>
              <Switch
                value={profile?.notifications_enabled ?? true}
                onValueChange={toggleNotifications}
                trackColor={{ false: "#475569", true: "#f97316" }}
                thumbColor="#fff"
              />
            </View>

            {/* Timezone */}
            <View className="flex-row items-center justify-between p-4">
              <View className="flex-row items-center flex-1">
                <Ionicons name="time-outline" size={20} color="#f97316" />
                <Text className="text-white text-base ml-3">Timezone</Text>
              </View>
              <Text className="text-slate-400 text-sm">
                {profile?.timezone ?? "America/New_York"}
              </Text>
            </View>
          </View>
        </View>

        {/* About */}
        <View className="mx-4 mt-6">
          <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">
            About
          </Text>

          <View className="bg-court-card rounded-2xl overflow-hidden">
            <View className="flex-row items-center justify-between p-4 border-b border-court-border">
              <Text className="text-white text-base">Version</Text>
              <Text className="text-slate-400 text-sm">1.0.0</Text>
            </View>
            <View className="flex-row items-center justify-between p-4">
              <Text className="text-white text-base">Data by</Text>
              <Text className="text-slate-400 text-sm">
                SportsDataIO + ESPN
              </Text>
            </View>
          </View>
        </View>

        {/* Sign Out */}
        <View className="mx-4 mt-8">
          <Pressable
            className="bg-red-500/10 rounded-2xl py-4 items-center"
            onPress={handleSignOut}
          >
            <Text className="text-red-400 text-base font-semibold">
              Sign Out
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
