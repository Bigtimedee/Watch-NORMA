import { supabase } from "./supabase";

type EventProps = Record<string, string | number | boolean | null>;

/**
 * Fire-and-forget event tracking. Fails silently — never throws.
 * Requires an authenticated session; no-ops if no user is signed in.
 * Never include PII (no emails, names, device IDs) in props.
 */
export function trackEvent(name: string, props?: EventProps): void {
  supabase.auth.getUser().then(({ data }) => {
    if (!data.user) return;
    supabase
      .from("app_events")
      .insert({ user_id: data.user.id, event_name: name, properties: props ?? {} })
      .then(() => {});
  });
}
