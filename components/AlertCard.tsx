import { useState, useRef, useEffect } from "react";
import { View, Text, Pressable, Image, StyleSheet, Share, Modal } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { captureRef } from "react-native-view-shot";
import { supabase } from "../lib/supabase";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { Alert, GameStatus } from "../lib/types";
import { SPORT_LABELS } from "../lib/sport-context";
import {
  alertTypeLabel,
  alertTypeColor,
  alertTypeIcon,
  isUrgent,
  timeAgo,
} from "../lib/alert-helpers";
import { useMarkAlertRead } from "../hooks/useAlerts";
import { trackEvent } from "../lib/analytics";
import { maybeRequestReview } from "../lib/review-prompt";
import { getBestWatchProvider } from "../lib/deep-links";
import {
  useConnectedProviderKeys,
  useStreamingProviders,
} from "../hooks/useConnections";
import { useTapToStream } from "../lib/tap-to-stream-context";
import { LIVE_STATUSES, NORMA_APP_STORE_URL } from "../lib/constants";
import { SponsorCTAButton } from "./SponsorCTAButton";
import { useSubmitAlertFeedback } from "../hooks/useAlertFeedback";
import { MomentShareCard } from "./MomentShareCard";
import { formatAlertShareCard } from "../lib/formatShareCard";

/** AsyncStorage key set after the user first sees (or dismisses) the football share nudge */
export const FOOTBALL_SHARE_NUDGE_KEY = "norma:shared_first_football_alert";

/** Sports that qualify as football for the post-alert share nudge */
function isFootballSport(sport: string | undefined): boolean {
  return sport === "ncaaf" || sport === "nfl";
}

interface AlertCardProps {
  alert: Alert;
}

