import { View, Text } from "react-native";
import type { Game } from "../lib/types";
import { formatClock } from "../lib/alert-helpers";
import { LIVE_STATUSES } from "../lib/constants";

interface ScoreHeaderProps {
  game: Game;
}

export function ScoreHeader({ game }: ScoreHeaderProps) {
  const isLive = LIVE_STATUSES.includes(game.status as any);
  const isFinal = game.status === "closed";

  return (
    <View className="bg-court-card rounded-2xl p-6 mx-4 mb-4">
      {/* Status badge */}
      <View className="items-center mb-4">
        {game.tournament_round && (
          <Text className="text-brand-400 text-xs font-bold mb-1">
            {game.tournament_round}
          </Text>
        )}
        <View
          className={`px-3 py-1 rounded-full ${
            isLive ? "bg-red-500/20" : "bg-slate-700"
          }`}
        >
          <Text
            className={`text-sm font-bold ${
              isLive ? "text-red-400" : "text-slate-300"
            }`}
          >
            {isLive ? `LIVE \u00B7 ${formatClock(game)}` : formatClock(game)}
          </Text>
        </View>
      </View>

      {/* Score display */}
      <View className="flex-row items-center justify-center">
        {/* Away team */}
        <View className="flex-1 items-center">
          <View className="w-16 h-16 rounded-full bg-court-surface items-center justify-center mb-2">
            <Text className="text-white text-lg font-bold">
              {game.away_team?.abbreviation?.slice(0, 4) ?? "AWY"}
            </Text>
          </View>
          <Text
            className="text-white text-sm font-medium text-center"
            numberOfLines={2}
          >
            {game.away_team?.market ?? game.away_team?.name ?? "Away"}
          </Text>
        </View>

        {/* Score */}
        <View className="mx-4 items-center">
          {game.status === "scheduled" ? (
            <Text className="text-slate-400 text-lg font-medium">vs</Text>
          ) : (
            <View className="flex-row items-baseline">
              <Text
                className={`text-4xl font-bold ${
                  isFinal && game.away_score > game.home_score
                    ? "text-brand-400"
                    : "text-white"
                }`}
              >
                {game.away_score}
              </Text>
              <Text className="text-slate-500 text-2xl font-bold mx-2">-</Text>
              <Text
                className={`text-4xl font-bold ${
                  isFinal && game.home_score > game.away_score
                    ? "text-brand-400"
                    : "text-white"
                }`}
              >
                {game.home_score}
              </Text>
            </View>
          )}
        </View>

        {/* Home team */}
        <View className="flex-1 items-center">
          <View className="w-16 h-16 rounded-full bg-court-surface items-center justify-center mb-2">
            <Text className="text-white text-lg font-bold">
              {game.home_team?.abbreviation?.slice(0, 4) ?? "HME"}
            </Text>
          </View>
          <Text
            className="text-white text-sm font-medium text-center"
            numberOfLines={2}
          >
            {game.home_team?.market ?? game.home_team?.name ?? "Home"}
          </Text>
        </View>
      </View>

      {/* Venue + broadcast */}
      <View className="items-center mt-4">
        {game.venue && (
          <Text className="text-slate-400 text-xs">{game.venue}</Text>
        )}
        {game.broadcast && (
          <Text className="text-slate-500 text-xs mt-1">
            {game.broadcast}
          </Text>
        )}
      </View>
    </View>
  );
}
