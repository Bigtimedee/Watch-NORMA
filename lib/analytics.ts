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

/**
 * Pre-signup funnel events (welcome_viewed, signup_started, guest_*) for users
 * with no account yet. Goes through the allowlisted track_anon_event RPC into
 * web_events. Fire-and-forget; never throws.
 */
export function trackAnonEvent(name: string, props?: EventProps): void {
  try {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        trackEvent(name, props);
        return;
      }
      supabase.rpc("track_anon_event", { p_event: name, p_props: props ?? {} }).then(() => {});
    });
  } catch {
    /* never throw */
  }
}
