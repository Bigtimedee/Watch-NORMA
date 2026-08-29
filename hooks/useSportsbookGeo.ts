import { useEffect, useState } from "react";
import { inferStateFromTimezone } from "../lib/geo-compliance";
import { supabase } from "../lib/supabase";

interface SportsbookGeoResult {
  eligible: boolean;
  reason?: string;
}

// Compliance policy (FX3, 2026-08-23): fail-closed everywhere. The initial
// "loading" state renders as ineligible so the CTA is not shown before the
// check completes; a positive eligibility decision is required to unlock it.
const loadingResult: SportsbookGeoResult = { eligible: false, reason: "Verifying region…" };
const blockedResult: SportsbookGeoResult = { eligible: false, reason: "Not available in your region" };

export function useSportsbookGeo(providerKey?: string | null): SportsbookGeoResult {
  const [result, setResult] = useState<SportsbookGeoResult>(loadingResult);

  useEffect(() => {
    let cancelled = false;

    async function checkEligibility() {
      setResult(loadingResult);

      // No provider passed → nothing to check; leave the loading (ineligible)
      // state in place so callers can differentiate "unknown provider" cleanly.
      if (!providerKey) return;

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        // Unauthenticated / missing user → fail-closed.
        if (!user) {
          if (!cancelled) setResult(blockedResult);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", user.id)
          .maybeSingle();

        const state = inferStateFromTimezone(profile?.timezone);
        if (!state) {
          if (!cancelled) setResult(blockedResult);
          return;
        }

        const { data: restriction } = await supabase
          .from("sportsbook_restrictions")
          .select("allowed_states")
          .eq("sportsbook_key", providerKey)
          .maybeSingle();

        // No restriction row = we don't have compliance data for this book →
        // fail-closed. (Previously the code returned early leaving eligible
        // in whatever state the caller was in, which paired with the old
        // fail-open loadingResult was effectively fail-open.)
        const allowedStates = restriction?.allowed_states;
        if (!allowedStates) {
          if (!cancelled) setResult(blockedResult);
          return;
        }

        if (!cancelled) {
          setResult(
            allowedStates.includes(state)
              ? { eligible: true }
              : blockedResult,
          );
        }
      } catch (err) {
        // API error or network failure → fail-closed. This used to silently
        // fail-open (setResult({ eligible: true })), which meant a Supabase
        // outage would expose the CTA to every user in every state.
        console.warn("[useSportsbookGeo] eligibility check failed:", (err as Error)?.message);
        if (!cancelled) setResult(blockedResult);
      }
    }

    checkEligibility();

    return () => {
      cancelled = true;
    };
  }, [providerKey]);

  return result;
}
