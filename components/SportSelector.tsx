// components/SportSelector.tsx
// Segmented control for switching between NCAA, NBA, and MLB.
// Reads and writes selectedSport via SportContext.

import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSport, type SportKey, SPORT_LABELS } from "../lib/sport-context";

const SPORTS: SportKey[] = ["ncaam", "nba", "mlb"];

interface SportSelectorProps {
  style?: object;
}

export function SportSelector({ style }: SportSelectorProps) {
  const { selectedSport, setSelectedSport } = useSport();

  return (
    <View style={[s.container, style]}>
      {SPORTS.map((sport) => {
        const isActive = selectedSport === sport;
        return (
          <Pressable
            key={sport}
            style={[s.segment, isActive && s.segmentActive]}
            onPress={() => setSelectedSport(sport)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${SPORT_LABELS[sport]} games`}
          >
            <Text style={[s.label, isActive && s.labelActive]}>
              {SPORT_LABELS[sport]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    borderRadius: 10,
    padding: 3,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  segment: {
    flex: 1,
    paddingVertical: 6,
    alignItems: "center",
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: "#1e40af",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },
  labelActive: {
    color: "#ffffff",
  },
});
