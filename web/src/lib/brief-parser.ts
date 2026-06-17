import Anthropic from "@anthropic-ai/sdk";

export const VALID_MOMENT_TYPES = [
  "bet_resolved", "close_game", "overtime", "spread_alert", "moneyline_alert",
  "total_alert", "prop_alert", "position_alert", "foul_trouble", "follow_alert",
  "prediction_resolved",
] as const;

export const VALID_SPORTS = ["ncaa_basketball", "nba", "nfl", "mlb"] as const;

export type ValidMomentType = typeof VALID_MOMENT_TYPES[number];
export type ValidSport = typeof VALID_SPORTS[number];

export interface ParsedBrief {
  moment_types: ValidMomentType[];
  sports: ValidSport[];
  total_budget_usd: number | null;
  daily_budget_usd: number | null;
  target_cpa_usd: number | null;
  start_date: string | null;
  end_date: string | null;
  campaign_name_hint: string | null;
  notes: string[];
}

export interface BriefPlan {
  name: string;
  moment_types: ValidMomentType[];
  sports: ValidSport[];
  recommended_bid_cpm_usd: number;
  daily_budget_usd: number;
  total_budget_usd: number;
  target_cpa_usd: number | null;
  start_date: string;
  end_date: string | null;
  estimated_impressions: number;
  estimated_conversions_low: number;
  estimated_conversions_high: number;
  interpretation_notes: string[];
  creative_required: boolean;
  creative_prompt: string;
}

export interface BriefResult {
  status: "proposed" | "created" | "insufficient";
  plan?: BriefPlan;
  campaign_id?: string;
  message?: string;
  clarifying_questions?: string[];
  confirm_instruction?: string;
}

const FLOOR_PRICES: Record<string, number> = {
  prediction_resolved: 0.60,
  overtime: 0.40,
  bet_resolved: 0.50,
  close_game: 0.35,
  spread_alert: 0.30,
  moneyline_alert: 0.30,
  total_alert: 0.25,
  prop_alert: 0.25,
  position_alert: 0.20,
  foul_trouble: 0.15,
  follow_alert: 0.10,
};

function buildExtractionPrompt(brief: string): string {
  return `You are an advertising campaign parameter extractor for NORMA, a push notification ad platform for sports bettor audiences.

Available moment types: ${VALID_MOMENT_TYPES.join(", ")}
Available sports: ${VALID_SPORTS.join(", ")}

Extract campaign parameters from this brief. Return valid JSON only, no explanation.
Omit null/empty fields. Use ISO 8601 dates (YYYY-MM-DD).

Brief: ${brief}

Return exactly this JSON structure:
{
  "moment_types": [],
  "sports": [],
  "total_budget_usd": null,
  "daily_budget_usd": null,
  "target_cpa_usd": null,
  "start_date": null,
  "end_date": null,
  "campaign_name_hint": null,
  "notes": []
}`;
}

function keywordParseBrief(brief: string): ParsedBrief {
  const moment_types: ValidMomentType[] = [];
  const sports: ValidSport[] = [];
  const notes: string[] = [];

  if (/college basketball|ncaa|march madness|college hoops/i.test(brief)) sports.push("ncaa_basketball");
  if (/\bnba\b|pro basketball/i.test(brief)) sports.push("nba");
  if (/\bnfl\b|pro football\b/i.test(brief)) sports.push("nfl");
  if (/\bmlb\b|baseball/i.test(brief)) sports.push("mlb");
  if (/soccer|hockey|tennis|cricket|rugby/i.test(brief)) {
    notes.push("Unsupported sport detected and omitted — NORMA covers ncaa_basketball, nba, nfl, mlb only");
  }

  if (/close.?game|nail.?bit|last.?minut|final.?minut/i.test(brief)) moment_types.push("close_game");
  if (/overtime|\bOT\b/i.test(brief)) moment_types.push("overtime");
  if (/bet.{0,15}(resolv|settl)|wager.{0,15}settl|(resolv|settl).{0,15}(bet|wager)/i.test(brief)) moment_types.push("bet_resolved");
  if (/spread/i.test(brief)) moment_types.push("spread_alert");
  if (/moneyline|money.?line/i.test(brief)) moment_types.push("moneyline_alert");
  if (/over.?under|\btotal\b/i.test(brief)) moment_types.push("total_alert");
  if (/\bprop\b|player.?prop/i.test(brief)) moment_types.push("prop_alert");
  if (/prediction.?market|kalshi|polymarket/i.test(brief)) moment_types.push("prediction_resolved");
  if (/foul.?trouble|4th.?foul|fifth.?foul/i.test(brief)) moment_types.push("foul_trouble");

  const budgetMatch =
    brief.match(/\$\s*([0-9,]+(?:\.[0-9]+)?)\s*(?:budget|total|cap)?(?!\s*cpa)/i) ||
    brief.match(/([0-9,]+)\s*(?:dollar|usd)\b/i);
  const total_budget_usd = budgetMatch ? parseFloat(budgetMatch[1].replace(/,/g, "")) : null;

  const cpaMatch =
    brief.match(/\$\s*([0-9.]+)\s*cpa/i) ||
    brief.match(/cpa.{0,10}\$\s*([0-9.]+)/i) ||
    brief.match(/(?:cost.{0,10}(?:per|\/)\s*(?:install|acquisition)).{0,10}\$\s*([0-9.]+)/i);
  const target_cpa_usd = cpaMatch ? parseFloat(cpaMatch[1]) : null;

  const today = new Date();
  let start_date: string | null = null;
  let end_date: string | null = null;

  const isoDateMatch = brief.match(/(\d{4}-\d{2}-\d{2})/g);
  if (isoDateMatch && isoDateMatch.length >= 2) {
    start_date = isoDateMatch[0];
    end_date = isoDateMatch[1];
  } else if (isoDateMatch && isoDateMatch.length === 1) {
    start_date = isoDateMatch[0];
  } else if (/this weekend/i.test(brief)) {
    const day = today.getDay();
    const daysToFriday = ((5 - day + 7) % 7) || 7;
    const friday = new Date(today.getTime() + daysToFriday * 86400000);
    const sunday = new Date(friday.getTime() + 2 * 86400000);
    start_date = friday.toISOString().split("T")[0];
    end_date = sunday.toISOString().split("T")[0];
    notes.push("'This weekend' interpreted as the upcoming Friday–Sunday");
  } else if (/next week/i.test(brief)) {
    const daysToMonday = ((8 - today.getDay()) % 7) || 7;
    const monday = new Date(today.getTime() + daysToMonday * 86400000);
    const sunday = new Date(monday.getTime() + 6 * 86400000);
    start_date = monday.toISOString().split("T")[0];
    end_date = sunday.toISOString().split("T")[0];
    notes.push("'Next week' interpreted as Monday–Sunday of next week");
  }

  return { moment_types, sports, total_budget_usd, daily_budget_usd: null, target_cpa_usd, start_date, end_date, campaign_name_hint: null, notes };
}

