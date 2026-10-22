// Guest mode (Growth Spec C fix 1): browse games and follow without an account.
// Follows live in AsyncStorage until signup, then migrate to `follows`.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

export const GUEST_MODE_KEY = "norma.guestMode";
export const GUEST_FOLLOWS_KEY = "norma.guestFollows";

export type GuestFollow = { entity_type: "team" | "game"; entity_id: string; created_at: string };

type Listener = (on: boolean) => void;
const listeners = new Set<Listener>();
let guestCache: boolean | null = null;

export async function isGuestMode(): Promise<boolean> {
  if (guestCache !== null) return guestCache;
  guestCache = (await AsyncStorage.getItem(GUEST_MODE_KEY)) === "1";
  return guestCache;
}

export async function setGuestMode(on: boolean): Promise<void> {
  guestCache = on;
  if (on) await AsyncStorage.setItem(GUEST_MODE_KEY, "1");
  else await AsyncStorage.removeItem(GUEST_MODE_KEY);
  listeners.forEach((l) => l(on));
}

export function subscribeGuestMode(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export async function getGuestFollows(): Promise<GuestFollow[]> {
  try {
    const raw = await AsyncStorage.getItem(GUEST_FOLLOWS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function isGuestFollowing(entity_type: GuestFollow["entity_type"], entity_id: string): Promise<boolean> {
  return (await getGuestFollows()).some((f) => f.entity_type === entity_type && f.entity_id === entity_id);
}

export async function toggleGuestFollow(entity_type: GuestFollow["entity_type"], entity_id: string): Promise<boolean> {
  const list = await getGuestFollows();
  const idx = list.findIndex((f) => f.entity_type === entity_type && f.entity_id === entity_id);
  if (idx >= 0) list.splice(idx, 1);
  else list.push({ entity_type, entity_id, created_at: new Date().toISOString() });
  await AsyncStorage.setItem(GUEST_FOLLOWS_KEY, JSON.stringify(list));
  return idx < 0;
}

/** Move guest follows into `follows` for the signed-in user, then clear guest state. */
export async function migrateGuestFollows(userId: string): Promise<number> {
  const list = await getGuestFollows();
  let moved = 0;
  for (const f of list) {
    const col = f.entity_type === "game" ? "game_id" : "team_id";
    const { data: existing } = await supabase
      .from("follows")
      .select("id")
      .eq("user_id", userId)
      .eq("follow_type", f.entity_type)
      .eq(col, f.entity_id)
      .maybeSingle();
    if (existing) continue;
    const row: Record<string, unknown> = {
      user_id: userId,
      follow_type: f.entity_type,
      entity_type: f.entity_type,
      entity_id: f.entity_id,
      [col]: f.entity_id,
      source: "guest",
    };
    const { error } = await supabase.from("follows").insert(row);
    if (!error) moved++;
  }
  await AsyncStorage.removeItem(GUEST_FOLLOWS_KEY);
  await setGuestMode(false);
  return moved;
}
