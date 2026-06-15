import { useState } from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
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
import { getBestWatchProvider } from "../lib/deep-links";
import {
  useConnectedProviderKeys,
  useStreamingProviders,
} from "../hooks/useConnections";
import { useTapToStream } from "../lib/tap-to-stream-context";
import { LIVE_STATUSES } from "../lib/constants";
import { SponsorCTAButton } from "./SponsorCTAButton";
import { useSubmitAlertFeedback } from "../hooks/useAlertFeedback";

interface AlertCardProps {
  alert: Alert;
}

export function AlertCard({ alert }: AlertCardProps) {
  const router = useRouter();
  const markRead = useMarkAlertRead();
  const [localRating, setLocalRating] = useState<"up" | "down" | null>(null);
  const submitFeedback = useSubmitAlertFeedback();
  const color = alertTypeColor(alert.alert_type);
  const icon = alertTypeIcon(alert.alert_type);
  const urgent = isUrgent(alert.alert_type);
  const connectedKeys = useConnectedProviderKeys();
  const { data: allProviders } = useStreamingProviders();
  const { triggerStream } = useTapToStream();

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
    if (alert.game_id) {
      router.push(`/games/${alert.game_id}`);
    }
  };

  const handleWatch = () => {
    if (!bestProvider) return;
    if (!alert.read) {
      markRead.mutate(alert.id);
    }
    triggerStream(bestProvider);
  };

  const handleFeedback = (rating: "up" | "down") => {
    const next = localRating === rating ? null : rating;
    setLocalRating(next);
    if (next !== null) {
      submitFeedback.mutate({ alertId: alert.id, rating: next });
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
        </View>
      </View>
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
});
