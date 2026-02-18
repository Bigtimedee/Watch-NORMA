import { View, Text, Pressable, Switch, Alert, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../hooks/useAuth";
import { useWagerStats } from "../../../hooks/useWagers";

export default function ProfileScreen() {
  const { session, profile, signOut, updateProfile } = useAuth();
  const { data: wagerStats } = useWagerStats();

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
    <SafeAreaView style={s.container} edges={["top"]}>
      <ScrollView style={s.flex} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>Profile</Text>
        </View>

        {/* User info */}
        <View style={s.userCard}>
          <View style={s.userRow}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>
                {(profile?.display_name ?? session?.user.email ?? "?")
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>
            <View style={s.userInfo}>
              <Text style={s.userName}>
                {profile?.display_name ?? "User"}
              </Text>
              <Text style={s.userEmail}>{session?.user.email}</Text>
            </View>
          </View>
        </View>

        {/* Wagering Stats */}
        {wagerStats && wagerStats.total > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>Wagering</Text>
            <View style={s.settingsCard}>
              <View style={s.statsRow}>
                <View style={s.statItem}>
                  <Text style={s.statNumber}>{wagerStats.wins}</Text>
                  <Text style={s.statLabel}>W</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Text style={s.statNumber}>{wagerStats.losses}</Text>
                  <Text style={s.statLabel}>L</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Text style={s.statNumber}>{wagerStats.pushes}</Text>
                  <Text style={s.statLabel}>P</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Text style={[s.statNumber, { color: "#60a5fa" }]}>
                    {wagerStats.active}
                  </Text>
                  <Text style={s.statLabel}>Active</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Settings */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Settings</Text>

          <View style={s.settingsCard}>
            {/* Notifications toggle */}
            <View style={[s.settingsRow, s.settingsRowBorder]}>
              <View style={s.settingsLeft}>
                <Ionicons name="notifications-outline" size={20} color="#f97316" />
                <Text style={s.settingsText}>Push Notifications</Text>
              </View>
              <Switch
                value={profile?.notifications_enabled ?? true}
                onValueChange={toggleNotifications}
                trackColor={{ false: "#475569", true: "#f97316" }}
                thumbColor="#fff"
              />
            </View>

            {/* Timezone */}
            <View style={s.settingsRow}>
              <View style={s.settingsLeft}>
                <Ionicons name="time-outline" size={20} color="#f97316" />
                <Text style={s.settingsText}>Timezone</Text>
              </View>
              <Text style={s.settingsValue}>
                {profile?.timezone ?? "America/New_York"}
              </Text>
            </View>
          </View>
        </View>

        {/* About */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>About</Text>

          <View style={s.settingsCard}>
            <View style={[s.settingsRow, s.settingsRowBorder]}>
              <Text style={s.aboutLabel}>Version</Text>
              <Text style={s.settingsValue}>1.0.0</Text>
            </View>
            <View style={s.settingsRow}>
              <Text style={s.aboutLabel}>Data by</Text>
              <Text style={s.settingsValue}>SportsDataIO + ESPN</Text>
            </View>
          </View>
        </View>

        {/* Sign Out */}
        <View style={s.signOutSection}>
          <Pressable style={s.signOutBtn} onPress={handleSignOut}>
            <Text style={s.signOutText}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { color: "#ffffff", fontSize: 24, fontWeight: "900" },
  userCard: {
    marginHorizontal: 16,
    marginVertical: 16,
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
  },
  userRow: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 9999,
    backgroundColor: "#f97316",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  avatarText: { color: "#ffffff", fontSize: 20, fontWeight: "700" },
  userInfo: { flex: 1 },
  userName: { color: "#ffffff", fontSize: 18, fontWeight: "600" },
  userEmail: { color: "#94a3b8", fontSize: 14 },
  section: { marginHorizontal: 16 },
  sectionLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  settingsCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 24,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  settingsRowBorder: { borderBottomWidth: 1, borderBottomColor: "#475569" },
  settingsLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  settingsText: { color: "#ffffff", fontSize: 16, marginLeft: 12 },
  settingsValue: { color: "#94a3b8", fontSize: 14 },
  aboutLabel: { color: "#ffffff", fontSize: 16 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    padding: 20,
  },
  statItem: { alignItems: "center" },
  statNumber: { color: "#ffffff", fontSize: 24, fontWeight: "700" },
  statLabel: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: "#475569" },
  signOutSection: { marginHorizontal: 16, marginTop: 8 },
  signOutBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  signOutText: { color: "#f87171", fontSize: 16, fontWeight: "600" },
});
