import React, { createContext, useContext } from "react";
import {
  useTapToStreamEngine,
  PHASE_IDLE,
  LINE_IDLE,
} from "../hooks/useTapToStream";
import type { SharedValue } from "react-native-reanimated";
import type { StreamingProvider } from "./types";

interface TapToStreamContextValue {
  triggerStream: (
    provider: StreamingProvider,
    options?: { skipAnticipation?: boolean }
  ) => Promise<void>;
  phase: SharedValue<number>;
  normaLineMode: SharedValue<number>;
  normaLineProgress: SharedValue<number>;
  overlayOpacity: SharedValue<number>;
  overlayBlur: SharedValue<number>;
  contentScale: SharedValue<number>;
  showPortalText: SharedValue<number>;
  providerNameRef: React.MutableRefObject<string>;
}

const TapToStreamContext = createContext<TapToStreamContextValue | null>(null);

export function TapToStreamProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const engine = useTapToStreamEngine();

  return (
    <TapToStreamContext.Provider value={engine}>
      {children}
    </TapToStreamContext.Provider>
  );
}

export function useTapToStream() {
  const ctx = useContext(TapToStreamContext);
  if (!ctx) {
    throw new Error("useTapToStream must be used within TapToStreamProvider");
  }
  return ctx;
}
