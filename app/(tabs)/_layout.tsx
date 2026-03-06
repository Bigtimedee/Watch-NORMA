import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUnreadAlertCount } from "../../hooks/useAlerts";
import { useAgentConfig } from "../../hooks/useNormaAgent";

export default function TabLayout() {
  const { data: unreadCount } = useUnreadAlertCount();
  const { data: agentConfig } = useAgentConfig();
  const agentActive = agentConfig?.is_active ?? false;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0f172a",
          borderTopColor: "#1e293b",
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 88,
        },
        tabBarActiveTintColor: "#f97316",
        tabBarInactiveTintColor: "#64748b",
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="games"
        options={{
          title: "Games",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="basketball-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alerts",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" size={size} color={color} />
          ),
          tabBarBadge: unreadCount && unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: "#f97316",
            fontSize: 10,
          },
        }}
      />
      <Tabs.Screen
        name="connections"
        options={{
          title: "Watch",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="tv-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="agent"
        options={{
          title: "Agent",
          // Fixed: custom icon with overlay dot instead of tabBarBadge: "●"
          // tabBarBadge with a string character does not render as a small dot on iOS —
          // the badge bubble has a fixed minimum width and padding that overwhelms a single char.
          // An absolutely-positioned View overlay on the icon is the correct approach.
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="flask-outline" size={size} color={color} />
              {agentActive && (
                <View style={{
                  position: "absolute",
                  top: -1,
                  right: -3,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: "#22c55e",
                  borderWidth: 1.5,
                  borderColor: "#0f172a",
                }} />
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
