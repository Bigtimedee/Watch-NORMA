// parse-bet-slip: Receives a bet slip screenshot and uses Claude Vision to extract wager details

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface ParsedWager {
  sportsbook: string;
  wager_type: "spread" | "moneyline" | "over_under" | "prop";
  description: string;
  team_name: string | null;
  line: number | null;
  odds: string | null;
}

interface ParseResponse {
  success: boolean;
  wagers: ParsedWager[];
  confidence: "high" | "medium" | "low";
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { imageBase64, mediaType, gameId } = await req.json();

    if (!imageBase64 || !mediaType) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing imageBase64 or mediaType" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Optionally fetch game context for better parsing
    let gameContext = "";
    if (gameId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: game } = await supabase
        .from("games")
        .select(
          `
          *,
          home_team:teams!games_home_team_id_fkey(name, abbreviation),
          away_team:teams!games_away_team_id_fkey(name, abbreviation)
        `
        )
        .eq("id", gameId)
        .maybeSingle();

      if (game?.home_team && game?.away_team) {
        gameContext = `\nGame context: ${game.away_team.name} @ ${game.home_team.name}. Use these team names when matching.`;
      }
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Anthropic API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prompt = `You are analyzing a screenshot of a sports betting slip or DFS pick'em entry slip. Extract all wagers from this image.
${gameContext}
For each wager, return:
- sportsbook: The betting platform (e.g. "draftkings", "fanduel", "betmgm", "espnbet", "caesars", "prizepicks", "underdog"). Use lowercase keys. PrizePicks and Underdog entries show player projections (more/less on a stat line) rather than traditional spreads.
- wager_type: One of "spread", "moneyline", "over_under", or "prop"
- description: A short description of the bet (e.g. "Duke -3.5", "Over 145.5", "Zach Edey Over 22.5 Points")
- team_name: The team name if applicable, or null for over/under and props
- line: The numeric line/spread value (e.g. -3.5, 145.5), or null if not applicable
- odds: The American odds as a string (e.g. "-110", "+150"), or null if not visible

Return a JSON object with this exact structure:
{
  "wagers": [...],
  "confidence": "high" | "medium" | "low"
}

If the image is not a bet slip or you cannot parse any wagers, return:
{
  "wagers": [],
  "confidence": "low"
}

Return ONLY valid JSON, no other text.`;

    const claudeController = new AbortController();
    const claudeTimer = setTimeout(() => claudeController.abort(), 30000);
    let claudeRes: Response;
    try {
      claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        signal: claudeController.signal,
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mediaType,
                    data: imageBase64,
                  },
                },
                {
                  type: "text",
                  text: prompt,
                },
              ],
            },
          ],
        }),
      });
    } finally {
      clearTimeout(claudeTimer);
    }

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      console.error("Claude API error:", errBody);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to analyze image" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const claudeData = await claudeRes.json();
    const textContent = claudeData.content?.find(
      (c: { type: string }) => c.type === "text"
    );

    if (!textContent?.text) {
      return new Response(
        JSON.stringify({ success: false, wagers: [], confidence: "low", error: "No response from vision model" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract JSON from response (handle markdown code blocks)
    let jsonText = textContent.text.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonText);

    const result: ParseResponse = {
      success: true,
      wagers: parsed.wagers ?? [],
      confidence: parsed.confidence ?? "medium",
    };

    console.log(JSON.stringify({
      function: "parse-bet-slip",
      event: "completed",
      wagersFound: result.wagers.length,
      confidence: result.confidence,
      hasGameContext: !!gameId,
      timestamp: new Date().toISOString(),
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("parse-bet-slip error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
