// norma-agent-evaluate: Autonomous prediction market alert engine
// Runs every 60 seconds via pg_cron.
// Reads prediction_positions (already synced by poll-markets) and fires
// push notifications when user-configured thresholds are crossed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
// Dedup window: don't fire the same alert_type for the same market more than once per hour
const DEDUP_WINDOW_MS = 60 * 60 * 1000;

interface AgentConfig {
  user_id: string;
  is_active: boolean;
  threshold_high: number;
  threshold_low: number;
  swing_pct: number;
  time_window_minutes: number;
  poll_interval_seconds: number;
  status: "idle" | "monitoring" | "alert_triggered";
  last_synced_at: string | null;
  onboarding_completed: boolean;
}

interface PredictionPosition {
  id: number;
  user_id: string;
  platform: string;
  market_id: string;
  market_title: string;
  game_id: string | null;
  position_side: string;
  quantity: number;
  avg_price: number;
  current_price: number | null;
  pnl: number | null;
  settled: boolean;
  last_agent_probability: number | null;
  market_close_time: string | null;
}

interface EvaluatedAlert {
  platform: string;
  market_id: string;
  market_title: string;
  current_probability: number;
  position_direction: string;
  position_size_cents: number | null;
  potential_payout_cents: number | null;
  alert_type: "imminent_resolution" | "probability_swing" | "time_expiry";
  linked_streaming_event: string | null;
  deep_link_url: string | null;
}

function currentProbabilityPct(position: PredictionPosition): number | null {
  if (position.current_price == null) return null;
  // Prices on both platforms are 0–1 (or 0–100 cents on Kalshi).
  // Normalize to 0–100 percent.
  const raw = position.current_price;
  return raw > 1 ? Math.round(raw) : Math.round(raw * 100);
}

function positionSizeCents(position: PredictionPosition): number | null {
  if (!position.quantity || !position.avg_price) return null;
  const price = position.avg_price > 1 ? position.avg_price / 100 : position.avg_price;
  return Math.round(position.quantity * price * 100);
}

function potentialPayoutCents(position: PredictionPosition): number | null {
  if (!position.quantity) return null;
  // Each contract pays $1 on win
  return Math.round(position.quantity * 100);
}

function minutesUntilClose(position: PredictionPosition): number | null {
  if (!position.market_close_time) return null;
  const closeMs = new Date(position.market_close_time).getTime();
  const nowMs = Date.now();
  return (closeMs - nowMs) / 60_000;
}

function evaluatePosition(
  position: PredictionPosition,
  config: AgentConfig
): EvaluatedAlert | null {
  if (position.settled) return null;

  const probPct = currentProbabilityPct(position);
  if (probPct == null) return null;

  const direction = position.position_side.toLowerCase(); // "yes" or "no"

  // --- Time expiry check (highest priority) ---
  const minsToClose = minutesUntilClose(position);
  if (minsToClose != null && minsToClose >= 0 && minsToClose <= config.time_window_minutes) {
    return buildAlert(position, probPct, "time_expiry");
  }

  // --- Imminent resolution ---
  if (direction === "yes" && probPct >= config.threshold_high) {
    return buildAlert(position, probPct, "imminent_resolution");
  }
  if (direction === "yes" && probPct <= config.threshold_low) {
    return buildAlert(position, probPct, "imminent_resolution");
  }
  if (direction === "no" && (100 - probPct) >= config.threshold_high) {
    return buildAlert(position, probPct, "imminent_resolution");
  }
  if (direction === "no" && (100 - probPct) <= config.threshold_low) {
    return buildAlert(position, probPct, "imminent_resolution");
  }

  // --- Probability swing ---
  if (position.last_agent_probability != null) {
    const prevPct = position.last_agent_probability > 1
      ? Math.round(position.last_agent_probability)
      : Math.round(position.last_agent_probability * 100);
    if (Math.abs(probPct - prevPct) >= config.swing_pct) {
      return buildAlert(position, probPct, "probability_swing");
    }
  }

  return null;
}

