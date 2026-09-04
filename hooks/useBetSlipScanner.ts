import { useState } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../lib/supabase";
import type { WagerType } from "../lib/types";

export interface ScannedWager {
  sportsbook: string;
  wager_type: WagerType;
  description: string;
  team_name: string | null;
  line: number | null;
  odds: string | null;
  entry_fee?: number | null;
  payout_multiplier?: number | null;
  legs?: Array<{
    player_name?: string;
    stat?: string;
    line?: number;
    direction?: string;
    description?: string;
  }>;
}

export interface ScanResult {
  wagers: ScannedWager[];
  confidence: "high" | "medium" | "low";
}

export function useBetSlipScanner() {
  const [isScanning, setIsScanning] = useState(false);

  const scanBetSlip = async (gameId?: string): Promise<ScanResult | null> => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "NORMA needs access to your photo library to scan bet slips. Please enable it in Settings."
        );
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]?.base64) {
        return null;
      }

      setIsScanning(true);

      const asset = result.assets[0];
      const mediaType = asset.mimeType ?? "image/jpeg";

      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) {
        Alert.alert("Error", "You must be logged in to scan bet slips.");
        return null;
      }

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/parse-bet-slip`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({
            imageBase64: asset.base64,
            mediaType,
            gameId,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        Alert.alert("Scan Failed", data.error ?? "Could not parse the bet slip. Please try a clearer screenshot.");
        return null;
      }

      if (data.wagers.length === 0) {
        Alert.alert("No Wagers Found", "Could not find any wagers in this image. Make sure the screenshot shows a bet slip.");
        return null;
      }

      return {
        wagers: data.wagers,
        confidence: data.confidence,
      };
    } catch (error: any) {
      Alert.alert("Error", error.message ?? "Something went wrong while scanning.");
      return null;
    } finally {
      setIsScanning(false);
    }
  };

  return { scanBetSlip, isScanning };
}
