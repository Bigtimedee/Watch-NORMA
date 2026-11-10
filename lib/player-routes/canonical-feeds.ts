/**
 * Exact US-national feed catalog. A broadcast string maps only when every
 * token is a known catalog token and all of those tokens are the same feed.
 * Unknown, mixed, or narrative strings do not guess a channel.
 */

export interface CanonicalFeed {
  id: string;
  label: string;
  territory: "US";
  variant: "national";
  kind: "national_linear" | "streaming_exclusive";
  tokens: readonly string[];
}

export const CANONICAL_FEEDS: readonly CanonicalFeed[] = [
  feed("us.national.espn", "ESPN (US national)", "national_linear", ["ESPN"]),
  feed("us.national.espn2", "ESPN2 (US national)", "national_linear", ["ESPN2"]),
  feed("us.national.espnu", "ESPNU (US national)", "national_linear", ["ESPNU"]),
  feed("us.national.espnews", "ESPNEWS (US national)", "national_linear", ["ESPNEWS", "ESPN NEWS"]),
  feed("us.national.abc", "ABC (US national)", "national_linear", ["ABC"]),
  feed("us.national.cbs", "CBS (US national)", "national_linear", ["CBS"]),
  feed("us.national.cbssn", "CBS Sports Network (US national)", "national_linear", ["CBSSN", "CBS SPORTS NETWORK"]),
  feed("us.national.fox", "FOX (US national)", "national_linear", ["FOX"]),
  feed("us.national.fs1", "FS1 (US national)", "national_linear", ["FS1"]),
  feed("us.national.fs2", "FS2 (US national)", "national_linear", ["FS2"]),
  feed("us.national.nbc", "NBC (US national)", "national_linear", ["NBC"]),
  feed("us.national.nbcsn", "NBCSN (US national)", "national_linear", ["NBCSN"]),
  feed("us.national.usa", "USA Network (US national)", "national_linear", ["USA", "USA NETWORK"]),
  feed("us.national.tnt", "TNT (US national)", "national_linear", ["TNT"]),
  feed("us.national.tbs", "TBS (US national)", "national_linear", ["TBS"]),
  feed("us.national.trutv", "truTV (US national)", "national_linear", ["TRUTV"]),
  feed("us.national.nfl-network", "NFL Network (US national)", "national_linear", ["NFL NETWORK", "NFL NET", "NFLNET", "NFLN"]),
  feed("us.national.btn", "Big Ten Network (US national)", "national_linear", ["BTN", "BIG TEN NETWORK"]),
  feed("us.national.sec-network", "SEC Network (US national)", "national_linear", ["SEC NETWORK", "SECN"]),
  feed("us.national.acc-network", "ACC Network (US national)", "national_linear", ["ACC NETWORK", "ACCN"]),
  feed("us.national.nba-tv", "NBA TV (US national)", "national_linear", ["NBA TV", "NBATV"]),
  feed("us.national.nhl-network", "NHL Network (US national)", "national_linear", ["NHL NETWORK", "NHLNET"]),
  feed("us.national.mlb-network", "MLB Network (US national)", "national_linear", ["MLB NETWORK", "MLBN"]),
  feed("us.national.cw", "CW (US national)", "national_linear", ["CW", "THE CW"]),
  feed("us.streaming.espn-plus", "ESPN+", "streaming_exclusive", ["ESPN+"]),
  feed("us.streaming.peacock", "Peacock", "streaming_exclusive", ["PEACOCK"]),
  feed("us.streaming.prime-video", "Prime Video", "streaming_exclusive", ["PRIME VIDEO", "PRIME", "AMAZON", "AMAZON PRIME", "THURSDAY NIGHT FOOTBALL", "TNF"]),
  feed("us.streaming.netflix", "Netflix", "streaming_exclusive", ["NETFLIX"]),
  feed("us.streaming.apple-tv-plus", "Apple TV+", "streaming_exclusive", ["APPLE TV+", "APPLE TV PLUS"]),
  feed("us.streaming.dazn", "DAZN", "streaming_exclusive", ["DAZN"]),
];

function feed(
  id: string,
  label: string,
  kind: CanonicalFeed["kind"],
  tokens: string[]
): CanonicalFeed {
  return { id, label, territory: "US", variant: "national", kind, tokens };
}

const TOKEN_INDEX = new Map<string, CanonicalFeed>();
for (const item of CANONICAL_FEEDS) {
  for (const token of item.tokens) {
    if (TOKEN_INDEX.has(token)) {
      throw new Error(`Duplicate canonical feed token: ${token}`);
    }
    TOKEN_INDEX.set(token, item);
  }
}

export type FeedResolution =
  | { status: "exact"; feed: CanonicalFeed }
  | { status: "exclusive"; feed: CanonicalFeed }
  | { status: "ambiguous"; feedIds: string[] }
  | { status: "unresolved" };

export function listMappableFeeds(): CanonicalFeed[] {
  return CANONICAL_FEEDS.filter((item) => item.kind === "national_linear");
}

export function feedById(id: string): CanonicalFeed | null {
  return CANONICAL_FEEDS.find((item) => item.id === id) ?? null;
}

export function isMappableFeedId(id: string): boolean {
  const item = feedById(id);
  return item != null && item.kind === "national_linear";
}

function splitTokens(broadcast: string): string[] {
  const normalized = broadcast
    .toUpperCase()
    .replace(/\s+AND\s+/g, ",")
    .replace(/\s+/g, " ")
    .trim();
  return normalized
    .split(/[/,&;|]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function resolveCanonicalFeed(broadcast: string | null | undefined): FeedResolution {
  if (typeof broadcast !== "string" || broadcast.trim() === "") return { status: "unresolved" };
  const tokens = splitTokens(broadcast);
  if (tokens.length === 0) return { status: "unresolved" };
  const matched: CanonicalFeed[] = [];
  for (const token of tokens) {
    const item = TOKEN_INDEX.get(token);
    if (!item) return { status: "unresolved" };
    matched.push(item);
  }
  const ids = [...new Set(matched.map((item) => item.id))];
  if (ids.length !== 1) return { status: "ambiguous", feedIds: ids };
  const only = matched[0];
  if (only.kind === "streaming_exclusive") return { status: "exclusive", feed: only };
  return { status: "exact", feed: only };
}
