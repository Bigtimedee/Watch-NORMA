import { useEffect, useState } from "react";
import { inferStateFromTimezone } from "../lib/geo-compliance";
import { supabase } from "../lib/supabase";

interface SportsbookGeoResult {
  eligible: boolean;
  reason?: string;
}

const loadingResult: SportsbookGeoResult = { eligible: true };

export function useSportsbookGeo(providerKey?: string | null): SportsbookGeoResult {
  const [result, setResult] = useState<SportsbookGeoResult>(loadingResult);

  useEffect(() => {
    let cancelled = false;

    async function checkEligibility() {
      setResult(loadingResult);

      if (!providerKey) return;

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", user.id)
          .maybeSingle();

        const state = inferStateFromTimezone(profile?.timezone);
        if (!state) {
          if (!cancelled) {
            setResult({
              eligible: false,
              reason: "Not available in your region",
            });
          }
          return;
        }

        const { data: restriction } = await supabase
          .from("sportsbook_restrictions")
          .select("allowed_states")
          .eq("sportsbook_key", providerKey)
          .maybeSingle();

        const allowedStates = restriction?.allowed_states;
        if (!allowedStates) return;

        if (!cancelled) {
          setResult(
            allowedStates.includes(state)
              ? { eligible: true }
              : { eligible: false, reason: "Not available in your region" }
          );
        }
      } catch {
        if (!cancelled) setResult({ eligible: true });
      }
    }

    checkEligibility();

    return () => {
      cancelled = true;
    };
  }, [providerKey]);

  return result;
}