function buildAlert(
  position: PredictionPosition,
  probPct: number,
  alertType: EvaluatedAlert["alert_type"]
): EvaluatedAlert {
  return {
    platform: position.platform,
    market_id: position.market_id,
    market_title: position.market_title,
    current_probability: probPct,
    position_direction: position.position_side.toLowerCase(),
    position_size_cents: positionSizeCents(position),
    potential_payout_cents: potentialPayoutCents(position),
    alert_type: alertType,
    linked_streaming_event: null,  // enriched below if game_id is set
    deep_link_url: null,
  };
}

function buildPushBody(alert: EvaluatedAlert): { title: string; body: string } {
  const pct = alert.current_probability;
  const dir = alert.position_direction.toUpperCase();
  const shortTitle = alert.market_title.length > 50
    ? alert.market_title.slice(0, 47) + "…"
    : alert.market_title;

  let body = "";
  if (alert.alert_type === "time_expiry") {
    body = `Market closing soon — ${pct}% chance your ${dir} position resolves.`;
  } else if (alert.alert_type === "probability_swing") {
    body = `${pct}% — sharp move on your ${dir} position in ${shortTitle}.`;
  } else {
    body = `${pct}% chance your ${dir} position resolves${pct >= 85 ? " ✅" : pct <= 15 ? " ❌" : ""}.`;
  }

  if (alert.linked_streaming_event && alert.deep_link_url) {
    body += ` Tap to watch ${alert.linked_streaming_event} live.`;
  }

  return {
    title: `🎯 NORMA Agent — ${shortTitle}`,
    body,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // 1. Fetch all active agent configs
    const { data: configs, error: configErr } = await supabase
      .from("agent_config")
      .select("*")
      .eq("is_active", true);

    if (configErr) throw configErr;
    if (!configs || configs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active agents" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalAlertsFired = 0;

    for (const config of configs as AgentConfig[]) {
      try {
        // 2. Fetch user's open prediction positions
        const { data: positions, error: posErr } = await supabase
          .from("prediction_positions")
          .select("*")
          .eq("user_id", config.user_id)
          .eq("settled", false);

        if (posErr || !positions || positions.length === 0) {
          await supabase
            .from("agent_config")
            .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("user_id", config.user_id);
          continue;
        }

        // 3. Fetch user's push token + notification preferences
        const { data: profile } = await supabase
          .from("profiles")
          .select("push_token, notifications_enabled")
          .eq("id", config.user_id)
          .single();

        const canPush = profile?.notifications_enabled && profile?.push_token &&
          profile.push_token.startsWith("ExponentPushToken[");

        // 4. Fetch recent agent_alerts for dedup
        const dedupCutoff = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
        const { data: recentAlerts } = await supabase
          .from("agent_alerts")
          .select("market_id, alert_type, created_at")
          .eq("user_id", config.user_id)
          .gte("created_at", dedupCutoff);

        const recentSet = new Set(
          (recentAlerts ?? []).map((a: { market_id: string; alert_type: string }) =>
            `${a.market_id}::${a.alert_type}`
          )
        );

        // 5. For positions linked to a game, look up streaming matches
        const gameIds = [...new Set(
          (positions as PredictionPosition[])
            .filter((p) => p.game_id)
            .map((p) => p.game_id as string)
        )];

        let streamingMatchByGame: Map<string, { event: string; deepLink: string }> = new Map();

        if (gameIds.length > 0) {
          // Fetch games + user's connected streaming providers
          const [gamesRes, connectionsRes, providersRes] = await Promise.all([
            supabase.from("games").select("id, title, broadcast, home_team:home_team_id(name), away_team:away_team_id(name)").in("id", gameIds),
            supabase.from("connections").select("provider_key").eq("user_id", config.user_id).eq("connected", true),
            supabase.from("streaming_providers").select("key, universal_link, ios_scheme, web_url").eq("active", true),
          ]);

          const connectedKeys = new Set(
            (connectionsRes.data ?? []).map((c: { provider_key: string }) => c.provider_key)
          );

          for (const game of (gamesRes.data ?? []) as { id: string; title: string | null; broadcast: string | null; home_team?: { name: string } | null; away_team?: { name: string } | null }[]) {
            const homeTeam = (game.home_team as { name: string } | null)?.name;
            const awayTeam = (game.away_team as { name: string } | null)?.name;
            const eventName = homeTeam && awayTeam
              ? `${awayTeam} vs ${homeTeam}`
              : game.title ?? "Live Game";

            // Pick the first connected streaming provider and build URL
            const broadcast = game.broadcast?.toUpperCase() ?? "";
            let providerKey: string | null = null;
            if (broadcast.includes("ESPN")) providerKey = connectedKeys.has("espn_plus") ? "espn_plus" : null;
            if (!providerKey && connectedKeys.has("youtube_tv")) providerKey = "youtube_tv";
            if (!providerKey && connectedKeys.has("hulu_live")) providerKey = "hulu_live";

            if (providerKey) {
              const provider = (providersRes.data ?? []).find((p: { key: string }) => p.key === providerKey) as { key: string; universal_link: string | null; ios_scheme: string | null; web_url: string | null } | undefined;
              if (provider) {
                const deepLink = provider.universal_link ?? provider.web_url ?? "";
                streamingMatchByGame.set(game.id, { event: eventName, deepLink });
              }
            }
          }
        }

        // 6. Evaluate each position
        const alertsToFire: Array<EvaluatedAlert & { positionId: number; newProbability: number }> = [];

        for (const position of positions as PredictionPosition[]) {
          const evaluated = evaluatePosition(position, config);
          if (!evaluated) continue;

          // Dedup check
          const dedupKey = `${evaluated.market_id}::${evaluated.alert_type}`;
          if (recentSet.has(dedupKey)) continue;

          // Enrich with streaming match
          if (position.game_id && streamingMatchByGame.has(position.game_id)) {
            const match = streamingMatchByGame.get(position.game_id)!;
            evaluated.linked_streaming_event = match.event;
            evaluated.deep_link_url = match.deepLink;
          }

          alertsToFire.push({
            ...evaluated,
            positionId: position.id,
            newProbability: evaluated.current_probability,
          });
          recentSet.add(dedupKey); // prevent double-fire in same cycle
        }

        // 7. Fire alerts
        for (const alert of alertsToFire) {
          // Insert agent_alert row
          const { data: insertedAlert } = await supabase
            .from("agent_alerts")
            .insert({
              user_id: config.user_id,
              platform: alert.platform,
              market_id: alert.market_id,
              market_title: alert.market_title,
              current_probability: alert.current_probability,
              position_direction: alert.position_direction,
              position_size_cents: alert.position_size_cents,
              potential_payout_cents: alert.potential_payout_cents,
              alert_type: alert.alert_type,
              linked_streaming_event: alert.linked_streaming_event,
              deep_link_url: alert.deep_link_url,
              push_sent: false,
            })
            .select("id")
            .single();

          const agentAlertId = insertedAlert?.id;

          // Send push notification
          if (canPush && agentAlertId) {
            const { title, body } = buildPushBody(alert);

            const pushRes = await fetch(EXPO_PUSH_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({
                to: profile!.push_token,
                title,
                body,
                data: {
                  agentAlertId,
                  marketId: alert.market_id,
                  platform: alert.platform,
                  deepLinkUrl: alert.deep_link_url,
                  screen: "agent",
                },
                sound: "default",
                priority: "high",
                channelId: "game-alerts",
              }),
            });

            if (pushRes.ok) {
              await supabase
                .from("agent_alerts")
                .update({ push_sent: true })
                .eq("id", agentAlertId);
              totalAlertsFired++;
            }
          }

          // Update last_agent_probability on the position
          await supabase
            .from("prediction_positions")
            .update({ last_agent_probability: alert.newProbability / 100 })
            .eq("id", alert.positionId);
        }

        // 8. Update agent status + last_synced_at
        const newStatus = alertsToFire.length > 0 ? "alert_triggered" : "monitoring";
        await supabase
          .from("agent_config")
          .update({
            status: newStatus,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", config.user_id);

      } catch (userErr) {
        console.error(`Agent eval error for user ${config.user_id}:`, userErr);
        // Continue processing other users
      }
    }

    console.log(JSON.stringify({
      function: "norma-agent-evaluate",
      event: "completed",
      active_users: configs.length,
      alerts_fired: totalAlertsFired,
      timestamp: new Date().toISOString(),
    }));

    return new Response(
      JSON.stringify({ success: true, active_users: configs.length, alerts_fired: totalAlertsFired }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("norma-agent-evaluate fatal error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
