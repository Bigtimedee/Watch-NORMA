// NORMA Advertising — Sportsbook Deep Links
// Game-contextual deep link builder, affiliate attribution

// --- Types ---

export interface SportsbookDeepLink {
  provider_key: string;
  native_scheme: string;
  universal_link: string;
  web_fallback: string;
  affiliate_params: string;
}

export interface GameContext {
  home_team: string;
  away_team: string;
  scheduled_at: string;
  /** NORMA sport key: ncaam | nba | mlb | ncaaf | nfl. Determines which
   *  league-specific path the deep link routes to. Defaults to ncaam
   *  when omitted so pre-existing callers stay on their prior behavior. */
  sport?: string;
  game_id?: string;
}

export interface AffiliateConfig {
  affiliate_id: string;
  referral_code: string;
  attribution_window_minutes: number;
  postback_url?: string;
}

// --- Sport → per-book URL segments ---
//
// Every sportsbook exposes a different path per league. Basketball-only
// hardcoding routed "Bet Now" on football games to the college-basketball
// section (BL-6 in the 2026-08-23 audit). Segments below were verified
// against each book's public URL structure as of 2026-08-23.
//
// Fields:
//   dk / fd / mgm_web / mgm_scheme / cae — league identifiers used in each
//   book's URLs. espn_scheme mirrors DraftKings' league keys; espn_web
//   uses the umbrella sport (basketball/football/baseball) because ESPN
//   BET's game routes live under /sport/{umbrella}/.

interface SportPaths {
  dk: string;         // DraftKings scheme + web path
  fd: string;         // FanDuel league slug
  mgm_web: string;    // BetMGM web sport/league combo
  mgm_scheme: string; // BetMGM native scheme league key
  cae: string;        // Caesars web + scheme league slug
  espn_scheme: string;
  espn_web: string;
}

const SPORT_PATHS: Record<string, SportPaths> = {
  ncaam: {
    dk: "ncaab",
    fd: "college-basketball",
    mgm_web: "basketball/college",
    mgm_scheme: "ncaab",
    cae: "college-basketball",
    espn_scheme: "ncaab",
    espn_web: "basketball",
  },
  nba: {
    dk: "nba",
    fd: "nba",
    mgm_web: "basketball/nba",
    mgm_scheme: "nba",
    cae: "nba",
    espn_scheme: "nba",
    espn_web: "basketball",
  },
  ncaaf: {
    dk: "cfb",
    fd: "college-football",
    mgm_web: "football/college",
    mgm_scheme: "cfb",
    cae: "college-football",
    espn_scheme: "cfb",
    espn_web: "football",
  },
  nfl: {
    dk: "nfl",
    fd: "nfl",
    mgm_web: "football/nfl",
    mgm_scheme: "nfl",
    cae: "nfl",
    espn_scheme: "nfl",
    espn_web: "football",
  },
  mlb: {
    dk: "mlb",
    fd: "mlb",
    mgm_web: "baseball/mlb",
    mgm_scheme: "mlb",
    cae: "mlb",
    espn_scheme: "mlb",
    espn_web: "baseball",
  },
};

function sportPaths(sport: string | undefined): SportPaths {
  return SPORT_PATHS[sport ?? "ncaam"] ?? SPORT_PATHS.ncaam;
}

// --- Provider Deep Link Templates ---

interface ProviderTemplate {
  native_scheme: (gameSlug: string, p: SportPaths) => string;
  universal_link: (gameSlug: string, p: SportPaths) => string;
  web_fallback: string;
  affiliate_param_key: string;
}

