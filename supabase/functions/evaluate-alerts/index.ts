// evaluate-alerts v2: Staged alert pipeline
// Stage 0: Candidate Generation (follows + wagers + positions)
// Stage 1: Signal Extraction
// Stage 2: Scoring + Must-Notify Rules
// Stage 2b: "Why Now" Explanation
// Stage 3: Throttling + Dedup (via alert_throttle table)
// Stage 4: Delivery Routing
//
// Trigger: Called by game-watcher-orchestrator per-game

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  evaluateSpread,
  evaluateTotal,
  evaluateMoneyline,
  evaluateMLBSpread,
  evaluateMLBTotal,
  evaluateMLBMoneyline,
  evaluateFootballSpread,
  evaluateFootballTotal,
  evaluateFootballMoneyline,
  evaluateFootballCloseGame,
  evaluateFootballRedZone,
  evaluateFootballUpsetWatch,
  evaluateProp,
  evaluatePosition,
  evaluateResolved,
  evaluatePredictionResolved,
  evaluateResolveRisk,
} from "./logic.ts";
import type {
  GameState,
  UserWager,
  UserPosition,
  SummaryStats,
  AlertCandidate,
} from "./logic.ts";
import {
  extractSignals,
  computeScore,
  meetsThreshold,
  buildWhyNow,
  checkMustNotify,
  determineAlertType,
  computeDedupHash,
  computeIntentScore,
} from "../_shared/alert-scoring.ts";
import type { WhyNow } from "../_shared/alert-scoring.ts";
import {
  runAuction,
  recordAuctionResult,
  type AuctionInput,
} from "../_shared/auction-engine.ts";
import {
  interpolateTemplate,
  buildPersonalizationContext,
} from "../_shared/template-vars.ts";
import { isInQuietHours } from "../_shared/quiet-hours.ts";

