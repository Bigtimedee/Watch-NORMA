import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { getReferralCode } from "./referral-utils";
import { trackAnonEvent, trackEvent } from "./analytics";

// Same key sign-up.tsx already uses for email signup metadata.
export const REFERRAL_CODE_KEY = "norma.referralCode";
const MATCH_DONE_KEY = "norma.refMatchDone";
const WEB_BASE = "https://getnorma.app";

export async function captureReferralFromUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  const code = getReferralCode(url);
  if (!code) return null;
  await AsyncStorage.setItem(REFERRAL_CODE_KEY, code);
  trackAnonEvent("referral_link_open", { code, via: "app" });
  return code;
}

/** Free deferred deep link: once per install, ask the web for a same-IP /i/ click in 24h. */
export async function runDeferredReferralMatch(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(MATCH_DONE_KEY)) return;
    await AsyncStorage.setItem(MATCH_DONE_KEY, "1");
    if (await AsyncStorage.getItem(REFERRAL_CODE_KEY)) return;
    const res = await fetch(`${WEB_BASE}/api/referral-match`);
    if (!res.ok) return;
    const { code } = (await res.json()) as { code: string | null };
    if (code) {
      await AsyncStorage.setItem(REFERRAL_CODE_KEY, code);
      trackAnonEvent("referral_install_attributed", { code });
    }
  } catch {
    // best effort
  }
}

/** After any sign-in (Apple / Google / email), attach the stored code if the user has no referral yet. */
export async function claimStoredReferral(method: string | undefined): Promise<void> {
  try {
    const code = await AsyncStorage.getItem(REFERRAL_CODE_KEY);
    if (!code) return;
    const { data } = await supabase.rpc("claim_referral", { p_code: code, p_method: method ?? null });
    if (data === true) trackEvent("referral_claimed", { code, method: method ?? "unknown" });
    await AsyncStorage.removeItem(REFERRAL_CODE_KEY);
  } catch {
    // keep the code; retry next sign-in
  }
}

export const REFERRAL_SHARE_TEXT = (link: string) =>
  `I get alerts when my game matters. Join me on NORMA: ${link}`;
