// lib/sport-context.tsx
// Global sport selector context — persists selected sport via AsyncStorage.
// All game and alert hooks consume selectedSport from this context.

import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type SportKey = "ncaam" | "nba" | "mlb" | "ncaaf" | "nfl";

export const SPORT_LABELS: Record<SportKey, string> = {
  ncaam: "NCAA",
  nba:   "NBA",
  mlb:   "MLB",
  ncaaf: "NCAAF",
  nfl:   "NFL",
};

export const SPORT_DISPLAY_NAMES: Record<SportKey, string> = {
  ncaam: "NCAA Men's Basketball",
  nba:   "NBA Basketball",
  mlb:   "MLB Baseball",
  ncaaf: "NCAA Football",
  nfl:   "NFL Football",
};

const STORAGE_KEY = "norma:selectedSport";
const DEFAULT_SPORT: SportKey = "ncaam";

interface SportContextValue {
  selectedSport: SportKey;
  setSelectedSport: (sport: SportKey) => void;
  isLoaded: boolean;
}

const SportContext = createContext<SportContextValue>({
  selectedSport: DEFAULT_SPORT,
  setSelectedSport: () => {},
  isLoaded: false,
});

export function SportProvider({ children }: { children: React.ReactNode }) {
  const [selectedSport, setSelectedSportState] = useState<SportKey>(DEFAULT_SPORT);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load persisted sport on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (
          stored &&
          (stored === "ncaam" ||
            stored === "nba" ||
            stored === "mlb" ||
            stored === "ncaaf" ||
            stored === "nfl")
        ) {
          setSelectedSportState(stored as SportKey);
        }
      })
      .catch(() => {
        // Ignore storage errors — default to ncaam
      })
      .finally(() => setIsLoaded(true));
  }, []);

  const setSelectedSport = (sport: SportKey) => {
    setSelectedSportState(sport);
    AsyncStorage.setItem(STORAGE_KEY, sport).catch(() => {});
  };

  return (
    <SportContext.Provider value={{ selectedSport, setSelectedSport, isLoaded }}>
      {children}
    </SportContext.Provider>
  );
}

export function useSport(): SportContextValue {
  return useContext(SportContext);
}
