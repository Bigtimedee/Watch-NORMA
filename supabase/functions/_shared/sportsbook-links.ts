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
  game_id?: string;
}

export interface AffiliateConfig {
  affiliate_id: string;
  referral_code: string;
  attribution_window_minutes: number;
  postback_url?: string;
}

// --- Provider Deep Link Templates ---

interface ProviderTemplate {
  native_scheme: (gameSlug: string) => string;
  universal_link: (gameSlug: string) => string;
  web_fallback: string;
  affiliate_param_key: string;
}

const PROVIDER_TEMPLATES: Record<string, ProviderTemplate> = {
  draftkings: {
    native_scheme: (slug) => `draftkings://sportsbook/ncaab/game/${slug}`,
    universal_link: (slug) =>
      `https://sportsbook.draftkings.com/event/${slug}`,
    web_fallback: "https://www.draftkings.com",
    affiliate_param_key: "ref",
  },
  fanduel: {
    native_scheme: (slug) => `fanduel://sportsbook/ncaab/${slug}`,
    universal_link: (slug) =>
      `https://sportsbook.fanduel.com/college-basketball/${slug}`,
    web_fallback: "https://www.fanduel.com",
    affiliate_param_key: "btag",
  },
  betmgm: {
    native_scheme: (slug) => `betmgm://sports/ncaab/${slug}`,
    universal_link: (slug) =>
      `https://sports.betmgm.com/en/sports/basketball/college/${slug}`,
    web_fallback: "https://sports.betmgm.com",
    affiliate_param_key: "wm",
  },
  caesars: {
    native_scheme: (slug) => `caesarssportsbook://sports/ncaab/${slug}`,
    universal_link: (slug) =>
      `https://www.caesars.com/sportsbook-and-casino/college-basketball/${slug}`,
    web_fallback: "https://www.caesars.com/sportsbook-and-casino",
    affiliate_param_key: "pid",
  },
  espnbet: {
    native_scheme: (slug) => `espnbet://sportsbook/ncaab/${slug}`,
    universal_link: (slug) => `https://espnbet.com/sport/basketball/${slug}`,
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
    native_scheme: template.native_scheme(gameSlug),
    universal_link: template.universal_link(gameSlug) + affiliateParams,
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
