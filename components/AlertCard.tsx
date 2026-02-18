import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { Alert } from "../lib/types";
import {
  alertTypeLabel,
  alertTypeColor,
  alertTypeIcon,
  isUrgent,
  timeAgo,
} from "../lib/alert-helpers";
import { useMarkAlertRead } from "../hooks/useAlerts";
import {
  openStreamingApp,
  getBestWatchProvider,
} from "../lib/deep-links";
import {
  useConnectedProviderKeys,
  useStreamingProviders,
} from "../hooks/useConnections";
import { LIVE_STATUSES } from "../lib/constants";

interface AlertCardProps {
  alert: Alert;
}

export function AlertCard({ alert }: AlertCardProps) {
  const router = useRouter();
  const markRead = useMarkAlertRead();
  const color = alertTypeColor(alert.alert_type);
  const icon = alertTypeIcon(alert.alert_type);
  const urgent = isUrgent(alert.alert_type);
  const connectedKeys = useConnectedProviderKeys();
  const { data: allProviders } = useStreamingProviders();

  // Show Watch button for live games with urgent (non-resolved) alerts
  const isLive = alert.game
    ? LIVE_STATUSES.includes(alert.game.status as any)
    : false;
  const bestProvider = isLive && urgent && alert.game
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

  const handleWatch = async () => {
    if (!bestProvider) return;
    if (!alert.read) {
      markRead.mutate(alert.id);
    }
    await openStreamingApp(bestProvider);
  };

  return (
    <Pressable
      style={[
        s.card,
        !alert.read && s.cardUnread,
        urgent && !alert.read && { borderColor: color, borderWidth: 1 },
      ]}
      onPress={handlePress}
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
              {!alert.read && <View style={s.unreadDot} />}
            </View>
            <Text style={s.time}>{timeAgo(alert.created_at)}</Text>
          </View>

          <Text style={s.title}>{alert.title}</Text>
          <Text style={s.body}>{alert.body}</Text>

          {/* "Why tune in" — the core of every alert */}
          {alert.why && (
            <View style={[s.whyContainer, { borderLeftColor: color }]}>
              <Text style={s.why}>{alert.why}</Text>
            </View>
          )}

          {/* One-tap Watch button for live games */}
          {bestProvider && (
            <Pressable style={[s.watchButton, { backgroundColor: color }]} onPress={handleWatch}>
              <Ionicons name="play-circle" size={16} color="#fff" />
              <Text style={s.watchText}>Watch on {bestProvider.name}</Text>
            </Pressable>
          )}
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
});
