import { Platform, Linking } from "react-native";
import type { SportKey, StreamingProvider } from "./types";
import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// Observability: fire-and-forget structured event logging
// ---------------------------------------------------------------------------

interface DeepLinkEventPayload {
  provider_key: string;
  method: "native_scheme" | "universal_link" | "app_store" | "no_fallback";
  link_level: LinkLevel;
  success: boolean;
  fallback_triggered: boolean;
  url_scheme: string | null;
  platform: "ios" | "android" | "web";
}

/**
 * Extract scheme+host from a URL so we never log full URLs (which may carry
 * tokens or other PII in path/query segments).
 * Examples:
 *   "youtube-tv://" -> "youtube-tv://"
 *   "https://apps.apple.com/app/youtube-tv/id1193350206" -> "https://apps.apple.com"
 */
function maskUrlToSchemeHost(url: string): string {
  try {
    // Custom schemes like "youtube-tv://" won't parse cleanly via URL() —
    // return the scheme portion only.
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      const colonSlash = url.indexOf("://");
      return colonSlash !== -1 ? url.slice(0, colonSlash + 3) : url;
    }
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url.slice(0, 64); // best-effort truncation
  }
}

/**
 * Insert a single deep_link_events row. Fire-and-forget: never awaited,
 * never throws, never blocks the deep link opening.
 */
function logDeepLinkEvent(payload: DeepLinkEventPayload): void {
  void (async () => {
    try {
      const { data: sessionData } = (await supabase.auth.getSession()) as any;
      const userId: string | null = sessionData?.session?.user?.id ?? null;
      // RLS requires auth.uid() = user_id; skip anonymous taps.
      if (!userId) return;
      await supabase
        .from("deep_link_events")
        .insert({
          user_id: userId,
          provider_key: payload.provider_key,
          method: payload.method,
          success: payload.success,
          fallback_triggered: payload.fallback_triggered,
          url_scheme: payload.url_scheme,
          platform: payload.platform,
          link_level: payload.link_level,
        });
    } catch {
      // Intentionally a no-op — logging must never surface to the user.
      // Errors here are acceptable (e.g., offline, unauthenticated).
    }
  })();
}

/**
 * Append affiliate tracking parameter to a universal link.
 * Amazon Associates uses `?tag=` while most other programs use `?ref=`.
 */
