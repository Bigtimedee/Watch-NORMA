// Spec C: 3-step onboarding checklist + push primer state (device-local).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trackEvent } from "./analytics";

const PRIMER_KEY = "norma.pushPrimerSeen";
const CHECKLIST_KEY = "norma.onboardingChecklist";

export type ChecklistStep = "follow_teams" | "connect_account" | "notifications";
export type ChecklistState = { done: ChecklistStep[]; dismissed: boolean };

export const CHECKLIST_STEPS: { key: ChecklistStep; title: string; desc: string }[] = [
  { key: "follow_teams", title: "Follow 2 teams or games", desc: "NORMA ranks alerts by what you care about." },
  { key: "connect_account", title: "Connect a sportsbook, Kalshi or Polymarket", desc: "Optional. Lets NORMA know which games matter to your wallet." },
  { key: "notifications", title: "Allow notifications", desc: "So NORMA can ping you when your game gets close." },
];

export async function hasSeenPushPrimer(): Promise<boolean> {
  return (await AsyncStorage.getItem(PRIMER_KEY)) === "1";
}

export async function markPushPrimerSeen(): Promise<void> {
  await AsyncStorage.setItem(PRIMER_KEY, "1");
}

export async function getChecklist(): Promise<ChecklistState> {
  try {
    const raw = await AsyncStorage.getItem(CHECKLIST_KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (p && Array.isArray(p.done)) return { done: p.done, dismissed: !!p.dismissed };
  } catch {
    /* fall through */
  }
  return { done: [], dismissed: false };
}

export async function completeStep(step: ChecklistStep, extra?: Record<string, string | boolean>): Promise<ChecklistState> {
  const s = await getChecklist();
  if (!s.done.includes(step)) {
    s.done.push(step);
    await AsyncStorage.setItem(CHECKLIST_KEY, JSON.stringify(s));
    trackEvent("onboarding_step_completed", { step, ...(extra ?? {}) });
  }
  return s;
}

export async function dismissChecklist(): Promise<void> {
  const s = await getChecklist();
  s.dismissed = true;
  await AsyncStorage.setItem(CHECKLIST_KEY, JSON.stringify(s));
  trackEvent("onboarding_checklist_dismissed", { done: s.done.length });
}
