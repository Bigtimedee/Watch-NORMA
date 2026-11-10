/**
 * Privacy-safe diagnostic shape. The shipped publisher does not call
 * analytics, Supabase, crash reporting, or the network. Wiring a sink
 * requires a separate privacy review. Outcomes never mean playback success.
 */

export const PLAYER_ROUTE_DIAGNOSTIC_SINK_STATUS = "not_wired_pending_privacy_review" as const;

export type PlayerRouteSurface = "game_detail" | "notification_action" | "settings_test";
export type PlayerRouteDiagnosticResult =
  | "handoff_accepted"
  | "handoff_rejected"
  | "blocked_unverified_encoding"
  | "no_route"
  | "ambiguous"
  | "flag_off"
  | "fallback_game_detail";

export interface SanitizedDiagnostic {
  surface: PlayerRouteSurface;
  result: PlayerRouteDiagnosticResult;
  player: "strymtv";
}

const SURFACES = new Set<string>(["game_detail", "notification_action", "settings_test"]);
const RESULTS = new Set<string>([
  "handoff_accepted",
  "handoff_rejected",
  "blocked_unverified_encoding",
  "no_route",
  "ambiguous",
  "flag_off",
  "fallback_game_detail",
]);

export function sanitizePlayerRouteDiagnostic(input: unknown): SanitizedDiagnostic | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 3 || keys.some((key) => key !== "surface" && key !== "result" && key !== "player")) {
    return null;
  }
  if (record.player !== "strymtv") return null;
  if (typeof record.surface !== "string" || !SURFACES.has(record.surface)) return null;
  if (typeof record.result !== "string" || !RESULTS.has(record.result)) return null;
  return {
    surface: record.surface as PlayerRouteSurface,
    result: record.result as PlayerRouteDiagnosticResult,
    player: "strymtv",
  };
}

export type DiagnosticSink = (event: SanitizedDiagnostic) => void;

export function createDiagnosticPublisher(sink: DiagnosticSink | null): (input: unknown) => void {
  return (input: unknown) => {
    if (!sink) return;
    const clean = sanitizePlayerRouteDiagnostic(input);
    if (!clean) return;
    sink(clean);
  };
}

/** Discards every event. */
export const publishShippedPlayerRouteDiagnostic = createDiagnosticPublisher(null);
