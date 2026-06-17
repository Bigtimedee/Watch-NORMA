export const VALID_MOMENT_TYPES = [
  "bet_resolved",
  "close_game",
  "overtime",
  "spread_alert",
  "moneyline_alert",
  "total_alert",
  "prop_alert",
  "position_alert",
  "foul_trouble",
  "follow_alert",
  "prediction_resolved",
] as const;

export const VALID_SPORTS = [
  "ncaa_basketball",
  "nba",
  "nfl",
  "mlb",
] as const;

export function buildExtractionPrompt(brief: string): string {
  return `You are an advertising campaign parameter extractor for NORMA, a push notification ad platform for sports bettor audiences.

Available moment types: ${VALID_MOMENT_TYPES.join(", ")}
Available sports: ${VALID_SPORTS.join(", ")}

Moment type mapping guide:
- "close game", "nail biter", "last minute", "final minutes" → close_game
- "overtime", "OT" → overtime
- "bet resolves", "wager settles", "bet settled", "settled" → bet_resolved
- "spread", "covering" → spread_alert
- "moneyline", "money line" → moneyline_alert
- "over/under", "total", "over", "under" → total_alert
- "prop", "player prop" → prop_alert
- "prediction market", "position" → position_alert, prediction_resolved
- "foul trouble", "4th foul", "fifth foul" → foul_trouble
- "follow", "fan", "favorite team" → follow_alert

Sports mapping guide:
- "college basketball", "NCAA", "March Madness", "college hoops" → ncaa_basketball
- "NBA", "pro basketball" → nba
- "NFL", "pro football", "football" → nfl
- "MLB", "baseball" → mlb
- Any non-US sport or soccer/hockey/tennis → omit, add note

Extract campaign parameters from this brief. Return valid JSON only, no explanation.
Omit any parameter not mentioned or not inferable.

Brief: ${brief}

Return exactly this JSON structure (omit null/empty fields):
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
