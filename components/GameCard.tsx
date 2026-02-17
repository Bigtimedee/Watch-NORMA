import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import type { Game } from "../lib/types";
import { formatClock } from "../lib/alert-helpers";
import { LIVE_STATUSES } from "../lib/constants";

interface GameCardProps {
  game: Game;
}

export function GameCard({ game }: GameCardProps) {
  const router = useRouter();
  const isLive = LIVE_STATUSES.includes(game.status as any);
  const isFinal = game.status === "closed";

  return (
    <Pressable
      className="bg-court-card rounded-2xl p-4 mb-3 mx-4"
      onPress={() => router.push(`/games/${game.id}`)}
    >
      {/* Header: broadcast + status */}
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-slate-400 text-xs font-medium">
          {game.broadcast ?? ""}
          {game.tournament_round ? ` \u00B7 ${game.tournament_round}` : ""}
        </Text>
        <View
          className={`px-2 py-0.5 rounded-full ${
            isLive ? "bg-red-500/20" : isFinal ? "bg-slate-600" : "bg-slate-700"
          }`}
        >
          <Text
            className={`text-xs font-bold ${
              isLive ? "text-red-400" : "text-slate-300"
            }`}
          >
            {isLive ? `LIVE \u00B7 ${formatClock(game)}` : formatClock(game)}
          </Text>
        </View>
      </View>

      {/* Away team */}
      <View className="flex-row justify-between items-center mb-2">
        <View className="flex-row items-center flex-1">
          <View className="w-8 h-8 rounded-full bg-court-surface items-center justify-center mr-3">
            <Text className="text-white text-xs font-bold">
              {game.away_team?.abbreviation?.slice(0, 3) ?? "AWY"}
            </Text>
          </View>
          <Text className="text-white text-base font-semibold" numberOfLines={1}>
            {game.away_team?.name ?? "Away"}
          </Text>
        </View>
        <Text
          className={`text-2xl font-bold ${
            isLive || isFinal ? "text-white" : "text-slate-500"
          }`}
        >
          {game.status !== "scheduled" ? game.away_score : "-"}
        </Text>
      </View>

      {/* Home team */}
      <View className="flex-row justify-between items-center">
        <View className="flex-row items-center flex-1">
          <View className="w-8 h-8 rounded-full bg-court-surface items-center justify-center mr-3">
            <Text className="text-white text-xs font-bold">
              {game.home_team?.abbreviation?.slice(0, 3) ?? "HME"}
            </Text>
          </View>
          <Text className="text-white text-base font-semibold" numberOfLines={1}>
            {game.home_team?.name ?? "Home"}
          </Text>
        </View>
        <Text
          className={`text-2xl font-bold ${
            isLive || isFinal ? "text-white" : "text-slate-500"
          }`}
        >
          {game.status !== "scheduled" ? game.home_score : "-"}
        </Text>
      </View>

      {/* Venue */}
      {game.venue && (
        <Text className="text-slate-500 text-xs mt-2">{game.venue}</Text>
      )}
    </Pressable>
  );
}
