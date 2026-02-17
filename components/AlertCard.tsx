import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { Alert } from "../lib/types";
import {
  alertTypeLabel,
  alertTypeColor,
  alertTypeIcon,
  timeAgo,
} from "../lib/alert-helpers";
import { useMarkAlertRead } from "../hooks/useAlerts";

interface AlertCardProps {
  alert: Alert;
}

export function AlertCard({ alert }: AlertCardProps) {
  const router = useRouter();
  const markRead = useMarkAlertRead();
  const color = alertTypeColor(alert.alert_type);
  const icon = alertTypeIcon(alert.alert_type);

  const handlePress = () => {
    if (!alert.read) {
      markRead.mutate(alert.id);
    }
    if (alert.game_id) {
      router.push(`/games/${alert.game_id}`);
    }
  };

  return (
    <Pressable
      className={`rounded-2xl p-4 mb-3 mx-4 ${
        alert.read ? "bg-court-card" : "bg-court-card border border-brand-500/30"
      }`}
      onPress={handlePress}
    >
      <View className="flex-row items-start">
        {/* Icon */}
        <View
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: `${color}20` }}
        >
          <Ionicons name={icon as any} size={20} color={color} />
        </View>

        {/* Content */}
        <View className="flex-1">
          <View className="flex-row items-center justify-between mb-1">
            <View className="flex-row items-center">
              <View
                className="px-2 py-0.5 rounded-full mr-2"
                style={{ backgroundColor: `${color}20` }}
              >
                <Text className="text-xs font-bold" style={{ color }}>
                  {alertTypeLabel(alert.alert_type)}
                </Text>
              </View>
              {!alert.read && (
                <View className="w-2 h-2 rounded-full bg-brand-500" />
              )}
            </View>
            <Text className="text-slate-500 text-xs">
              {timeAgo(alert.created_at)}
            </Text>
          </View>

          <Text className="text-white text-sm font-semibold mb-0.5">
            {alert.title}
          </Text>
          <Text className="text-slate-300 text-sm">{alert.body}</Text>

          {alert.why && (
            <Text className="text-slate-400 text-xs mt-1 italic">
              {alert.why}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}