async function llmParseBrief(brief: string): Promise<ParsedBrief> {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{ role: "user", content: buildExtractionPrompt(brief) }],
  });
  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("LLM returned non-JSON");

  const raw = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  const moment_types = ((raw.moment_types as string[]) ?? []).filter(
    (m): m is ValidMomentType => (VALID_MOMENT_TYPES as readonly string[]).includes(m)
  );
  const sports = ((raw.sports as string[]) ?? []).filter(
    (s): s is ValidSport => (VALID_SPORTS as readonly string[]).includes(s)
  );
  return {
    moment_types,
    sports,
    total_budget_usd: typeof raw.total_budget_usd === "number" ? raw.total_budget_usd : null,
    daily_budget_usd: typeof raw.daily_budget_usd === "number" ? raw.daily_budget_usd : null,
    target_cpa_usd: typeof raw.target_cpa_usd === "number" ? raw.target_cpa_usd : null,
    start_date: typeof raw.start_date === "string" ? raw.start_date : null,
    end_date: typeof raw.end_date === "string" ? raw.end_date : null,
    campaign_name_hint: typeof raw.campaign_name_hint === "string" ? raw.campaign_name_hint : null,
    notes: (raw.notes as string[]) ?? [],
  };
}

export async function parseBrief(brief: string): Promise<ParsedBrief> {
  if (process.env.ANTHROPIC_API_KEY) {
    try { return await llmParseBrief(brief); } catch { /* fall through */ }
  }
  return keywordParseBrief(brief);
}

export function buildPlan(
  parsed: ParsedBrief,
  budgetOverride?: number,
  startDateOverride?: string,
  endDateOverride?: string
): BriefPlan | null {
  const total_budget_usd = budgetOverride ?? parsed.total_budget_usd;
  if (!total_budget_usd || parsed.moment_types.length === 0 || parsed.sports.length === 0) return null;

  const maxFloor = Math.max(...parsed.moment_types.map((m) => FLOOR_PRICES[m] ?? 0.25));
  const recommended_bid_cpm_usd = Math.round(maxFloor * 1.35 * 100) / 100;
  const daily_budget_usd = parsed.daily_budget_usd ?? Math.round((total_budget_usd / 7) * 100) / 100;

  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const start_date = startDateOverride ?? parsed.start_date ?? tomorrow;
  const end_date = endDateOverride ?? parsed.end_date ?? null;

  const estimated_impressions = Math.round((total_budget_usd / recommended_bid_cpm_usd) * 1000);
  const estimated_conversions_low = Math.round(estimated_impressions * 0.0005);
  const estimated_conversions_high = Math.round(estimated_impressions * 0.001);

  const momentLabel = parsed.moment_types.slice(0, 2).map((m) => m.replace(/_/g, " ")).join(", ");
  const sportLabel = parsed.sports[0].replace(/_/g, " ");
  const name = parsed.campaign_name_hint ?? `Campaign — ${sportLabel} ${momentLabel}`;

  const notes = [...parsed.notes];
  if (!parsed.start_date && !startDateOverride) notes.push("No start date specified — defaulting to tomorrow");

  return {
    name,
    moment_types: parsed.moment_types,
    sports: parsed.sports,
    recommended_bid_cpm_usd,
    daily_budget_usd,
    total_budget_usd,
    target_cpa_usd: parsed.target_cpa_usd,
    start_date,
    end_date,
    estimated_impressions,
    estimated_conversions_low,
    estimated_conversions_high,
    interpretation_notes: notes,
    creative_required: true,
    creative_prompt:
      "Please provide a creative with headline (max 60 chars), body (max 120 chars), icon_url (HTTPS), and action_url before executing.",
  };
}

export function getClarifyingQuestions(parsed: ParsedBrief): string[] {
  const qs: string[] = [];
  if (parsed.sports.length === 0) qs.push("Which sports should the campaign target? (ncaa_basketball, nba, nfl, mlb)");
  if (parsed.moment_types.length === 0) qs.push("Which moment types are most relevant? (e.g., close_game, bet_resolved, overtime)");
  if (!parsed.total_budget_usd) qs.push("What is your total campaign budget in USD?");
  return qs;
}
