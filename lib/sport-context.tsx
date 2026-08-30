// lib/sport-context.tsx
// Global sport selector context — persists selected sport via AsyncStorage.
// All game and alert hooks consume selectedSport from this context.

import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
// KL-7: SportKey single source of truth is lib/types.ts (client-side).
// _shared/sportradar.ts keeps its own copy — Deno runtime can't import from lib/.
import type { SportKey } from "./types";
export type { SportKey };

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
const VALID_SPORTS: SportKey[] = ["ncaam", "nba", "mlb", "ncaaf", "nfl"];

interface SportContextValue {
  /** undefined = "All Sports" (no filter) */
  selectedSport: SportKey | undefined;
  setSelectedSport: (sport: SportKey | undefined) => void;
  isLoaded: boolean;
}

const SportContext = createContext<SportContextValue>({
  selectedSport: undefined,
  setSelectedSport: () => {},
  isLoaded: false,
});

export function SportProvider({ children }: { children: React.ReactNode }) {
  const [selectedSport, setSelectedSportState] = useState<SportKey | undefined>(undefined);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load persisted sport on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored && (VALID_SPORTS as string[]).includes(stored)) {
          setSelectedSportState(stored as SportKey);
        }
        // null → "All Sports" (undefined) — already the default
      })
      .catch(() => {
        // Ignore storage errors — default to All Sports
      })
      .finally(() => setIsLoaded(true));
  }, []);

  const setSelectedSport = (sport: SportKey | undefined) => {
    setSelectedSportState(sport);
    if (sport) {
      AsyncStorage.setItem(STORAGE_KEY, sport).catch(() => {});
    } else {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    }
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