const PROVIDER_TEMPLATES: Record<string, ProviderTemplate> = {
  draftkings: {
    native_scheme: (slug, p) => `draftkings://sportsbook/${p.dk}/game/${slug}`,
    universal_link: (slug, p) =>
      `https://sportsbook.draftkings.com/leagues/${p.dk}/event/${slug}`,
    web_fallback: "https://www.draftkings.com",
    affiliate_param_key: "ref",
  },
  fanduel: {
    native_scheme: (slug, p) => `fanduel://sportsbook/${p.fd}/${slug}`,
    universal_link: (slug, p) =>
      `https://sportsbook.fanduel.com/${p.fd}/${slug}`,
    web_fallback: "https://www.fanduel.com",
    affiliate_param_key: "btag",
  },
  betmgm: {
    native_scheme: (slug, p) => `betmgm://sports/${p.mgm_scheme}/${slug}`,
    universal_link: (slug, p) =>
      `https://sports.betmgm.com/en/sports/${p.mgm_web}/${slug}`,
    web_fallback: "https://sports.betmgm.com",
    affiliate_param_key: "wm",
  },
  caesars: {
    native_scheme: (slug, p) => `caesarssportsbook://sports/${p.cae}/${slug}`,
    universal_link: (slug, p) =>
      `https://www.caesars.com/sportsbook-and-casino/${p.cae}/${slug}`,
    web_fallback: "https://www.caesars.com/sportsbook-and-casino",
    affiliate_param_key: "pid",
  },
  espnbet: {
    native_scheme: (slug, p) => `espnbet://sportsbook/${p.espn_scheme}/${slug}`,
    universal_link: (slug, p) => `https://espnbet.com/sport/${p.espn_web}/${slug}`,
    web_fallback: "https://espnbet.com",
    affiliate_param_key: "aff",
  },
};

// --- Build Deep Link ---

export function buildSportsbookLink(
  providerKey: string,
  game: GameContext,
  campaignId: number,
  affiliate?: AffiliateConfig
): SportsbookDeepLink {
  const template = PROVIDER_TEMPLATES[providerKey];
  const gameSlug = buildGameSlug(game);
  const paths = sportPaths(game.sport);

  if (!template) {
    // Fallback for unknown providers
    return {
      provider_key: providerKey,
      native_scheme: "",
      universal_link: "",
      web_fallback: "",
      affiliate_params: "",
    };
  }

  // Build affiliate params
  let affiliateParams = `?${template.affiliate_param_key}=NORMA&campaign=${campaignId}`;
  if (affiliate) {
    affiliateParams += `&aff_id=${affiliate.affiliate_id}`;
    if (affiliate.referral_code) {
      affiliateParams += `&promo=${affiliate.referral_code}`;
    }
  }

  return {
    provider_key: providerKey,
    native_scheme: template.native_scheme(gameSlug, paths),
    universal_link: template.universal_link(gameSlug, paths) + affiliateParams,
    web_fallback: template.web_fallback + affiliateParams,
    affiliate_params: affiliateParams,
  };
}

function buildGameSlug(game: GameContext): string {
  const home = game.home_team.toLowerCase().replace(/\s+/g, "-");
  const away = game.away_team.toLowerCase().replace(/\s+/g, "-");
  return `${away}-at-${home}`;
}

// --- Brand Colors ---

export const SPORTSBOOK_BRAND_COLORS: Record<
  string,
  { primary: string; text: string }
> = {
  draftkings: { primary: "#53D337", text: "#000000" },
  fanduel: { primary: "#1493FF", text: "#FFFFFF" },
  betmgm: { primary: "#BFA15C", text: "#000000" },
  caesars: { primary: "#1B4D3E", text: "#FFFFFF" },
  espnbet: { primary: "#FF4438", text: "#FFFFFF" },
};

// --- Sportsbook Display Names ---

export const SPORTSBOOK_DISPLAY_NAMES: Record<string, string> = {
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  betmgm: "BetMGM",
  caesars: "Caesars",
  espnbet: "ESPN BET",
};

// --- Extract affiliate config from campaign targeting_rules ---

export function extractAffiliateConfig(
  targetingRules: Record<string, unknown>
): AffiliateConfig | undefined {
  const config = targetingRules?.affiliate_config as
    | Record<string, unknown>
    | undefined;
  if (!config) return undefined;

  return {
    affiliate_id: (config.affiliate_id as string) ?? "",
    referral_code: (config.referral_code as string) ?? "",
    attribution_window_minutes:
      (config.attribution_window_minutes as number) ?? 5,
    postback_url: config.postback_url as string | undefined,
  };
}

// --- Check if a CTA URL points to a sportsbook ---

export function isSportsbookUrl(url: string): string | null {
  for (const [key, template] of Object.entries(PROVIDER_TEMPLATES)) {
    if (url.includes(key) || url.includes(template.web_fallback)) {
      return key;
    }
  }
  return null;
}