function appendAffiliateTag(url: string, providerKey: string, tag: string): string {
  try {
    const parsed = new URL(url);
    const paramName = providerKey === "prime_video" ? "tag" : "ref";
    parsed.searchParams.set(paramName, tag);
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Fire-and-forget: log an affiliate tap event to streaming_affiliate_events.
 */
function logAffiliateEvent(providerKey: string, affiliateTag: string): void {
  const { data: sessionData } = supabase.auth.getSession() as any;
  const userId: string | null = sessionData?.session?.user?.id ?? null;

  void (async () => {
    try {
      await supabase.from("streaming_affiliate_events").insert({
        user_id: userId,
        provider_key: providerKey,
        event_type: "tap",
        affiliate_tag: affiliateTag,
      });
    } catch {
      // Non-fatal — affiliate logging must never surface to the user
    }
  })();
}

// ---------------------------------------------------------------------------
// Game-level resolution (Phase 1, streaming-deeplink-research.md §6)
// ---------------------------------------------------------------------------

/** Per-game context used to build a game-level deep link. All optional. */
export interface WatchGameContext {
  espnEventId?: string | null;
  sport?: SportKey | null;
  /** MLB StatsAPI gamePk, when known. */
  mlbGamePk?: number | string | null;
}

export type LinkLevel =
  | "stored_game"
  | "derived_game"
  | "app_universal"
  | "scheme"
  | "app_store"
  | "none";

export interface LinkCandidate {
  url: string;
  level: LinkLevel;
  /** Legacy method label returned to callers. */
  method: string;
  /** True for the legacy streaming_providers.universal_link fallback. */
  legacy?: boolean;
}

/** Build a WatchGameContext from a Game row. */
export function toWatchGameContext(
  game:
    | { id?: string | null; espn_id?: string | null; sport?: SportKey | null; mlb_game_pk?: number | string | null }
    | null
    | undefined
): WatchGameContext | null {
  if (!game) return null;
  // Prod rows leave espn_id NULL and encode the ESPN event id in the primary
  // key ("espn-nfl-401872995"), so fall back to parsing it.
  const fromId = typeof game.id === "string" ? /^espn-[a-z]+-(\d+)$/.exec(game.id)?.[1] ?? null : null;
  return {
    espnEventId: game.espn_id ?? fromId,
    sport: game.sport ?? null,
    mlbGamePk: game.mlb_game_pk ?? null,
  };
}

/** ESPN web league slugs; www.espn.com/<slug>/game/_/gameId/* is AASA-claimed by the ESPN app. */
const ESPN_LEAGUE_SLUGS: Record<SportKey, string> = {
  nfl: "nfl",
  ncaaf: "college-football",
  nba: "nba",
  ncaam: "mens-college-basketball",
  mlb: "mlb",
};

/** Providers whose games are watched inside the ESPN app. */
const ESPN_FAMILY_PROVIDER_KEYS = new Set(["espn_plus", "espn"]);

/**
 * Build a game-level URL from data NORMA already has, without any lookup.
 * Returns null when the provider has no derivable game link.
 */
export function deriveGameLink(
  provider: Pick<StreamingProvider, "key">,
  game?: WatchGameContext | null
): string | null {
  if (!game) return null;
  if (ESPN_FAMILY_PROVIDER_KEYS.has(provider.key)) {
    const slug = game.sport ? ESPN_LEAGUE_SLUGS[game.sport] : undefined;
    const id = game.espnEventId ? String(game.espnEventId).trim() : "";
    if (slug && /^\d+$/.test(id)) {
      return `https://www.espn.com/${slug}/game/_/gameId/${id}`;
    }
  }
  if (provider.key === "mlb_tv" && game.mlbGamePk != null) {
    const pk = String(game.mlbGamePk).trim();
    if (/^\d+$/.test(pk)) return `https://www.mlb.com/tv/g${pk}`;
  }
  return null;
}

/**
 * Amazon Associates tag for Prime Video https links. Only applied when the
 * provider row already carries an affiliate_tag; never invented.
 */
export function applyPrimeAffiliateTag(url: string, provider: StreamingProvider): string {
  if (provider.key !== "prime_video" || !provider.affiliate_tag) return url;
  if (!url.startsWith("https://")) return url;
  return appendAffiliateTag(url, provider.key, provider.affiliate_tag);
}

// Stored game links: tiny in-memory cache so pre-resolve + open hit the DB once.
const storedLinkCache = new Map<string, string | null>();

export function __clearStoredGameLinkCache(): void {
  storedLinkCache.clear();
}

export async function fetchStoredGameLink(
  providerKey: string,
  espnEventId?: string | null
): Promise<string | null> {
  if (!espnEventId) return null;
  const cacheKey = `${espnEventId}:${providerKey}`;
  if (storedLinkCache.has(cacheKey)) return storedLinkCache.get(cacheKey) ?? null;
  try {
    const { data, error } = await supabase
      .from("game_watch_links")
      .select("url")
      .eq("espn_event_id", espnEventId)
      .eq("provider_key", providerKey)
      .maybeSingle();
    const url =
      !error && data && typeof (data as any).url === "string" && (data as any).url.startsWith("https://")
        ? ((data as any).url as string)
        : null;
    storedLinkCache.set(cacheKey, url);
    return url;
  } catch {
    return null; // never block a tap on the lookup
  }
}

/**
 * Ordered list of URLs to try:
 *   1. stored game link (game_watch_links)
 *   2. derived game link (ESPN game page / MLB.TV gamePk)
 *   3. app universal link (streaming_providers.app_universal_link)
 *   4. native scheme (ios_scheme / android_deep_link)
 *   5. legacy universal_link (unchanged behavior, affiliate-tagged)
 *   6. App Store
 */
export async function buildLinkCandidates(
  provider: StreamingProvider,
  game?: WatchGameContext | null
): Promise<LinkCandidate[]> {
  const out: LinkCandidate[] = [];
  const push = (url: string | null | undefined, level: LinkLevel, method: string, legacy = false) => {
    if (url && !out.some((c) => c.url === url)) out.push({ url, level, method, ...(legacy ? { legacy } : {}) });
  };

  const stored = await fetchStoredGameLink(provider.key, game?.espnEventId ?? null);
  push(stored ? applyPrimeAffiliateTag(stored, provider) : null, "stored_game", "game_link");

  const derived = deriveGameLink(provider, game);
  push(derived ? applyPrimeAffiliateTag(derived, provider) : null, "derived_game", "game_link");

  const appUl = provider.app_universal_link ?? null;
  push(appUl ? applyPrimeAffiliateTag(appUl, provider) : null, "app_universal", "universal_link");

  if (Platform.OS === "ios") push(provider.ios_scheme, "scheme", "native_app");
  if (Platform.OS === "android") push(provider.android_deep_link, "scheme", "native_app");

  // Legacy universal_link (subscriber-only URLs are NULL in the DB, mig 036).
  const legacyUl = provider.universal_link ?? null;
  if (legacyUl) {
    const tag = provider.affiliate_tag ?? null;
    push(tag ? appendAffiliateTag(legacyUl, provider.key, tag) : legacyUl, "app_universal", "universal_link", true);
  }

  push(provider.fallback_store_url ?? provider.ios_app_store_url ?? null, "app_store", "app_store");
  return out;
}

function eventMethodFor(level: LinkLevel): DeepLinkEventPayload["method"] {
  switch (level) {
    case "scheme":
      return "native_scheme";
    case "app_store":
      return "app_store";
    case "none":
      return "no_fallback";
    default:
      return "universal_link";
  }
}

function currentPlatform(): DeepLinkEventPayload["platform"] {
  return Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
}

/**
 * Attempt to open a streaming app for a given provider, game-level first.
 * Every tap logs its resolved level to deep_link_events (link_level).
 * Legacy callers may still pass a game title string; it is ignored.
 */
export async function openStreamingApp(
  provider: StreamingProvider,
  game?: WatchGameContext | string | null
): Promise<{ opened: boolean; fallback: boolean; method: string; level: LinkLevel }> {
  const ctx = typeof game === "object" ? game : null;
  const candidates = await buildLinkCandidates(provider, ctx);

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    try {
      await Linking.openURL(c.url);
      const isLegacyUl = !!c.legacy;
      const fallback = c.level === "app_store" || isLegacyUl;
      const tagged =
        !!provider.affiliate_tag &&
        (isLegacyUl || (provider.key === "prime_video" && c.url.startsWith("https://") && c.level !== "app_store"));
      if (tagged) logAffiliateEvent(provider.key, provider.affiliate_tag as string);
      logDeepLinkEvent({
        provider_key: provider.key,
        method: eventMethodFor(c.level),
        link_level: c.level,
        success: true,
        fallback_triggered: i > 0,
        url_scheme: maskUrlToSchemeHost(c.url),
        platform: currentPlatform(),
      });
      return { opened: true, fallback, method: c.method, level: c.level };
    } catch {
      // try next candidate
    }
  }

  logDeepLinkEvent({
    provider_key: provider.key,
    method: "no_fallback",
    link_level: "none",
    success: false,
    fallback_triggered: candidates.length > 0,
    url_scheme: null,
    platform: currentPlatform(),
  });
  return { opened: false, fallback: false, method: "none", level: "none" };
}

/**
 * Resolve the deep link URL for a provider without opening it.
 * Returns the first candidate in the resolution order, or null.
 */
export async function resolveDeepLinkUrl(
  provider: StreamingProvider,
  game?: WatchGameContext | null
): Promise<{ url: string; method: string; level: LinkLevel } | null> {
  const candidates = await buildLinkCandidates(provider, game ?? null);
  const first = candidates[0];
  return first ? { url: first.url, method: first.method, level: first.level } : null;
}

// Known regional sports networks — these are local/regional RSN broadcasts
// that may be subject to blackouts depending on the viewer's market.
// National broadcasts (ESPN, CBS, FOX, NBC, etc.) are not in this list.
const REGIONAL_BROADCAST_PATTERNS: string[] = [
  "BALLY",            // Bally Sports regional networks (Diamond Sports Group)
  "ROOT SPORTS",      // Root Sports (regional)
  "MSG",              // Madison Square Garden Network
  "YES NETWORK",      // Yankees Entertainment & Sports
  "SNY",              // SportsNet New York
  "MASN",             // Mid-Atlantic Sports Network
  "NESN",             // New England Sports Network
  "NBCS ",            // NBCS Bay Area, NBCS Philadelphia, etc. (note trailing space)
  "AT&T SPORTSNET",   // AT&T SportsNet regional networks
  "SPECTRUM SPORTS",  // Spectrum Sports regional networks
  "SUN SPORTS",       // Bally Sports Sun (South Florida)
  "ALTITUDE",         // Altitude Sports (Denver region)
  "REGIONAL",         // Catch-all: any explicitly labeled "Regional" broadcast
];

/**
 * Returns true if the broadcast string indicates a regional sports network (RSN)
 * that is typically subject to local blackout restrictions.
 * National networks (ESPN, CBS, FOX, NBC, TNT, TBS, etc.) return false.
 */
export function isRegionalBroadcast(broadcast: string | null): boolean {
  if (!broadcast) return false;
  const upper = broadcast.toUpperCase();
  return REGIONAL_BROADCAST_PATTERNS.some((p) => upper.includes(p));
}

// Linear (cable / broadcast) networks that live TV bundles carry.
// "ESPN" not followed by "+" is linear ESPN; "ESPN+" alone is streaming-only.
const LINEAR_NETWORK_RE =
  /\b(ESPN(?!\+)|ESPN2|ESPNU|ABC|CBS|CBSSN|FOX|FS1|FS2|NBC|NBCSN|USA|TNT|TBS|TRUTV|NFL NETWORK|NFLNET|BTN|BIG TEN NETWORK|SEC NETWORK|SECN|ACC NETWORK|ACCN|NBA TV|NBATV|NHL NETWORK|NHLNET|MLB NETWORK|MLBN|CW)\b/;
const STREAMING_EXCLUSIVE_RE =
  /PRIME|AMAZON|THURSDAY NIGHT FOOTBALL|\bTNF\b|PEACOCK|NETFLIX|ESPN\+|APPLE TV|DAZN|YOUTUBE(?! ?TV)/;

/**
 * True when the game streams only on a streaming service (Prime Video,
 * Peacock, Netflix, ESPN+, Apple TV+, DAZN) with no linear network listed, so
 * live TV bundles like YouTube TV cannot carry it.
 */
export function isStreamingExclusiveBroadcast(broadcast: string | null): boolean {
  if (!broadcast) return false;
  const normalized = broadcast.toUpperCase().trim();
  return STREAMING_EXCLUSIVE_RE.test(normalized) && !LINEAR_NETWORK_RE.test(normalized);
}

/**
 * Map broadcast network names to streaming provider keys.
 * Used to suggest which app to open for watching a game.
 */
export function getBroadcastProviderKeys(
  broadcast: string | null
): string[] {
  if (!broadcast) return [];

  const normalized = broadcast.toUpperCase().trim();
  const providers: string[] = [];

  // ESPN family — ESPN, ESPN2, ESPNU, ESPN3, ESPN+, ABC (all in the ESPN app)
  if (
    normalized.includes("ESPN") ||
    normalized.includes("ABC") ||
    normalized.includes("SEC NETWORK") ||
    normalized.includes("SECN") ||
    normalized.includes("ACC NETWORK") ||
    normalized.includes("ACCN")
  ) {
    providers.push("espn_plus");
  }
  // CBS family — CBS broadcast, CBS Sports Network (CBSSN), Paramount+
  if (normalized.includes("CBS")) {
    providers.push("paramount_plus", "cbs_sports");
  }
  // Fox family — FOX broadcast, FS1, FS2, BTN (Big Ten Network is Fox-distributed)
  if (
    normalized.includes("FOX") ||
    normalized.includes("FS1") ||
    normalized.includes("FS2") ||
    normalized.includes("BTN") ||
    normalized.includes("BIG TEN NETWORK")
  ) {
    providers.push("fox_sports");
  }
  if (normalized.includes("TNT")) {
    providers.push("tnt_drama", "max");
  }
  if (normalized.includes("TBS")) {
    providers.push("tbs", "max");
  }
  if (normalized.includes("TRUTV")) {
    providers.push("trutv", "max");
  }
  // Peacock: NBC Sunday Night Football + NBC exclusive Sunday games are labeled
  // in a handful of narrative forms by ESPN ("NBC", "Peacock", "Sunday Night
  // Football", "NFL+ Exclusive", "Peacock Exclusive"). The bare "NBC"/"PEACOCK"
  // check missed the primetime narrative strings (H-5 in the 2026-08-23 audit).
  if (
    normalized.includes("PEACOCK") ||
    normalized.includes("NBC") ||
    normalized.includes("SUNDAY NIGHT FOOTBALL") ||
    normalized.includes("SNF") ||
    normalized.includes("NFL+")
  ) {
    providers.push("peacock");
  }
  if (normalized.includes("MLB")) {
    providers.push("mlb_tv");
  }
  // Prime Video: Amazon Thursday Night Football is often listed just as
  // "Thursday Night Football" or "TNF"; add explicit narrative patterns.
  if (
    normalized.includes("PRIME") ||
    normalized.includes("AMAZON") ||
    normalized.includes("THURSDAY NIGHT FOOTBALL") ||
    normalized.includes("TNF")
  ) {
    providers.push("prime_video");
  }
  if (normalized.includes("APPLE TV") || normalized.includes("APPLE TV+")) {
    providers.push("apple_tv_plus");
  }
  if (normalized.includes("NFL NETWORK") || normalized.includes("NFLNET")) {
    providers.push("nfl_network");
  }
  // NFL Sunday Ticket is exclusive to YouTube Primetime Channels (per YouTube).
  // If ESPN emits "SUNDAY TICKET" or "NFL SUNDAY TICKET", route users there.
  if (normalized.includes("SUNDAY TICKET")) {
    providers.push("youtube_primetime_channels");
  }
  if (normalized.includes("NBA TV") || normalized.includes("NBATV")) {
    providers.push("nba_tv");
  }
  if (normalized.includes("NHL NETWORK") || normalized.includes("NHLNET")) {
    providers.push("nhl_network");
  }
  if (normalized.includes("NETFLIX")) {
    providers.push("netflix");
  }
  if (normalized.includes("DAZN")) {
    providers.push("dazn");
  }

  // Live TV providers (YouTube TV, Hulu Live, Fubo, Sling, DirecTV Stream) can
  // carry most national feeds, but they cannot bypass regional blackouts —
  // linking to them for a blackout-prone RSN game leads the user to a dead end.
  // Only append them for non-regional broadcasts (H-6 in the 2026-08-23 audit).
  //
  // Streaming-exclusive games (Prime Video TNF, Peacock exclusives, Netflix,
  // ESPN+, Apple TV+, DAZN) are NOT carried by live TV bundles, so appending
  // them sent the CTA to YouTube TV for SEA@DEN on Prime (Design QA 10/14).
  if (!isRegionalBroadcast(broadcast) && !isStreamingExclusiveBroadcast(broadcast)) {
    providers.push("youtube_tv", "hulu_live", "fubo", "sling", "directv_stream");
  }

  return providers;
}

/**
 * Get the best provider to watch a game based on user's connections.
 */
export function getBestWatchProvider(
  broadcast: string | null,
  connectedProviderKeys: string[],
  allProviders: StreamingProvider[]
): StreamingProvider | null {
  const broadcastKeys = getBroadcastProviderKeys(broadcast);

  // Find the first connected provider that can show this game
  for (const key of broadcastKeys) {
    if (connectedProviderKeys.includes(key)) {
      const provider = allProviders.find((p) => p.key === key);
      if (provider) return provider;
    }
  }

  return null;
}
