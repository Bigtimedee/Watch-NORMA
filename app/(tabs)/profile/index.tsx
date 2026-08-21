import { useEffect, useState } from "react";
import { View, Text, Pressable, Switch, Alert, ScrollView, Linking, Share, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../hooks/useAuth";
import { useWagerStats } from "../../../hooks/useWagers";
import { PreferencesSheet } from "../../../components/PreferencesSheet";
import { usePreferences, useUpdatePreferences } from "../../../hooks/usePreferences";
const PRIVACY_POLICY_URL = "https://d10dave.github.io/norma/privacy-policy.html";
const TERMS_URL = "https://d10dave.github.io/norma/terms-of-service.html";

export default function ProfileScreen() {
  const router = useRouter();
  const { session, profile, signOut, deleteAccount, updateProfile } = useAuth();
  const { data: wagerStats } = useWagerStats();
  const { data: preferences } = usePreferences();
  const updatePreferences = useUpdatePreferences();
  const [showPrefs, setShowPrefs] = useState(false);
  const [referralData, setReferralData] = useState<{
    code: string;
    uses: number;
    link: string;
    qualifying_referrals: number;
    insider_status: boolean;
  } | null>(null);

  const adPersonalization =
    preferences?.notification_settings?.ad_personalization_enabled ?? true;

  useEffect(() => {
    let cancelled = false;

    async function fetchReferralData() {
      if (!session) return;

      const { data, error } = await supabase.functions.invoke("get-referral-code", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!cancelled && data && !error) {
        setReferralData(data);
      }
    }

    fetchReferralData();

    return () => {
      cancelled = true;
    };
  }, [session]);

  const shareReferralLink = async () => {
    if (!referralData) return;
    try {
      await Share.share({
        message: `Join me on NORMA: ${referralData.link}`,
        url: referralData.link,
      });
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

  const toggleAdPersonalization = async () => {
    if (!preferences) return;
    try {
      await updatePreferences.mutateAsync({
        notification_settings: {
          ...preferences.notification_settings,
          ad_personalization_enabled: !adPersonalization,
        },
      });
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

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

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAccount();
            } catch (error: any) {
              Alert.alert("Error", error.message);
            }
          },
        },
      ]
    );
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

        <View style={s.section}>
          <View style={s.sectionLabelRow}>
            <Text style={s.sectionLabel}>Invite Friends</Text>
            {referralData?.insider_status && (
              <View style={s.insiderBadge}>
                <Ionicons name="star" size={10} color="#f97316" />
                <Text style={s.insiderBadgeText}>NORMA Insider</Text>
              </View>
            )}
          </View>
          <View style={s.settingsCard}>
            <View style={[s.inviteContent, s.settingsRowBorder]}>
              {referralData ? (
                <>
                  <View style={s.referralProgressRow}>
                    <Text style={s.inviteTitle}>
                      {referralData.qualifying_referrals} of 3 friends activated
                    </Text>
                    {referralData.insider_status && (
                      <Text style={s.insiderUnlocked}>Insider unlocked</Text>
                    )}
                  </View>
                  <View style={s.progressBar}>
                    <View
                      style={[
                        s.progressFill,
                        { width: `${Math.min(100, (referralData.qualifying_referrals / 3) * 100)}%` },
                      ]}
                    />
                  </View>
                  {/* Copy must match what the code actually grants. This previously
                      promised "NFL early access", but NFL is alertable for every user
                      (ALERTABLE_SPORTS in evaluate-alerts includes "nfl"), and
                      insider_status gates no feature — it only surfaces the Insider
                      badge above. Corrected 2026-08-20. */}
                  <Text style={s.inviteSubtext}>
                    {referralData.insider_status
                      ? "NORMA Insider unlocked"
                      : `${3 - referralData.qualifying_referrals} more to become a NORMA Insider`}
                  </Text>
                </>
              ) : (
                <Text style={s.inviteTitle}>Loading invite link...</Text>
              )}
              <Text style={s.inviteLink} numberOfLines={1}>
                {referralData?.link ?? "https://getnorma.app"}
              </Text>
            </View>
            <Pressable
              style={s.settingsRow}
              onPress={shareReferralLink}
              disabled={!referralData}
              accessibilityLabel="Share invite link"
            >
              <View style={s.settingsLeft}>
                <Ionicons name="share-outline" size={20} color="#f97316" />
                <Text style={s.settingsText}>Share</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748b" />
            </Pressable>
          </View>
        </View>

        {/* Settings */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Settings</Text>

          <View style={s.settingsCard}>
            {/* Preferences */}
            <Pressable
              style={[s.settingsRow, s.settingsRowBorder]}
              onPress={() => setShowPrefs(true)}
              accessibilityLabel="Preferences"
            >
              <View style={s.settingsLeft}>
                <Ionicons name="options-outline" size={20} color="#f97316" />
                <Text style={s.settingsText}>Preferences</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748b" />
            </Pressable>

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

            {/* Ad Personalization */}
            <View style={[s.settingsRow, s.settingsRowBorder]}>
              <View style={s.settingsLeft}>
                <Ionicons name="megaphone-outline" size={20} color="#f97316" />
                <Text style={s.settingsText}>Ad Personalization</Text>
              </View>
              <Switch
                value={adPersonalization}
                onValueChange={toggleAdPersonalization}
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
              <Text style={s.settingsValue}>{Constants.expoConfig?.version ?? "1.0.0"}</Text>
            </View>
            <View style={[s.settingsRow, s.settingsRowBorder]}>
              <Text style={s.aboutLabel}>Data by</Text>
              <Text style={s.settingsValue}>SportsDataIO + ESPN</Text>
            </View>

            <Pressable
              style={[s.settingsRow, s.settingsRowBorder]}
              onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
              accessibilityLabel="Privacy Policy"
            >
              <Text style={s.aboutLabel}>Privacy Policy</Text>
              <Ionicons name="open-outline" size={16} color="#64748b" />
            </Pressable>

            <Pressable
              style={s.settingsRow}
              onPress={() => Linking.openURL(TERMS_URL)}
              accessibilityLabel="Terms of Service"
            >
              <Text style={s.aboutLabel}>Terms of Service</Text>
              <Ionicons name="open-outline" size={16} color="#64748b" />
            </Pressable>
          </View>
        </View>

        {/* Sign Out */}
        <View style={s.signOutSection}>
          <Pressable
            style={s.signOutBtn}
            onPress={handleSignOut}
            accessibilityLabel="Sign Out"
          >
            <Text style={s.signOutText}>Sign Out</Text>
          </Pressable>

          <Pressable
            style={s.deleteBtn}
            onPress={handleDeleteAccount}
            accessibilityLabel="Delete Account"
          >
            <Text style={s.deleteText}>Delete Account</Text>
          </Pressable>
        </View>
      </ScrollView>

      {showPrefs && (
        <PreferencesSheet onClose={() => setShowPrefs(false)} />
      )}
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
  sectionLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  insiderBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(249, 115, 22, 0.15)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  insiderBadgeText: { color: "#f97316", fontSize: 11, fontWeight: "700" },
  inviteContent: { padding: 16 },
  inviteTitle: { color: "#ffffff", fontSize: 16, fontWeight: "600", marginBottom: 6 },
  inviteLink: { color: "#94a3b8", fontSize: 14, marginTop: 8 },
  referralProgressRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  insiderUnlocked: { color: "#22c55e", fontSize: 12, fontWeight: "600" },
  progressBar: { height: 4, backgroundColor: "#334155", borderRadius: 2, marginTop: 8, marginBottom: 4 },
  progressFill: { height: 4, backgroundColor: "#f97316", borderRadius: 2 },
  inviteSubtext: { color: "#64748b", fontSize: 12, marginBottom: 4 },
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
  deleteBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center" as const,
    marginTop: 8,
  },
  deleteText: { color: "#ef4444", fontSize: 14, fontWeight: "500" },
});
