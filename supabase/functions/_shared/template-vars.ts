// NORMA Advertising -- Template Variable Interpolation
// Replaces {variable_name} placeholders in creative sponsor_text
// with personalized values from the user/position context.

// --- Types ---

export interface PersonalizationContext {
  user_first_name?: string;
  team_name?: string;
  team_abbr?: string;
  payout_amount?: string; // pre-formatted: "$50.00"
  platform?: string;
  market_title?: string;
}

/** All supported variable names. Must stay in sync with validate_template_vars() in Postgres. */
const KNOWN_VARS: ReadonlySet<string> = new Set([
  "user_first_name",
  "team_name",
  "team_abbr",
  "payout_amount",
  "platform",
  "market_title",
]);

// --- Interpolation ---

/**
 * Replace `{variable_name}` placeholders in a template string with values
 * from the personalization context.
 *
 * Rules:
 * - Only known variable names are replaced (see KNOWN_VARS).
 * - If a variable is present in the template but missing/undefined in ctx,
 *   the placeholder is left as-is so the copy still reads (albeit generically).
 * - Null or empty template returns empty string.
 * - Null or undefined ctx returns the template unchanged.
 */
export function interpolateTemplate(
  template: string | null | undefined,
  ctx: PersonalizationContext | null | undefined
): string {
  if (!template) return "";
  if (!ctx) return template;

  // Match {word_chars} patterns. Replace only if the variable name is known
  // AND the context provides a non-empty value.
  return template.replace(/\{([a-z_]+)\}/g, (match, varName: string) => {
    if (!KNOWN_VARS.has(varName)) {
      // Unknown variable -- leave placeholder intact
      return match;
    }

    const value = (ctx as Record<string, string | undefined>)[varName];
    if (value === undefined || value === null || value === "") {
      // Known variable but no value provided -- leave placeholder
      return match;
    }

    return value;
  });
}

// --- Context Builder ---

/**
 * Build a PersonalizationContext from the data available in evaluate-alerts.
 *
 * @param displayName  profiles.display_name (may be full name or email)
 * @param positions    The user's prediction_positions for this game (settled ones)
 * @param gameState    The game object with team joins
 */
export function buildPersonalizationContext(
  displayName: string | null | undefined,
  positions: Array<{
    platform?: string;
    market_title?: string;
    position_side?: string;
    payout_amount?: number | null;
  }>,
  gameState: {
    home_score?: number;
    away_score?: number;
    home_team?: { name?: string; abbreviation?: string } | null;
    away_team?: { name?: string; abbreviation?: string } | null;
  }
): PersonalizationContext {
  const ctx: PersonalizationContext = {};

  // --- user_first_name ---
  // profiles.display_name is set from auth.users.raw_user_meta_data->>'full_name'
  // or falls back to the user's email. Extract first name heuristically.
  if (displayName) {
    const firstName = extractFirstName(displayName);
    if (firstName) {
      ctx.user_first_name = firstName;
    }
  }

  // --- Position-derived fields ---
  // Use the first settled position with a payout (most relevant for sponsor copy).
  const settledWithPayout = positions.find(
    (p) => p.payout_amount != null && p.payout_amount > 0
  );
  const anyPosition = settledWithPayout ?? positions[0];

  if (anyPosition) {
    if (anyPosition.platform) {
      // Capitalize: "kalshi" -> "Kalshi"
      ctx.platform =
        anyPosition.platform.charAt(0).toUpperCase() +
        anyPosition.platform.slice(1).toLowerCase();
    }
    if (anyPosition.market_title) {
      ctx.market_title = anyPosition.market_title;
    }
  }

  if (settledWithPayout?.payout_amount != null) {
    ctx.payout_amount = formatCurrency(settledWithPayout.payout_amount);
  }

  // --- Team-derived fields ---
  // Determine the "winning" team from the final score. For in-progress games,
  // use the leading team. If tied or no score data, skip.
  const home = gameState.home_score ?? 0;
  const away = gameState.away_score ?? 0;
  const winningTeam =
    home > away
      ? gameState.home_team
      : away > home
        ? gameState.away_team
        : null;

  if (winningTeam) {
    if (winningTeam.name) ctx.team_name = winningTeam.name;
    if (winningTeam.abbreviation)
      ctx.team_abbr = winningTeam.abbreviation.toUpperCase();
  }

  return ctx;
}

// --- Helpers ---

/**
 * Extract a first name from a display name string.
 * Handles: "Dave Smith" -> "Dave", "dave@example.com" -> null (not a name),
 * "Dave" -> "Dave", "" -> null
 */
function extractFirstName(displayName: string): string | null {
  const trimmed = displayName.trim();
  if (!trimmed) return null;

  // If it looks like an email, we cannot extract a name
  if (trimmed.includes("@")) return null;

  // Take the first word, capitalize it
  const firstWord = trimmed.split(/\s+/)[0];
  if (!firstWord || firstWord.length < 2) return null;

  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
}

/**
 * Format a numeric amount as US currency: 50 -> "$50", 50.5 -> "$50.50"
 * Omits cents when the amount is a whole number for cleaner copy.
 */
function formatCurrency(amount: number): string {
  if (Number.isInteger(amount)) {
    return `$${amount}`;
  }
  return `$${amount.toFixed(2)}`;
}