export function AlertCard({ alert }: AlertCardProps) {
  const router = useRouter();
  const markRead = useMarkAlertRead();
  const [localRating, setLocalRating] = useState<"up" | "down" | null>(null);
  const [showReferralNudge, setShowReferralNudge] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [includeWagerLine, setIncludeWagerLine] = useState(false);
  // Football first-alert share nudge state
  const [showFootballShareNudge, setShowFootballShareNudge] = useState(false);
  const shareCardRef = useRef<View>(null);
  const submitFeedback = useSubmitAlertFeedback();
  const REFERRAL_NUDGE_KEY = "norma.referralNudgeShown";
  const color = alertTypeColor(alert.alert_type);
  const icon = alertTypeIcon(alert.alert_type);
  const urgent = isUrgent(alert.alert_type);
  const connectedKeys = useConnectedProviderKeys();
  const { data: allProviders } = useStreamingProviders();
  const { triggerStream } = useTapToStream();

  // Football share nudge — show once on first football alert the user sees
  useEffect(() => {
    if (!isFootballSport(alert.sport)) return;
    AsyncStorage.getItem(FOOTBALL_SHARE_NUDGE_KEY).then((val) => {
      if (!val) setShowFootballShareNudge(true);
    });
  }, [alert.sport]);

  // Show Watch button for live games with urgent (non-resolved) alerts
  const isLive = alert.game
    ? (LIVE_STATUSES as ReadonlyArray<GameStatus>).includes(alert.game.status as GameStatus)
    : false;
  const bestProvider = isLive && urgent && alert.game?.broadcast != null
    ? getBestWatchProvider(alert.game.broadcast, connectedKeys, allProviders ?? [])
    : null;

  const handlePress = () => {
    if (!alert.read) {
      markRead.mutate(alert.id);
    }
    // Delight trigger: resolved bet with wager impact — peak positive closure moment
    if (alert.alert_type === "bet_resolved" && alert.explanation?.wager_impact) {
      maybeRequestReview("bet_resolved");
    }
    if (alert.game_id) {
      router.push(`/games/${alert.game_id}`);
    }
  };

  const handleWatch = () => {
    if (!bestProvider) return;
    if (!alert.read) {
      markRead.mutate(alert.id);
    }
    trackEvent("watch_tap", { source: "alert_card", alert_type: alert.alert_type, provider: bestProvider.key });
    triggerStream(bestProvider);
  };

  const handleFeedback = (rating: "up" | "down") => {
    const next = localRating === rating ? null : rating;
    setLocalRating(next);
    if (next !== null) {
      submitFeedback.mutate({ alertId: alert.id, rating: next });
      trackEvent("alert_feedback", { rating: next, alert_type: alert.alert_type });
      if (next === "up") {
        maybeRequestReview("alert_thumbs_up");
        AsyncStorage.getItem(REFERRAL_NUDGE_KEY).then((shown) => {
          if (!shown) setShowReferralNudge(true);
        });
      }
    }
  };

  const handleReferralShare = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase.functions.invoke("get-referral-code", {
          method: "GET",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (data?.link) {
          await Share.share({ message: `Join me on NORMA: ${data.link}`, url: data.link });
        }
      }
    } finally {
      await AsyncStorage.setItem(REFERRAL_NUDGE_KEY, "1");
      setShowReferralNudge(false);
    }
  };

  const dismissReferralNudge = async () => {
    await AsyncStorage.setItem(REFERRAL_NUDGE_KEY, "1");
    setShowReferralNudge(false);
  };

  /** Mark the football share nudge as seen — called on both share and dismiss */
  const markFootballNudgeSeen = async () => {
    await AsyncStorage.setItem(FOOTBALL_SHARE_NUDGE_KEY, "1");
    setShowFootballShareNudge(false);
  };

  const handleFootballShareNudge = async () => {
    const gameTitle = alert.game?.title ?? alert.title;
    const headline = alert.explanation?.headline ?? alert.body;
    const message = `I got a NORMA alert for ${gameTitle} — ${headline}. Download NORMA to get alerts for your games. ${NORMA_APP_STORE_URL}`;
    try {
      const result = await Share.share({ message });
      if (result.action !== Share.dismissedAction) {
        trackEvent("share_moment", { source: "football_nudge", sport: alert.sport, alert_type: alert.alert_type });
        // Write share event to share_events table
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await supabase.from("share_events").insert({
            user_id: session.user.id,
            source: "alert",
            alert_type: alert.alert_type,
            game_id: alert.game_id,
          });
        }
      }
    } finally {
      await markFootballNudgeSeen();
    }
  };

  const dismissFootballShareNudge = async () => {
    await markFootballNudgeSeen();
  };

  const handleShareCapture = async () => {
    if (!shareCardRef.current) return;
    try {
      const uri = await captureRef(shareCardRef, { format: "jpg", quality: 0.92 });
      setShowShareSheet(false);
      await Share.share({ url: uri, message: `Live game alert via Watch NORMA · ${NORMA_APP_STORE_URL}` });
      trackEvent("share_moment", { source: "alert", alert_type: alert.alert_type });
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.from("share_events").insert({
          user_id: session.user.id,
          source: "alert",
          alert_type: alert.alert_type,
          game_id: alert.game_id,
        });
      }
    } catch {
      // Non-critical — share failure should not surface to user
    }
  };

  return (
    <Pressable
      style={[
        s.card,
        !alert.read && s.cardUnread,
        urgent && !alert.read && { borderColor: color, borderWidth: 1 },
      ]}
      onPress={handlePress}
      accessibilityLabel={`${alertTypeLabel(alert.alert_type)}: ${alert.title}`}
    >
      <View style={s.row}>
        {/* Icon */}
        <View style={[s.iconCircle, { backgroundColor: `${color}20` }]}>
          <Ionicons name={icon as any} size={20} color={color} />
        </View>

        {/* Content */}
        <View style={s.content}>
          <View style={s.headerRow}>
            <View style={s.badges}>
              <View style={[s.typeBadge, { backgroundColor: `${color}20` }]}>
                <Text style={[s.typeBadgeText, { color }]}>
                  {alertTypeLabel(alert.alert_type)}
                </Text>
              </View>
              {/* Sport badge — shown for NBA and MLB to distinguish from NCAA */}
              {alert.sport && alert.sport !== "ncaam" && (
                <View style={s.sportBadge}>
                  <Text style={s.sportBadgeText}>
                    {SPORT_LABELS[alert.sport]}
                  </Text>
                </View>
              )}
              {!alert.read && <View style={s.unreadDot} />}
            </View>
            <Text style={s.time}>{timeAgo(alert.created_at)}</Text>
          </View>

          <Text style={s.title}>{alert.title}</Text>
          <Text style={s.body}>{alert.body}</Text>

          {/* "Why tune in" — structured explanation (v2) or plain text (v1) */}
          {alert.explanation ? (
            <View style={[s.whyContainer, { borderLeftColor: color }]}>
              {alert.explanation.headline && (
                <Text style={s.whyHeadline}>{alert.explanation.headline}</Text>
              )}
              {alert.explanation.bullets?.map((bullet, i) => (
                <Text key={i} style={s.whyBullet}>{"\u2022"} {bullet}</Text>
              ))}
              {alert.explanation.wager_impact && (
                <View style={s.wagerImpact}>
                  <Text style={s.wagerImpactText}>
                    {alert.explanation.wager_impact.status === "covering" ? "Covering" :
                     alert.explanation.wager_impact.status === "not_covering" ? "Not covering" :
                     alert.explanation.wager_impact.status === "decided" ? "Decided" : "At risk"}
                    {" \u2014 "}{alert.explanation.wager_impact.wager_description}
                  </Text>
                </View>
              )}
            </View>
          ) : alert.why ? (
            <View style={[s.whyContainer, { borderLeftColor: color }]}>
              <Text style={s.why}>{alert.why}</Text>
            </View>
          ) : null}

          {/* Sponsor row — paid placement, visually separated from editorial alert copy */}
          {alert.sponsor_text && (
            <View style={s.sponsorRow}>
              <Text style={s.sponsoredLabel}>Sponsored</Text>
              {alert.sponsor_logo_url && (
                <Image
                  source={{ uri: alert.sponsor_logo_url }}
                  style={s.sponsorLogo}
                />
              )}
              <Text style={s.sponsorText}>{alert.sponsor_text}</Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={s.ctaRow}>
            {/* One-tap Watch button for live games */}
            {bestProvider && (
              <Pressable style={[s.watchButton, { backgroundColor: color }]} onPress={handleWatch} accessibilityLabel={`Watch on ${bestProvider.name}`}>
                <Ionicons name="play-circle" size={16} color="#fff" />
                <Text style={s.watchText}>Watch on {bestProvider.name}</Text>
              </Pressable>
            )}

            {/* Sportsbook CTA from sponsor — this is a paid ad unit, not a NORMA action */}
            {alert.sponsor_cta_url && (
              <SponsorCTAButton
                ctaUrl={alert.sponsor_cta_url}
                logoUrl={alert.sponsor_logo_url}
                alertId={alert.id}
              />
            )}

            {/* Share this moment — subordinate to Watch */}
            <Pressable
              onPress={() => setShowShareSheet(true)}
              style={s.shareBtn}
              accessibilityLabel="Share this moment"
            >
              <Ionicons name="share-social-outline" size={16} color="#64748b" />
            </Pressable>
          </View>

          {/* Feedback — visually subordinate; data feeds future scoring tuning */}
          <View style={s.feedbackRow}>
            <Text style={s.feedbackLabel}>Useful?</Text>
            <Pressable
              onPress={() => handleFeedback("up")}
              accessibilityLabel="Alert was useful"
              testID="feedback-btn-up"
              style={s.feedbackBtn}
            >
              <Ionicons
                name={localRating === "up" ? "thumbs-up" : "thumbs-up-outline"}
                size={14}
                color={localRating === "up" ? "#22c55e" : "#475569"}
              />
            </Pressable>
            <Pressable
              onPress={() => handleFeedback("down")}
              accessibilityLabel="Alert was not useful"
              testID="feedback-btn-down"
              style={s.feedbackBtn}
            >
              <Ionicons
                name={localRating === "down" ? "thumbs-down" : "thumbs-down-outline"}
                size={14}
                color={localRating === "down" ? "#f97316" : "#475569"}
              />
            </Pressable>
          </View>

          {/* One-time referral nudge after thumbs-up */}
          {showReferralNudge && (
            <View style={s.referralNudge}>
              <Text style={s.referralNudgeText}>Know someone sweating this game? Invite them</Text>
              <View style={s.referralNudgeActions}>
                <Pressable onPress={handleReferralShare} style={s.referralNudgeBtn} accessibilityLabel="Invite a friend">
                  <Text style={s.referralNudgeBtnText}>Invite</Text>
                </Pressable>
                <Pressable onPress={dismissReferralNudge} accessibilityLabel="Dismiss referral prompt" style={s.feedbackBtn}>
                  <Ionicons name="close-outline" size={16} color="#64748b" />
                </Pressable>
              </View>
            </View>
          )}

          {/* One-time football share nudge — shown on first football alert */}
          {showFootballShareNudge && (
            <View style={s.footballShareNudge} testID="football-share-nudge">
              <View style={s.footballShareNudgeRow}>
                <Ionicons name="share-social-outline" size={16} color="#f97316" />
                <Text style={s.footballShareNudgeText}>Share this moment</Text>
                <Pressable
                  onPress={dismissFootballShareNudge}
                  accessibilityLabel="Dismiss share prompt"
                  style={s.feedbackBtn}
                  testID="football-share-nudge-dismiss"
                >
                  <Ionicons name="close-outline" size={16} color="#64748b" />
                </Pressable>
              </View>
              <Pressable
                style={s.footballShareNudgeBtn}
                onPress={handleFootballShareNudge}
                accessibilityLabel="Share this moment"
                testID="football-share-nudge-btn"
              >
                <Text style={s.footballShareNudgeBtnText}>Share this moment</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
      {/* Share sheet modal */}
      <Modal
        visible={showShareSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowShareSheet(false)}
      >
        <Pressable style={s.modalOverlay} onPress={() => setShowShareSheet(false)}>
          <Pressable style={s.shareSheet} onPress={() => {}}>
            <Text style={s.shareSheetTitle}>Share This Moment</Text>

            {/* Off-screen card preview (captured by captureRef) */}
            <View style={s.shareCardPreview}>
              <MomentShareCard
                ref={shareCardRef}
                data={formatAlertShareCard(alert, includeWagerLine)}
              />
            </View>

            {/* "Include my pick" toggle — only shown when wager context exists */}
            {alert.explanation?.wager_impact && (
              <Pressable
                style={s.toggleRow}
                onPress={() => setIncludeWagerLine((v) => !v)}
                accessibilityLabel={includeWagerLine ? "Remove wager line from card" : "Include my pick on card"}
              >
                <View style={[s.toggleCheckbox, includeWagerLine && s.toggleChecked]}>
                  {includeWagerLine && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
                <Text style={s.toggleLabel}>Include my pick</Text>
              </Pressable>
            )}

            <Pressable style={s.shareActionBtn} onPress={handleShareCapture} accessibilityLabel="Share">
              <Ionicons name="share-social" size={16} color="#fff" />
              <Text style={s.shareActionText}>Share</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
  },
  cardUnread: { borderWidth: 1, borderColor: "rgba(249, 115, 22, 0.3)" },
  row: { flexDirection: "row", alignItems: "flex-start" },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  content: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  badges: { flexDirection: "row", alignItems: "center" },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, marginRight: 8 },
  typeBadgeText: { fontSize: 12, fontWeight: "700" },
  unreadDot: { width: 8, height: 8, borderRadius: 9999, backgroundColor: "#f97316" },
  time: { color: "#64748b", fontSize: 12 },
  title: { color: "#ffffff", fontSize: 14, fontWeight: "600", marginBottom: 2 },
  body: { color: "#cbd5e1", fontSize: 14 },
  whyContainer: {
    marginTop: 8,
    paddingLeft: 10,
    borderLeftWidth: 3,
  },
  why: { color: "#e2e8f0", fontSize: 13, fontWeight: "500", lineHeight: 18 },
  whyHeadline: { color: "#ffffff", fontSize: 13, fontWeight: "700", marginBottom: 4 },
  whyBullet: { color: "#e2e8f0", fontSize: 13, lineHeight: 18, marginBottom: 2 },
  wagerImpact: {
    marginTop: 6,
    backgroundColor: "rgba(249, 115, 22, 0.1)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  wagerImpactText: { color: "#f97316", fontSize: 12, fontWeight: "600" },
  watchButton: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 10,
    alignSelf: "flex-start",
  },
  watchText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 6,
  },
  sponsorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(100, 116, 139, 0.3)",
  },
  sponsoredLabel: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginRight: 6,
  },
  sponsorLogo: {
    width: 20,
    height: 20,
    borderRadius: 4,
    marginRight: 8,
  },
  sponsorText: {
    color: "#94a3b8",
    fontSize: 12,
    fontStyle: "italic",
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    flexWrap: "wrap",
  },
  feedbackRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 6,
  },
  feedbackLabel: {
    color: "#475569",
    fontSize: 11,
    marginRight: 2,
  },
  feedbackBtn: {
    padding: 4,
  },
  referralNudge: {
    marginTop: 8,
    backgroundColor: "rgba(249, 115, 22, 0.06)",
    borderRadius: 8,
    padding: 10,
  },
  referralNudgeText: { color: "#94a3b8", fontSize: 12, marginBottom: 6 },
  referralNudgeActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  referralNudgeBtn: {
    backgroundColor: "#f97316",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  referralNudgeBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  shareBtn: {
    padding: 6,
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  shareSheet: {
    backgroundColor: "#1e293b",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  shareSheetTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 16,
  },
  shareCardPreview: {
    alignItems: "center",
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 10,
  },
  toggleCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
  },
  toggleChecked: {
    backgroundColor: "#f97316",
    borderColor: "#f97316",
  },
  toggleLabel: {
    color: "#cbd5e1",
    fontSize: 14,
  },
  shareActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f97316",
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  shareActionText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  sportBadge: {
    backgroundColor: "#1e40af",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginRight: 8,
  },
  sportBadgeText: {
    color: "#93c5fd",
    fontSize: 10,
    fontWeight: "700",
  },
  footballShareNudge: {
    marginTop: 8,
    backgroundColor: "rgba(249, 115, 22, 0.08)",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(249, 115, 22, 0.2)",
  },
  footballShareNudgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  footballShareNudgeText: {
    color: "#94a3b8",
    fontSize: 12,
    flex: 1,
  },
  footballShareNudgeBtn: {
    backgroundColor: "#f97316",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: "flex-start",
  },
  footballShareNudgeBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
});