// Cooldown: minimum 5 minutes between same alert_type for same game per user
const COOLDOWN_MS = 5 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { gameId } = await req.json();
    if (!gameId) {
      return new Response(
        JSON.stringify({ error: "gameId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // --- Get game state with team info ---
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select(`
        *,
        home_team:teams!games_home_team_id_fkey(name, abbreviation),
        away_team:teams!games_away_team_id_fkey(name, abbreviation)
      `)
      .eq("id", gameId)
      .single();

    if (gameError || !game) {
      return new Response(
        JSON.stringify({ error: "Game not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const gameState = game as unknown as GameState;

    // --- Sport activation gate ---
    // Football (NCAAF + NFL) activated 2026-08-19, ahead of the 2026 season.
    // Football evaluators live in logic.ts (evaluateFootball*) and are wired
    // below; alert-scoring's football must-notify rules cover overtime,
    // two-minute drill, and close-game lead changes.
    const ALERTABLE_SPORTS = new Set(["ncaam", "nba", "mlb", "ncaaf", "nfl"]);
    if (!ALERTABLE_SPORTS.has((game as any).sport ?? "ncaam")) {
      console.log(JSON.stringify({
        function: "evaluate-alerts",
        event: "skipped_unsupported_sport",
        game_id: gameId,
        sport: (game as any).sport,
        reason: "sport_not_in_alertable_set",
        timestamp: new Date().toISOString(),
      }));
      return new Response(
        JSON.stringify({ skipped: true, reason: "sport_not_in_alertable_set" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Stage 0: Candidate Generation ---
    // v2: Include users who FOLLOW teams/players in this game, not just wager holders

    // Find users with active wagers on this game
    const { data: wagers } = await supabase
      .from("wagers")
      .select("id, user_id, wager_type, team_id, line, odds, description, sportsbook, parsed_target")
      .eq("game_id", gameId)
      .eq("status", "active");

    // Find users with prediction positions on this game
    // Include settled positions when game is closed (for prediction_resolved alerts)
    const positionQuery = supabase
      .from("prediction_positions")
      .select("id, user_id, platform, market_title, position_side, quantity, avg_price, parsed_target, settled, outcome, payout_amount")
      .eq("game_id", gameId);

    if (gameState.status !== "closed") {
      positionQuery.eq("settled", false);
    }

    const { data: positions } = await positionQuery;

    // Find users who follow teams playing in this game
    const teamIds = [game.home_team_id, game.away_team_id].filter(Boolean);
    let followUsers: Array<{ user_id: string; entity_type: string; entity_id: string }> = [];
    if (teamIds.length > 0) {
      const { data: teamFollows } = await supabase
        .from("follows")
        .select("user_id, entity_type, entity_id")
        .in("entity_id", teamIds)
        .eq("entity_type", "team");

      if (teamFollows) followUsers.push(...teamFollows);
    }

    // Find users who follow this specific game
    const { data: gameFollows } = await supabase
      .from("follows")
      .select("user_id, entity_type, entity_id")
      .eq("entity_id", gameId)
      .eq("entity_type", "game");

    if (gameFollows) followUsers.push(...gameFollows);

    // Collect all unique user IDs
    const userWagerMap = new Map<string, UserWager[]>();
    for (const w of (wagers ?? []) as UserWager[]) {
      const list = userWagerMap.get(w.user_id) ?? [];
      list.push(w);
      userWagerMap.set(w.user_id, list);
    }

    const userPositionMap = new Map<string, UserPosition[]>();
    for (const p of (positions ?? []) as UserPosition[]) {
      const list = userPositionMap.get(p.user_id) ?? [];
      list.push(p);
      userPositionMap.set(p.user_id, list);
    }

    // Follow-based users: map user_id -> followed team IDs
    const userFollowTeamMap = new Map<string, string[]>();
    for (const f of followUsers) {
      if (f.entity_type === "team") {
        const list = userFollowTeamMap.get(f.user_id) ?? [];
        list.push(f.entity_id);
        userFollowTeamMap.set(f.user_id, list);
      }
    }

    const allUserIds = new Set([
      ...userWagerMap.keys(),
      ...userPositionMap.keys(),
      ...followUsers.map((f) => f.user_id),
    ]);

    if (allUserIds.size === 0) {
      return new Response(
        JSON.stringify({ success: true, alertsSent: 0, reason: "No interested users for this game" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load profiles for every interested user. The push toggle
    // (profiles.notifications_enabled) previously filtered here, which meant
    // users with push off saw no alerts in the app either — the Alerts tab
    // stayed permanently empty. Now we always create the alert row; the push
    // send below is what respects notifications_enabled.
    // (2026-08-20 audit item C / 2026-08-23 audit BL-10.)
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, notifications_enabled, display_name, timezone")
      .in("id", Array.from(allUserIds));

    const enabledUserIds = new Set((profiles ?? []).map((p: any) => p.id));
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    // Fetch user preferences for per-user caps and quiet hours
    const { data: userPrefs } = await supabase
      .from("user_preferences")
      .select("user_id, notification_settings, favorite_players")
      .in("user_id", Array.from(enabledUserIds));

    const prefsMap = new Map(
      (userPrefs ?? []).map((p: any) => [p.user_id, p])
    );

    // Fetch latest Sportradar summary
    let summaryStats: SummaryStats | null = null;
    const { data: summarySnapshots } = await supabase
      .from("game_snapshots")
      .select("payload")
      .eq("game_id", gameId)
      .eq("snapshot_type", "sportradar_summary")
      .order("created_at", { ascending: false })
      .limit(1);

    if (summarySnapshots && summarySnapshots.length > 0) {
      const payload = summarySnapshots[0].payload as any;
      if (payload?.source === "sportradar" && payload?.home && payload?.away) {
        summaryStats = payload as SummaryStats;
      }
    }

    // Fetch latest ESPN boxscore snapshot for red-zone + rank data (Phase 3 / F3).
    // ESPN stores possession, yardLine, and team rank on the scoreboard competitor objects.
    // We extract these opportunistically; if absent the evaluators no-op gracefully.
    interface ESPNSituationCache {
      inRedZone: boolean;
      possessionTeamId: string | null;
      homeRank: number | null;
      awayRank: number | null;
    }
    let espnSituationCache: ESPNSituationCache | null = null;
    const gameSportForESPN: string = (game as any).sport ?? "";

    if (gameSportForESPN === "nfl" || gameSportForESPN === "ncaaf") {
      try {
        const { data: espnSnapshots } = await supabase
          .from("game_snapshots")
          .select("payload")
          .eq("game_id", gameId)
          .eq("snapshot_type", "espn_boxscore")
          .order("created_at", { ascending: false })
          .limit(1);

        if (espnSnapshots && espnSnapshots.length > 0) {
          const payload = espnSnapshots[0].payload as any;

          // ESPN boxscore situation object lives at payload.situation (if the game
          // has a current drive). The yardLine is distance from the end zone: <= 20
          // means the team is inside the opponent 20.
          const situation = payload?.situation ?? null;
          const yardLine = situation?.yardLine ?? null;
          const possession = situation?.possession ?? null; // ESPN team object with id

          // ESPN maps possession to a team object; we need the team's id to match
          // against game.home_team_id / game.away_team_id.
          // The ESPN competitor object: competitions[0].competitors[i].team.id
          let possessionTeamId: string | null = null;
          if (possession?.id) {
            // Try to match ESPN team id against our stored espn_id-prefixed game team ids.
            // The `games` table stores espn_id; teams table stores their ESPN team id.
            // As a fallback we compare against the raw possession id from the snapshot.
            possessionTeamId = possession.id as string;
          }

          const inRedZone = yardLine != null && yardLine <= 20;

          // Rank: ESPN competitor objects expose `curatedRank.current` (AP rank).
          // payload.competitors is a flattened array or nested under competitions.
          const competitors: any[] =
            payload?.competitions?.[0]?.competitors ?? payload?.competitors ?? [];
          let homeRank: number | null = null;
          let awayRank: number | null = null;
          for (const comp of competitors) {
            const rank = comp?.curatedRank?.current ?? comp?.team?.rank ?? null;
            const rankNum = rank != null ? parseInt(String(rank), 10) : null;
            if (rankNum != null && !isNaN(rankNum) && rankNum > 0) {
              if (comp?.homeAway === "home") homeRank = rankNum;
              else if (comp?.homeAway === "away") awayRank = rankNum;
            }
          }

          espnSituationCache = { inRedZone, possessionTeamId, homeRank, awayRank };
        }
      } catch {
        // Non-critical — proceed without ESPN situation data
      }
    }

    // Count lead changes from game_events (last 5 minutes of game time)
    let leadChangesRecent = 0;
    try {
      const { data: scoringEvents } = await supabase
        .from("game_events")
        .select("home_score_after, away_score_after, sequence")
        .eq("game_id", gameId)
        .eq("scoring_play", true)
        .order("sequence", { ascending: true });

      if (scoringEvents && scoringEvents.length >= 2) {
        // Count lead changes in the last 20 scoring events (approximation of ~5 min)
        const recentEvents = scoringEvents.slice(-20);
        let prevLeader: "home" | "away" | "tie" = "tie";
        for (const ev of recentEvents) {
          const h = ev.home_score_after ?? 0;
          const a = ev.away_score_after ?? 0;
          const leader = h > a ? "home" : a > h ? "away" : "tie";
          if (leader !== "tie" && prevLeader !== "tie" && leader !== prevLeader) {
            leadChangesRecent++;
          }
          if (leader !== "tie") prevLeader = leader;
        }
      }
    } catch {
      // Non-critical — proceed with 0
    }

    let totalAlerts = 0;
    let suppressed = 0;
    const alertsToSendPush: number[] = [];
    const alertedUserIds: string[] = [];

    // P2-01: Intent moment tracking — game-level, not per-user.
    // One entry per (moment_type, period, margin_bucket). Written after delivery.
    const intentMomentMap = new Map<string, {
      moment_type: string;
      intent_score: number;
      eligible_user_count: number;
      filled: boolean;
      clearing_price_cents: number | null;
    }>();

    // --- Process each user ---
    for (const userId of enabledUserIds) {
      const userWagers = userWagerMap.get(userId) ?? [];
      const userPositions = userPositionMap.get(userId) ?? [];
      const userFollowTeams = userFollowTeamMap.get(userId) ?? [];
      const prefs = prefsMap.get(userId);
      const notifSettings = prefs?.notification_settings ?? {};
      const favPlayers: Array<{ player_name: string }> = prefs?.favorite_players ?? [];
      const maxAlertsPerGame = notifSettings.max_alerts_per_game ?? 5;
      const maxAlertsPerHour = notifSettings.max_alerts_per_hour ?? 10;

      // Check per-game cap
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: gameAlertCount } = await supabase
        .from("alerts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("game_id", gameId)
        .gte("created_at", oneHourAgo);

      if ((gameAlertCount ?? 0) >= maxAlertsPerGame) {
        suppressed++;
        continue;
      }

      // Check per-hour cap
      const { count: hourAlertCount } = await supabase
        .from("alerts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", oneHourAgo);

      if ((hourAlertCount ?? 0) >= maxAlertsPerHour) {
        suppressed++;
        continue;
      }

      // --- Stage 1: Signal Extraction ---
      // Collect parsed targets from positions for proximity scoring
      const positionTargets = userPositions
        .map((p) => p.parsed_target ?? null)
        .filter(Boolean);

      const gameSport: string | undefined = (game as any).sport ?? undefined;
      const signals = extractSignals(
        gameState,
        summaryStats,
        userFollowTeams,
        favPlayers.map((p) => p.player_name),
        userWagers,
        userPositions.length > 0,
        leadChangesRecent,
        positionTargets as any[],
        gameSport,
      );

      // --- Stage 2: Must-Notify Check + Scoring ---
      const mustNotify = checkMustNotify(gameState, summaryStats, userWagers, gameSport, leadChangesRecent);
      const score = computeScore(signals);

      // For wager holders, also run v1 evaluators as a fallback
      const v1Candidates: AlertCandidate[] = [];
      if (userWagers.length > 0) {
        const isMLB = gameSport === "mlb";
        const isFootball = gameSport === "nfl" || gameSport === "ncaaf";
        for (const wager of userWagers) {
          if (isFootball) {
            const fbSpread = evaluateFootballSpread(gameState, wager, summaryStats);
            if (fbSpread) v1Candidates.push(fbSpread);
            const fbTotal = evaluateFootballTotal(gameState, wager);
            if (fbTotal) v1Candidates.push(fbTotal);
            const fbMl = evaluateFootballMoneyline(gameState, wager, summaryStats);
            if (fbMl) v1Candidates.push(fbMl);
          } else if (isMLB) {
            const mlbSpread = evaluateMLBSpread(gameState, wager, summaryStats);
            if (mlbSpread) v1Candidates.push(mlbSpread);
            const mlbTotal = evaluateMLBTotal(gameState, wager);
            if (mlbTotal) v1Candidates.push(mlbTotal);
            const mlbMl = evaluateMLBMoneyline(gameState, wager, summaryStats);
            if (mlbMl) v1Candidates.push(mlbMl);
          } else {
            const spread = evaluateSpread(gameState, wager, summaryStats);
            if (spread) v1Candidates.push(spread);
            const total = evaluateTotal(gameState, wager);
            if (total) v1Candidates.push(total);
            const ml = evaluateMoneyline(gameState, wager, summaryStats);
            if (ml) v1Candidates.push(ml);
          }
          const prop = evaluateProp(gameState, wager, summaryStats);
          if (prop) v1Candidates.push(prop);
          const resolved = evaluateResolved(gameState, wager);
          if (resolved) v1Candidates.push(resolved);
        }
      }

      // For follow-only users of football games, run the close-game evaluator
      if (userWagers.length === 0 && (gameSport === "nfl" || gameSport === "ncaaf")) {
        const fbClose = evaluateFootballCloseGame(gameState);
        if (fbClose) v1Candidates.push(fbClose);
      }

      // --- Phase 3 / F3: Red Zone + Upset Watch evaluators (football only) ---
      if (gameSport === "nfl" || gameSport === "ncaaf") {
        // Red Zone — derive from ESPN boxscore snapshot (situation.yardLine + possession).
        // The ESPN scoreboard payload (snapshot_type = 'espn_boxscore') stores a `situation`
        // object. We read it opportunistically; if absent, we skip rather than error.
        const redZoneData = espnSituationCache;
        if (redZoneData) {
          const userTeamIds = [
            ...userFollowTeams,
            ...userWagers.filter((w) => w.team_id).map((w) => w.team_id as string),
          ];
          const redZoneAlert = evaluateFootballRedZone(
            gameState,
            redZoneData.inRedZone,
            redZoneData.possessionTeamId,
            userTeamIds,
          );
          if (redZoneAlert) v1Candidates.push(redZoneAlert);
        }

        // Upset Watch — only NCAAF (AP poll); ranks from ESPN scoreboard snapshot
        if (gameSport === "ncaaf" && espnSituationCache) {
          const upsetAlert = evaluateFootballUpsetWatch(
            gameState,
            espnSituationCache.homeRank,
            espnSituationCache.awayRank,
          );
          if (upsetAlert) v1Candidates.push(upsetAlert);
        }
      }

      // For position holders, run position evaluator (now proximity-aware)
      for (const position of userPositions) {
        // If the game is closed and position settled, fire prediction_resolved
        if (gameState.status === "closed" && (position as any).settled) {
          const predResolved = evaluatePredictionResolved(gameState, position, summaryStats);
          if (predResolved) v1Candidates.push(predResolved);
        } else {
          // resolve_risk runs first: final-5-minutes position-at-risk check.
          // If it fires, skip the generic position_alert to avoid double-alerting.
          const riskAlert = evaluateResolveRisk(gameState, position);
          if (riskAlert) {
            v1Candidates.push(riskAlert);
          } else {
            const posAlert = evaluatePosition(gameState, position, summaryStats);
            if (posAlert) v1Candidates.push(posAlert);
          }
        }
      }

      // Determine if we should alert this user
      const shouldAlert = mustNotify != null || meetsThreshold(score) || v1Candidates.length > 0;

      console.log(JSON.stringify({
        function: "evaluate-alerts",
        event: "user_evaluation",
        gameId,
        userId,
        gameStatus: gameState.status,
        gamePeriod: gameState.period,
        gameClock: gameState.clock,
        wagerCount: userWagers.length,
        positionCount: userPositions.length,
        mustNotify: mustNotify != null ? mustNotify.alertType : null,
        score,
        v1CandidateCount: v1Candidates.length,
        v1Types: v1Candidates.map(c => c.alertType),
        shouldAlert,
        hasSummaryData: !!summaryStats,
      }));

      if (!shouldAlert) continue;

      // --- Stage 2b: Build explanation ---
      const alertType = v1Candidates.length > 0
        ? v1Candidates[0].alertType
        : determineAlertType(signals, mustNotify, userWagers);

      const whyNow = buildWhyNow(gameState, signals, score, userWagers, mustNotify);

      // Use v1 candidate title/body if available, otherwise generate from WhyNow
      const title = v1Candidates.length > 0 ? v1Candidates[0].title : whyNow.headline;
      const body = v1Candidates.length > 0 ? v1Candidates[0].body : whyNow.bullets[0] ?? "";
      // KL-1: alerts.why writes stopped (2026-08-29). Column is kept for pre-2026-08-20
      // rows that carry it; AlertCard.tsx renders explanation first and falls back to why.
      // The variable whyText was the sole write path; removing it.

      // --- Stage 3: Throttle + Dedup ---
      const dedupHash = computeDedupHash(userId, gameId, alertType, signals.margin, signals.period, signals.proximity_level ?? undefined);

      // Check alert_throttle for existing hash
      const { data: existingThrottle } = await supabase
        .from("alert_throttle")
        .select("id")
        .eq("user_id", userId)
        .eq("game_id", gameId)
        .eq("alert_type", alertType)
        .eq("dedup_hash", dedupHash)
        .limit(1);

      if (existingThrottle && existingThrottle.length > 0) {
        console.log(JSON.stringify({
          function: "evaluate-alerts",
          event: "dedup_blocked",
          gameId,
          userId,
          alertType,
          dedupHash,
        }));
        continue; // Already sent this exact alert context
      }

      // Check cooldown: min 5 minutes between same alert_type per game
      const cooldownCutoff = new Date(Date.now() - COOLDOWN_MS).toISOString();
      const { data: recentAlerts } = await supabase
        .from("alerts")
        .select("id")
        .eq("user_id", userId)
        .eq("game_id", gameId)
        .eq("alert_type", alertType)
        .gte("created_at", cooldownCutoff)
        .limit(1);

      if (recentAlerts && recentAlerts.length > 0) {
        console.log(JSON.stringify({
          function: "evaluate-alerts",
          event: "cooldown_blocked",
          gameId,
          userId,
          alertType,
        }));
        continue;
      }

      // Quiet hours are evaluated in the user's local timezone (profiles.timezone).
      // The prior UTC-based comparison silenced Eastern users during prime evening
      // football windows (2026-08-20 audit item B, 2026-08-23 audit BL-9).
      const userTimezone = profileMap.get(userId)?.timezone ?? null;
      const suppressPush = isInQuietHours(notifSettings, userTimezone);

      // --- Stage 3.5: Auction — attach sponsor if available ---
      // Determine user segment for auction
      const userSegment = userWagers.length > 0
        ? "wager_holder"
        : userPositions.length > 0
        ? "position_holder"
        : "team_follower";

      let auctionResult: Awaited<ReturnType<typeof runAuction>> = null;
      try {
        const auctionInput: AuctionInput = {
          game_id: gameId,
          moment_type: alertType,
          alert_score: score,
          user_id: userId,
          user_segment: userSegment,
          tournament_round: gameState.tournament_round ?? null,
          period: gameState.period ?? null,
          sport: (game as any).sport ?? null,
        };
        auctionResult = await runAuction(supabase, auctionInput);

        if (auctionResult) {
          console.log(JSON.stringify({
            function: "evaluate-alerts",
            event: "auction_won",
            gameId,
            userId,
            alertType,
            winningBidId: auctionResult.winning_bid_id,
            clearingPrice: auctionResult.clearing_price_cents,
          }));
        }
      } catch (auctionErr) {
        // Auction failure should never block alert delivery
        console.warn(JSON.stringify({
          function: "evaluate-alerts",
          event: "auction_error",
          gameId,
          userId,
          error: (auctionErr as Error).message,
        }));
      }

      // --- Stage 4: Insert alert + delivery ---

      // Interpolate template variables in sponsor_text if the creative supports it
      let finalSponsorText = auctionResult?.sponsor_text ?? null;
      let personalizationCtx: Record<string, string> | null = null;

      if (finalSponsorText && /\{[a-z_]+\}/.test(finalSponsorText)) {
        const userProfile = profileMap.get(userId);
        const settledPositions = userPositions.filter((p) => p.settled);
        const ctx = buildPersonalizationContext(
          userProfile?.display_name ?? null,
          settledPositions,
          gameState,
        );
        personalizationCtx = ctx as Record<string, string>;
        finalSponsorText = interpolateTemplate(finalSponsorText, ctx);
      }

      const { data: newAlert, error: insertError } = await supabase
        .from("alerts")
        .insert({
          user_id: userId,
          game_id: gameId,
          // alerts.sport is NOT NULL DEFAULT 'ncaam' (migration 049). Omitting it
          // stamped every alert as NCAA, so AlertCard's sport badge — which renders
          // only when sport !== 'ncaam' — never appeared, and an NFL or MLB alert
          // was presented to the user as college basketball. The games row is
          // selected with `*`, so sport is available here. Fixed 2026-08-20.
          sport: (game as any)?.sport ?? "ncaam",
          alert_type: alertType,
          title,
          body,
          // why column intentionally omitted (KL-1): stop writing legacy field.
          // Column is kept in DB for backward-compat; AlertCard.tsx renders
          // explanation first and falls back to why for pre-2026-08-29 rows.
          score,
          explanation: whyNow,
          suppressed_reason: suppressPush
            ? "quiet_hours"
            : (profileMap.get(userId)?.notifications_enabled === true ? null : "push_disabled"),
          // Sponsor fields from auction
          sponsor_bid_id: auctionResult?.winning_bid_id ?? null,
          sponsor_text: finalSponsorText,
          sponsor_cta_url: auctionResult?.sponsor_cta_url ?? null,
          sponsor_logo_url: auctionResult?.sponsor_logo_url ?? null,
          clearing_price_cents: auctionResult?.clearing_price_cents ?? null,
          personalization_context: personalizationCtx,
        })
        .select("id")
        .single();

      if (insertError || !newAlert) {
        console.warn(JSON.stringify({
          function: "evaluate-alerts",
          event: "insert_failed",
          gameId,
          userId,
          alertType,
          error: insertError?.message ?? "unknown",
          errorDetails: insertError,
        }));
        continue;
      }

      console.log(JSON.stringify({
        function: "evaluate-alerts",
        event: "alert_created",
        gameId,
        userId,
        alertId: newAlert.id,
        alertType,
        title,
        score,
      }));

      // P2-01: Accumulate intent moment data (game-level, not per-user).
      // dedup_key = game_id:moment_type:period:margin_bucket
      const marginBucket = Math.floor(signals.margin / 3);
      const intentKey = `${gameId}:${alertType}:${signals.period ?? 0}:${marginBucket}`;
      const intentScore = computeIntentScore(score, signals);
      if (!intentMomentMap.has(intentKey)) {
        intentMomentMap.set(intentKey, {
          moment_type: alertType,
          intent_score: intentScore,
          eligible_user_count: 0,
          filled: false,
          clearing_price_cents: null,
        });
      }
      const im = intentMomentMap.get(intentKey)!;
      im.eligible_user_count++;
      if (auctionResult && !im.filled) {
        im.filled = true;
        im.clearing_price_cents = auctionResult.clearing_price_cents;
      }

      // Record auction result (impression + spend update)
      if (auctionResult && newAlert) {
        try {
          await recordAuctionResult(supabase, auctionResult, {
            game_id: gameId,
            moment_type: alertType,
            alert_score: score,
            user_id: userId,
            user_segment: userSegment,
            tournament_round: gameState.tournament_round ?? null,
            period: gameState.period ?? null,
          }, newAlert.id);
        } catch (recordErr) {
          console.warn(JSON.stringify({
            function: "evaluate-alerts",
            event: "record_auction_error",
            alertId: newAlert.id,
            error: (recordErr as Error).message,
          }));
        }
      }

      // Record in alert_throttle for dedup (ignore unique constraint violations)
      const { error: throttleErr } = await supabase
        .from("alert_throttle")
        .insert({
          user_id: userId,
          game_id: gameId,
          alert_type: alertType,
          dedup_hash: dedupHash,
        });
      if (throttleErr) {
        console.log(JSON.stringify({
          function: "evaluate-alerts",
          event: "throttle_insert_ignored",
          gameId,
          userId,
          error: throttleErr.message,
        }));
      }

      totalAlerts++;
      alertedUserIds.push(userId);

      // Push is gated by BOTH the user's push toggle (profiles.notifications_enabled)
      // AND the quiet-hours check. In-app alerts (the row we just inserted) always
      // fly regardless; only the push channel is suppressed.
      // Must-notify alert types bypass quiet-hours suppression (user explicitly wants
      // to know about these moments regardless of the hour).
      const MUST_NOTIFY_PUSH_TYPES = new Set([
        "football_overtime",
        "football_two_minute",
        "football_close_game",
        "overtime",
        "close_game",
        "bet_resolved",
        // Phase 3 / F3: upset watch is must-notify
        "football_upset_watch",
      ]);
      const pushEnabled = profileMap.get(userId)?.notifications_enabled === true;
      const isMustNotifyType = MUST_NOTIFY_PUSH_TYPES.has(alertType);
      if ((!suppressPush || isMustNotifyType) && pushEnabled) {
        alertsToSendPush.push(newAlert.id);
      }
    }

    // Dispatch push notifications
    for (const alertId of alertsToSendPush) {
      try {
        await supabase.functions.invoke("send-push", {
          body: { alertId },
        });
      } catch (e) {
        console.warn(`Failed to send push for alert ${alertId}:`, e);
      }
    }

    // Record first_alert_received for activation-funnel instrumentation.
    // Service role bypasses RLS. Fail-silent — never delays delivery.
    if (alertedUserIds.length > 0) {
      try {
        await supabase.from("app_events").insert(
          alertedUserIds.map((uid) => ({
            user_id: uid,
            event_name: "first_alert_received",
            properties: { game_id: gameId },
          }))
        );
      } catch {
        // Non-critical analytics — do not surface
      }
    }

    // P2-01: Write intent_moment rows AFTER push dispatch (observational — never delays delivery).
    // Upsert on dedup_key so repeated evaluate-alerts calls for the same game state are idempotent.
    if (intentMomentMap.size > 0) {
      const sport = (game as any).sport ?? "ncaam";
      const margin = Math.abs(gameState.home_score - gameState.away_score);
      const gameContext = {
        home_score: gameState.home_score,
        away_score: gameState.away_score,
        margin,
        clock: gameState.clock,
        period: gameState.period,
        status: gameState.status,
        tournament_round: (game as any).tournament_round ?? null,
      };
      const signalsSnapshot = {
        margin,
        period: gameState.period,
        clock: gameState.clock,
        status: gameState.status,
        lead_changes_recent: leadChangesRecent,
        has_summary_data: !!summaryStats,
      };

      for (const [dedupKey, im] of intentMomentMap) {
        try {
          await supabase.from("intent_moments").upsert({
            game_id: gameId,
            sport,
            moment_type: im.moment_type,
            dedup_key: dedupKey,
            fired_at: new Date().toISOString(),
            intent_score: im.intent_score,
            eligible_user_count: im.eligible_user_count,
            game_context: gameContext,
            signals_snapshot: signalsSnapshot,
            auction_outcome: im.filled ? "filled" : "unfilled",
            clearing_price_cents: im.clearing_price_cents ?? null,
          }, { onConflict: "dedup_key" });
        } catch (e) {
          console.warn(JSON.stringify({
            function: "evaluate-alerts",
            event: "intent_moment_write_error",
            gameId,
            dedupKey,
            error: (e as Error).message,
          }));
        }
      }
    }

    // P2-07: Post-outcome commerce moment — written once per closed game with a winner.
    // Observational only; does not affect alert delivery. Commerce demand eligible.
    if (gameState.status === "closed" &&
        gameState.home_score !== gameState.away_score) {
      const sport = (game as any).sport ?? "ncaam";
      const margin = Math.abs(gameState.home_score - gameState.away_score);
      const postOutcomeDedupKey = `${gameId}:post_outcome:final:0`;
      const isUpset = margin <= 5;
      const isBlowout = margin > 20;
      const isOT = (gameState.period ?? 0) > 4;
      const intentScore = computeIntentScore(75, {
        is_overtime: isOT,
        is_final_two: false,
        is_close_game: margin <= 6,
        is_final_minutes: false,
      });
      try {
        await supabase.from("intent_moments").upsert({
          game_id: gameId,
          sport,
          moment_type: "post_outcome",
          dedup_key: postOutcomeDedupKey,
          fired_at: new Date().toISOString(),
          intent_score: intentScore,
          eligible_user_count: enabledUserIds.size,
          game_context: {
            home_score: gameState.home_score,
            away_score: gameState.away_score,
            margin,
            period: gameState.period,
            status: gameState.status,
            is_upset: isUpset,
            is_blowout: isBlowout,
            is_overtime: isOT,
          },
          signals_snapshot: {
            margin,
            period: gameState.period,
            status: gameState.status,
            post_outcome: true,
          },
          auction_outcome: "unfilled",
          clearing_price_cents: null,
        }, { onConflict: "dedup_key" });
      } catch (e) {
        console.warn(JSON.stringify({
          function: "evaluate-alerts",
          event: "post_outcome_write_error",
          gameId,
          error: (e as Error).message,
        }));
      }
    }

    const result = {
      success: true,
      usersEvaluated: enabledUserIds.size,
      usersWithWagers: userWagerMap.size,
      usersWithPositions: userPositionMap.size,
      usersWithFollows: userFollowTeamMap.size,
      alertsSent: totalAlerts,
      alertsSuppressed: suppressed,
      pushSent: alertsToSendPush.length,
      hasSummaryData: !!summaryStats,
      intentMomentsWritten: intentMomentMap.size,
    };

    console.log(JSON.stringify({
      function: "evaluate-alerts",
      event: "completed",
      gameId,
      ...result,
      timestamp: new Date().toISOString(),
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("evaluate-alerts error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
