export interface CreativeForReview {
  sponsor_text: string;
  cta_text: string | null;
  cta_url: string | null;
  demand_type: string | null;
}

export interface PrescreenResult {
  verdict: "pass" | "flag";
  reasons: string[];
}

const DEMAND_TYPE_RULES: Record<string, string> = {
  sportsbook:
    "The ad is from a sportsbook. Flag if it uses 'risk-free', 'guaranteed', or 'sure thing' without proper disclosures. Flag if it lacks responsible gambling language expectations (e.g., no suggestion to seek help or set limits). Flag if it promotes excessive gambling.",
  streaming:
    "The ad is from a streaming service. Flag if it implies sports betting outcomes or guaranteed wins. Flag if it promotes content that is not available on the advertiser's platform.",
  commerce:
    "The ad is from a commerce brand (merchandise, ticketing, apparel). Flag if it makes performance or outcome claims for sports teams or players.",
};

export function buildPrescreenPrompt(creative: CreativeForReview): string {
  const demandRule =
    DEMAND_TYPE_RULES[creative.demand_type ?? ""] ??
    "Flag if the ad content does not match the stated category.";

  return `You are a sports advertising compliance reviewer for Watch NORMA, a sports alert app.

Review this ad creative and determine whether it passes or should be flagged for manual review.

--- CREATIVE ---
Sponsor text: ${creative.sponsor_text}
CTA text: ${creative.cta_text ?? "(none)"}
CTA URL: ${creative.cta_url ?? "(none)"}
Demand type: ${creative.demand_type ?? "unknown"}

--- RUBRIC ---
Flag the creative if ANY of these conditions are true:
1. Misleading claims: Contains false or unverifiable statements (e.g., "best odds," "most accurate predictions," "highest returns" without data).
2. Guaranteed-win language: Uses "guaranteed," "sure thing," "can't lose," "always wins," or similar.
3. Betting advice: Gives direct betting recommendations ("bet on the Chiefs," "take the over").
4. Age-inappropriate: Could appeal to minors or does not assume an adult audience.
5. Unsupported superlatives: Uses "best," "#1," "only," "exclusive" without verifiable basis.
6. Deceptive urgency: Uses false countdown or scarcity claims.
7. Category mismatch: Ad content clearly does not match the demand type.
${demandRule}

--- RESPONSE FORMAT ---
Return only valid JSON. No other text.

{
  "verdict": "pass" | "flag",
  "reasons": ["reason 1", "reason 2"]
}

"reasons" must be an empty array when verdict is "pass".
"reasons" must list the specific rule(s) violated when verdict is "flag".`;
}

export function parsePrescreenResponse(raw: string): PrescreenResult {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    return { verdict: "flag", reasons: ["Prescreen response could not be parsed"] };
  }
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
    const verdict = parsed.verdict === "pass" ? "pass" : "flag";
    const reasons: string[] = Array.isArray(parsed.reasons)
      ? parsed.reasons.filter((r: unknown) => typeof r === "string")
      : [];
    return { verdict, reasons };
  } catch {
    return { verdict: "flag", reasons: ["Prescreen response JSON was malformed"] };
  }
}
