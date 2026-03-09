// email-parser.ts — Parse sportsbook bet confirmation emails into NormalizedWager objects
//
// Priority:
//   1. Identify sportsbook from sender domain
//   2. Apply per-sportsbook regex parser for known email formats
//   3. Fall back to Claude Sonnet if regex extraction yields nothing
//
// Returns an array because confirmation emails sometimes include parlays
// with multiple legs listed as separate wagers, or multiple individual bets.

import type { NormalizedWager } from "./bet-ingestor.ts";

// ---------------------------------------------------------------------------
// Sportsbook detection from sender email address
// ---------------------------------------------------------------------------

const SPORTSBOOK_DOMAINS: Record<string, string> = {
  "draftkings.com":  "draftkings",
  "fanduel.com":     "fanduel",
  "betmgm.com":      "betmgm",
  "caesars.com":     "caesars",
  "williamhill.com": "caesars",     // Caesars acquired WH US
  "pointsbet.com":   "pointsbet",
  "espnbet.com":     "espnbet",
  "barstoolsports.com": "barstool",
  "betrivers.com":   "betrivers",
  "draftkings-noreply.com": "draftkings",
};

export function detectSportsbook(fromAddress: string): string | null {
  const lower = fromAddress.toLowerCase();
  for (const [domain, key] of Object.entries(SPORTSBOOK_DOMAINS)) {
    if (lower.includes(domain)) return key;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-sportsbook regex parsers
// ---------------------------------------------------------------------------

interface ParsedLeg {
  description: string;
  market_type: string;
  team_name?: string;
  line?: number;
  odds?: string;
}

interface EmailParseResult {
  external_bet_id?: string;
  wager_type: string;     // spread | moneyline | over_under | prop | parlay | futures
  market_type: string;
  description: string;
  team_name?: string;
  line?: number;
  odds?: string;
  stake?: number;
  potential_payout?: number;
  placed_at?: string;
  legs?: ParsedLeg[];
}

// ---- DraftKings ----
// Subject: "Your bet has been confirmed — Bet ID: XXXXXXXX"
// Body includes: "Selection: Duke Blue Devils -3.5 (-110)"
//                "Stake: $25.00" "Potential payout: $47.73"

function parseDraftKings(subject: string, body: string): EmailParseResult | null {
  const betIdMatch = body.match(/Bet(?:\s+ID)?[:\s#]+([A-Z0-9\-]+)/i) ||
                     subject.match(/Bet(?:\s+ID)?[:\s#]+([A-Z0-9\-]+)/i);
  const external_bet_id = betIdMatch?.[1];

  const stakeMatch = body.match(/(?:Stake|Wager)[:\s]+\$?([\d,]+\.?\d*)/i);
  const stake = stakeMatch ? parseFloat(stakeMatch[1].replace(",", "")) : undefined;

  const payoutMatch = body.match(/(?:Potential\s+)?(?:Payout|Return|Winnings)[:\s]+\$?([\d,]+\.?\d*)/i);
  const potential_payout = payoutMatch ? parseFloat(payoutMatch[1].replace(",", "")) : undefined;

  // Parlay detection
  if (/parlay/i.test(subject) || /parlay/i.test(body.slice(0, 500))) {
    const legPattern = /([A-Z][^:]+?)\s+([-+]\d+(?:\.\d+)?)\s+\(([-+]\d+)\)/g;
    const legs: ParsedLeg[] = [];
    let m: RegExpExecArray | null;
    while ((m = legPattern.exec(body)) !== null) {
      legs.push({
        description: `${m[1].trim()} ${m[2]}`,
        market_type:  detectMarketType(m[1]),
        team_name:    extractTeamName(m[1]),
        line:         parseFloat(m[2]),
        odds:         m[3],
      });
    }
    if (legs.length > 0) {
      return { external_bet_id, wager_type: "parlay", market_type: "parlay",
               description: `Parlay (${legs.length} legs)`, stake, potential_payout, legs };
    }
  }

  // Single-leg
  const selectionMatch = body.match(/Selection[:\s]+([^\n\r]+)/i);
  if (!selectionMatch) return null;

  const selectionText = selectionMatch[1].trim();
  const oddsMatch     = selectionText.match(/\(([-+]\d+)\)/) || body.match(/Odds?[:\s]+([-+]\d+)/i);
  const lineMatch     = selectionText.match(/([-+]\d+\.?\d*)\s*(?:\([-+]\d+\))?$/);

  return {
    external_bet_id,
    wager_type:       detectMarketType(selectionText),
    market_type:      detectMarketType(selectionText),
    description:      selectionText,
    team_name:        extractTeamName(selectionText),
    line:             lineMatch ? parseFloat(lineMatch[1]) : undefined,
    odds:             oddsMatch?.[1],
    stake,
    potential_payout,
  };
}

// ---- FanDuel ----
// Subject: "Bet Confirmed: [description]"
// Body: "Your Bet: [desc]" "Odds: -110" "Stake: $25" "To Win: $22.73"

function parseFanDuel(subject: string, body: string): EmailParseResult | null {
  const betIdMatch = body.match(/(?:Bet\s+ID|Reference)[:\s#]+([A-Z0-9\-]+)/i);
  const external_bet_id = betIdMatch?.[1];

  const stakeMatch = body.match(/(?:Stake|Amount\s+Wagered)[:\s]+\$?([\d,]+\.?\d*)/i);
  const stake = stakeMatch ? parseFloat(stakeMatch[1].replace(",", "")) : undefined;

  const toWinMatch = body.match(/(?:To\s+Win|Potential\s+Payout)[:\s]+\$?([\d,]+\.?\d*)/i);
  const potential_payout = toWinMatch
    ? (stake ?? 0) + parseFloat(toWinMatch[1].replace(",", ""))
    : undefined;

  if (/parlay/i.test(subject)) {
    const legs: ParsedLeg[] = [];
    const legPattern = /(\d+\.\s*)?([A-Z][^\n]+?)\s*\n\s*([-+]\d+(?:\.\d+)?)/gm;
    let m: RegExpExecArray | null;
    while ((m = legPattern.exec(body)) !== null) {
      legs.push({
        description: m[2].trim(),
        market_type:  detectMarketType(m[2]),
        team_name:    extractTeamName(m[2]),
        odds:         m[3],
      });
    }
    if (legs.length > 0) {
      return { external_bet_id, wager_type: "parlay", market_type: "parlay",
               description: `Parlay (${legs.length} legs)`, stake, potential_payout, legs };
    }
  }

  const betDescMatch = body.match(/(?:Your\s+Bet|Selection)[:\s]+([^\n\r]+)/i) ||
                       [null, subject.replace(/^Bet Confirmed:\s*/i, "").trim()];
  const desc  = betDescMatch?.[1]?.trim() ?? "";
  const odds  = body.match(/Odds?[:\s]+([-+]\d+)/i)?.[1];
  const lm    = desc.match(/([-+]\d+\.?\d*)\s*$/);

  return {
    external_bet_id,
    wager_type:   detectMarketType(desc),
    market_type:  detectMarketType(desc),
    description:  desc,
    team_name:    extractTeamName(desc),
    line:         lm ? parseFloat(lm[1]) : undefined,
    odds,
    stake,
    potential_payout,
  };
}

// ---- BetMGM ----

function parseBetMGM(subject: string, body: string): EmailParseResult | null {
  const betIdMatch = body.match(/(?:Bet\s+Reference|Confirmation)[:\s#]+([A-Z0-9\-]+)/i);
  const stakeMatch = body.match(/(?:Stake)[:\s]+\$?([\d,]+\.?\d*)/i);
  const payoutMatch = body.match(/(?:Potential\s+Return|Payout)[:\s]+\$?([\d,]+\.?\d*)/i);

  const stake          = stakeMatch  ? parseFloat(stakeMatch[1].replace(",", ""))  : undefined;
  const potential_payout = payoutMatch ? parseFloat(payoutMatch[1].replace(",", "")) : undefined;

  const descMatch = body.match(/(?:Selection|Market)[:\s]+([^\n\r]+)/i) ||
                    [null, subject.trim()];
  const desc = descMatch?.[1]?.trim() ?? "";
  const odds = body.match(/(?:Odds?|Price)[:\s]+([-+]\d+)/i)?.[1];

  return {
    external_bet_id: betIdMatch?.[1],
    wager_type:      detectMarketType(desc),
    market_type:     detectMarketType(desc),
    description:     desc,
    team_name:       extractTeamName(desc),
    odds,
    stake,
    potential_payout,
  };
}

// ---- Caesars ----

function parseCaesars(subject: string, body: string): EmailParseResult | null {
  const betIdMatch = body.match(/(?:Wager\s+ID|Bet\s+#)[:\s#]+([A-Z0-9\-]+)/i);
  const stakeMatch = body.match(/(?:Total\s+Stake|Stake|Wager)[:\s]+\$?([\d,]+\.?\d*)/i);
  const payoutMatch = body.match(/(?:Max\s+Payout|Potential\s+Win)[:\s]+\$?([\d,]+\.?\d*)/i);

  const stake          = stakeMatch  ? parseFloat(stakeMatch[1].replace(",", ""))  : undefined;
  const potential_payout = payoutMatch ? parseFloat(payoutMatch[1].replace(",", "")) : undefined;

  const descMatch = body.match(/(?:Selection|Pick)[:\s]+([^\n\r]+)/i) ||
                    [null, subject.trim()];
  const desc = descMatch?.[1]?.trim() ?? "";

  return {
    external_bet_id: betIdMatch?.[1],
    wager_type:      detectMarketType(desc),
    market_type:     detectMarketType(desc),
    description:     desc,
    team_name:       extractTeamName(desc),
    odds:            body.match(/(?:Odds?)[:\s]+([-+]\d+)/i)?.[1],
    stake,
    potential_payout,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectMarketType(text: string): string {
  const t = text.toLowerCase();
  if (/parlay/i.test(t))                                     return "parlay";
  if (/over|under|o\/u|total/i.test(t))                     return "total";
  if (/moneyline|ml\b/i.test(t))                            return "moneyline";
  if (/prop|player|assists|points|rebounds|yards/i.test(t)) return "player_prop";
  if (/futures?|to\s+win/i.test(t))                         return "futures";
  if (/[-+]\d+\.5|\bspread\b/i.test(t))                     return "spread";
  return "spread"; // default
}

function extractTeamName(text: string): string | undefined {
  // Remove common suffixes like "-3.5 (-110)" and return the team-ish portion
  const clean = text
    .replace(/\s*[-+]\d+\.?\d*\s*\([-+]\d+\)\s*$/, "")
    .replace(/\s*\([-+]\d+\)\s*$/, "")
    .trim();
  // Return if it looks like a team name (not purely numeric/symbols)
  return /[A-Za-z]{3}/.test(clean) ? clean : undefined;
}

// ---------------------------------------------------------------------------
// Claude fallback parser
// ---------------------------------------------------------------------------

async function parseWithClaude(
  subject: string,
  body: string,
  sportsbook: string | null,
): Promise<EmailParseResult[]> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return [];

  const prompt = `You are parsing a sportsbook bet confirmation email.
Sportsbook (if known): ${sportsbook ?? "unknown"}
Subject: ${subject}
Body (first 1500 chars): ${body.slice(0, 1500)}

Extract all bets from this email. Return a JSON array where each element has:
{
  "description": "full bet description",
  "wager_type": "spread|moneyline|total|player_prop|parlay|futures",
  "market_type": "spread|moneyline|total|player_prop|parlay|futures",
  "team_name": "team name if applicable or null",
  "line": numeric line value or null,
  "odds": american odds string like "-110" or "+150" or null,
  "stake": numeric stake amount or null,
  "potential_payout": numeric total payout or null,
  "external_bet_id": "bet ID from email or null",
  "legs": [] // for parlays: array of {description, market_type, team_name, line, odds}
}

Return ONLY valid JSON array. No explanation.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":    "application/json",
      "x-api-key":       anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-sonnet-4-6",
      max_tokens: 1024,
      messages:   [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) return [];

  const data = await res.json();
  const text = data?.content?.[0]?.text ?? "";

  try {
    const parsed = JSON.parse(text.trim());
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function parseEmailWagers(
  fromAddress: string,
  subject: string,
  body: string,
): Promise<NormalizedWager[]> {
  const sportsbook = detectSportsbook(fromAddress);

  // Try per-sportsbook regex parser first
  let results: EmailParseResult[] = [];

  if (sportsbook) {
    const raw = (() => {
      switch (sportsbook) {
        case "draftkings": return parseDraftKings(subject, body);
        case "fanduel":    return parseFanDuel(subject, body);
        case "betmgm":     return parseBetMGM(subject, body);
        case "caesars":    return parseCaesars(subject, body);
        default:           return null;
      }
    })();

    if (raw) results = [raw];
  }

  // Fall back to Claude if regex yielded nothing
  if (results.length === 0 || !results[0].description) {
    results = await parseWithClaude(subject, body, sportsbook);
  }

  // Convert to NormalizedWager[]
  return results
    .filter((r) => r.description)
    .map((r): NormalizedWager => ({
      external_bet_id: r.external_bet_id ?? `email-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      provider_key:    sportsbook ?? "unknown",
      description:     r.description,
      wager_type:      r.wager_type,
      market_type:     r.market_type,
      team_name:       r.team_name,
      line:            r.line,
      odds:            r.odds,
      stake:           r.stake,
      potential_payout: r.potential_payout,
      legs:            r.legs,
    }));
}
