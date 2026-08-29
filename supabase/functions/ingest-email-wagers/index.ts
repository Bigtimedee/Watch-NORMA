// ingest-email-wagers: Receives Gmail Pub/Sub push notifications for bets@getnorma.app
//
// Architecture:
//   Gmail API watch() → Google Cloud Pub/Sub topic → push subscription → this endpoint
//
// Flow per notification:
//   1. Verify the Pub/Sub push token (query param shared secret)
//   2. Decode the Pub/Sub message to get Gmail historyId
//   3. Fetch new messages via Gmail API (history.list since last historyId)
//   4. For each message: read content, find sender, match NORMA user, parse wager
//   5. Insert wager with source='email_parse', status='active' (pending_review flag via metadata)
//   6. Record in email_imports for dedup
//   7. Send in-app notification via alerts table
//
// Required env vars:
//   GMAIL_SERVICE_ACCOUNT_JSON   — Google service account JSON (stringified)
//   GMAIL_WATCHED_ADDRESS        — e.g. bets@getnorma.app
//   PUBSUB_VERIFICATION_TOKEN    — shared secret in webhook URL ?token=
//   ANTHROPIC_API_KEY            — for Claude fallback in email-parser

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { parseEmailWagers, detectSportsbook } from "../_shared/email-parser.ts";
import { buildEmailWagerAlertPayload } from "./logic.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any>>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // -------------------------------------------------------------------
  // 1. Verify Pub/Sub verification token (simple shared-secret auth)
  // -------------------------------------------------------------------
  const url   = new URL(req.url);
  const token = url.searchParams.get("token");
  const expectedToken = Deno.env.get("PUBSUB_VERIFICATION_TOKEN");

  if (!expectedToken || token !== expectedToken) {
    console.warn("[ingest-email-wagers] Invalid verification token");
    // Return 200 anyway to prevent Pub/Sub from retrying with bad token
    return new Response(JSON.stringify({ ok: false, reason: "invalid_token" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // -------------------------------------------------------------------
  // 2. Parse Pub/Sub push message body
  // -------------------------------------------------------------------
  let pubsubMessage: { data?: string; messageId?: string } = {};
  try {
    const body = await req.json();
    pubsubMessage = body?.message ?? {};
  } catch {
    return new Response(JSON.stringify({ ok: false, reason: "invalid_body" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Decode base64 Gmail notification payload: { emailAddress, historyId }
  let historyId: string | undefined;
  if (pubsubMessage.data) {
    try {
      const decoded  = atob(pubsubMessage.data);
      const payload  = JSON.parse(decoded);
      historyId      = String(payload.historyId);
    } catch {
      console.warn("[ingest-email-wagers] Failed to decode Pub/Sub message data");
    }
  }

  if (!historyId) {
    return new Response(JSON.stringify({ ok: true, skipped: "no_history_id" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // -----------------------------------------------------------------
    // 3. Get last-processed historyId from gmail_watch_state
    // -----------------------------------------------------------------
    const { data: watchState } = await supabase
      .from("gmail_watch_state")
      .select("history_id")
      .eq("id", 1)
      .single();

    const sinceHistoryId = watchState?.history_id ?? historyId;

    // -----------------------------------------------------------------
    // 4. Fetch Gmail history since last historyId
    // -----------------------------------------------------------------
    const accessToken = await getGmailAccessToken();
    if (!accessToken) {
      console.error("[ingest-email-wagers] Could not obtain Gmail access token");
      return new Response(JSON.stringify({ ok: false, reason: "no_access_token" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const watchedAddress = Deno.env.get("GMAIL_WATCHED_ADDRESS") ?? "bets@getnorma.app";
    const messageIds = await fetchNewMessageIds(accessToken, watchedAddress, sinceHistoryId);

    if (messageIds.length === 0) {
      // Update historyId so we don't re-check old messages
      await upsertWatchState(supabase, historyId);
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -----------------------------------------------------------------
    // 5. Process each new message
    // -----------------------------------------------------------------
    let processed = 0;
    let wagersCreated = 0;

    for (const msgId of messageIds) {
      try {
        const result = await processMessage(supabase, accessToken, msgId);
        processed++;
        wagersCreated += result.wagersCreated;
      } catch (err) {
        console.warn(JSON.stringify({
          function: "ingest-email-wagers",
          event:    "message_process_failed",
          msg_id:   msgId,
          error:    (err as Error).message.slice(0, 200),
        }));
      }
    }

    // Update persisted historyId
    await upsertWatchState(supabase, historyId);

    console.log(JSON.stringify({
      function:       "ingest-email-wagers",
      event:          "completed",
      messages:       messageIds.length,
      processed,
      wagers_created: wagersCreated,
      timestamp:      new Date().toISOString(),
    }));

    return new Response(
      JSON.stringify({ ok: true, processed, wagers_created: wagersCreated }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[ingest-email-wagers] fatal:", (err as Error).message);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ---------------------------------------------------------------------------
// Gmail API helpers
// ---------------------------------------------------------------------------

/** Fetch new message IDs from Gmail history since sinceHistoryId */
async function fetchNewMessageIds(
  accessToken: string,
  userId: string,
  sinceHistoryId: string,
): Promise<string[]> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userId)}/history` +
    `?startHistoryId=${sinceHistoryId}&historyTypes=messageAdded&maxResults=20`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail history.list failed ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const ids: string[] = [];

  for (const record of data.history ?? []) {
    for (const added of record.messagesAdded ?? []) {
      if (added.message?.id) ids.push(added.message.id);
    }
  }

  return ids;
}

/** Fetch a single Gmail message and extract headers + body */
async function fetchMessage(
  accessToken: string,
  userId: string,
  messageId: string,
): Promise<{ from: string; subject: string; body: string } | null> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(userId)}/messages/${messageId}?format=full`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) return null;

  const msg = await res.json();
  const headers: Array<{ name: string; value: string }> = msg.payload?.headers ?? [];

  const from    = headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
  const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? "";

  // Extract plain-text body
  const body = extractBodyText(msg.payload);

  return { from, subject, body };
}

function extractBodyText(payload: Record<string, unknown>): string {
  if (!payload) return "";

  // Prefer text/plain part
  const mimeType = payload.mimeType as string | undefined;

  if (mimeType === "text/plain" && payload.body) {
    const b = payload.body as { data?: string };
    if (b.data) {
      try { return atob(b.data.replace(/-/g, "+").replace(/_/g, "/")); } catch { /* skip */ }
    }
  }

  // Recursively check parts
  const parts = payload.parts as Array<Record<string, unknown>> | undefined;
  if (parts) {
    for (const part of parts) {
      const text = extractBodyText(part);
      if (text) return text;
    }
  }

  return "";
}

// ---------------------------------------------------------------------------
// Service Account JWT + access token
// ---------------------------------------------------------------------------

/** Build a Google OAuth2 access token using a service account JSON */
async function getGmailAccessToken(): Promise<string | null> {
  const saJson = Deno.env.get("GMAIL_SERVICE_ACCOUNT_JSON");
  if (!saJson) return null;

  let sa: {
    client_email: string;
    private_key:  string;
    token_uri:    string;
  };

  try {
    sa = JSON.parse(saJson);
  } catch {
    return null;
  }

  const now    = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const claim  = btoa(JSON.stringify({
    iss:   sa.client_email,
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    aud:   sa.token_uri ?? "https://oauth2.googleapis.com/token",
    exp:   now + 3600,
    iat:   now,
    sub:   Deno.env.get("GMAIL_WATCHED_ADDRESS") ?? "bets@getnorma.app",
  })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const signingInput = `${header}.${claim}`;

  // Import private key (PKCS#8 PEM)
  const pemKey = sa.private_key.replace(/\\n/g, "\n");
  const pemContents = pemKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  let signature: ArrayBuffer;
  try {
    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryKey.buffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      new TextEncoder().encode(signingInput),
    );
  } catch (err) {
    console.error("[ingest-email-wagers] JWT signing failed:", (err as Error).message);
    return null;
  }

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${signingInput}.${sigB64}`;

  // Exchange JWT for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) return null;
  const tokenData = await tokenRes.json();
  return tokenData.access_token ?? null;
}

// ---------------------------------------------------------------------------
// Per-message processing
// ---------------------------------------------------------------------------

async function processMessage(
  supabase: SupabaseClient,
  accessToken: string,
  messageId: string,
): Promise<{ wagersCreated: number }> {
  // Dedup check
  const { data: existing } = await supabase
    .from("email_imports")
    .select("id")
    .eq("gmail_message_id", messageId)
    .single();

  if (existing) return { wagersCreated: 0 };

  const watchedAddress = Deno.env.get("GMAIL_WATCHED_ADDRESS") ?? "bets@getnorma.app";
  const msg = await fetchMessage(accessToken, watchedAddress, messageId);

  if (!msg) {
    await recordImport(supabase, messageId, "", null, null, 0, "parse_failed", "Could not fetch message");
    return { wagersCreated: 0 };
  }

  // Extract sender email address from "Name <email>" format
  const fromMatch = msg.from.match(/<([^>]+)>/) ?? msg.from.match(/^([^\s]+@[^\s]+)/);
  const fromEmail = fromMatch?.[1]?.trim().toLowerCase() ?? msg.from.toLowerCase().trim();

  // Find matching NORMA user
  const userId = await findUserByEmail(supabase, fromEmail);

  if (!userId) {
    await recordImport(supabase, messageId, fromEmail, null,
      detectSportsbook(fromEmail), 0, "no_user_found",
      `No NORMA user found for ${fromEmail}`);
    return { wagersCreated: 0 };
  }

  // Parse wagers from email
  let wagers;
  try {
    wagers = await parseEmailWagers(msg.from, msg.subject, msg.body);
  } catch (err) {
    await recordImport(supabase, messageId, fromEmail, userId,
      detectSportsbook(fromEmail), 0, "parse_failed", (err as Error).message.slice(0, 500));
    return { wagersCreated: 0 };
  }

  if (wagers.length === 0) {
    await recordImport(supabase, messageId, fromEmail, userId,
      detectSportsbook(fromEmail), 0, "no_wagers_found");
    return { wagersCreated: 0 };
  }

  // Insert wagers
  let created = 0;
  for (const wager of wagers) {
    try {
      // Attempt to match team_name → team_id from the teams table
      let team_id: string | null = null;
      if (wager.team_name) {
        const { data: teamRow } = await supabase
          .from("teams")
          .select("id")
          .or(`name.ilike.%${wager.team_name}%,short_name.ilike.%${wager.team_name}%`)
          .limit(1)
          .single();
        if (teamRow) team_id = teamRow.id;
      }

      // Attempt to find a matching game_id from today's games
      // if we know the team. This enables auto-resolution by resolve-wagers.
      let game_id: string | null = null;
      if (team_id) {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
        const { data: gameRow } = await supabase
          .from("games")
          .select("id")
          .or(`home_team_id.eq.${team_id},away_team_id.eq.${team_id}`)
          .gte("scheduled_at", startOfDay)
          .lt("scheduled_at", endOfDay)
          .limit(1)
          .single();
        if (gameRow) game_id = gameRow.id;
      }

      const { error } = await supabase.from("wagers").insert({
        user_id:          userId,
        game_id,
        sportsbook:       wager.provider_key,
        provider_key:     wager.provider_key,
        external_bet_id:  wager.external_bet_id,
        wager_type:       wager.wager_type,
        market_type:      wager.market_type,
        description:      wager.description,
        team_id,
        line:             wager.line,
        odds:             wager.odds,
        stake:            wager.stake,
        potential_payout: wager.potential_payout,
        legs:             wager.legs ?? null,
        placed_at:        new Date().toISOString(),
        source:           "email_parse",
        status:           "active",
      });

      if (!error) created++;
    } catch (err) {
      console.warn("[ingest-email-wagers] wager insert failed:", (err as Error).message);
    }
  }

  await recordImport(supabase, messageId, fromEmail, userId,
    wagers[0]?.provider_key ?? null, created, "ok");

  // Send in-app notification if wagers were created. The wager rows are the
  // authoritative record; a failed notification is annoying but not fatal.
  if (created > 0) {
    try {
      await createInAppNotification(supabase, userId, created, wagers[0]?.provider_key ?? "sportsbook");
    } catch (e) {
      console.warn(JSON.stringify({
        function: "ingest-email-wagers",
        event: "notification_insert_failed",
        userId,
        wagersCreated: created,
        error: (e as Error).message,
      }));
    }
  }

  return { wagersCreated: created };
}

// ---------------------------------------------------------------------------
// User lookup
// ---------------------------------------------------------------------------

async function findUserByEmail(
  supabase: SupabaseClient,
  fromEmail: string,
): Promise<string | null> {
  // 1. Check bet_forwarding_email in user_preferences
  const { data: pref } = await supabase
    .from("user_preferences")
    .select("user_id")
    .ilike("bet_forwarding_email", fromEmail)
    .single();

  if (pref?.user_id) return pref.user_id;

  // 2. Fall back to auth.users email match via RPC
  const { data: userRow } = await supabase.rpc("find_user_by_email", {
    p_email: fromEmail,
  });

  return userRow ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createInAppNotification(
  supabase: SupabaseClient,
  userId: string,
  wagersCreated: number,
  sportsbook: string,
): Promise<void> {
  const { error } = await supabase
    .from("alerts")
    .insert(buildEmailWagerAlertPayload(userId, wagersCreated, sportsbook));
  if (error) {
    // Surface the insert failure so the caller can log it. The prior version
    // swallowed the error and hid the schema mismatch for months.
    throw new Error(`createInAppNotification insert failed: ${error.message}`);
  }
}

async function recordImport(
  supabase: SupabaseClient,
  messageId: string,
  fromAddress: string,
  userId: string | null,
  sportsbook: string | null,
  wagersCreated: number,
  parseStatus: string,
  errorDetail?: string,
): Promise<void> {
  await supabase.from("email_imports").upsert({
    gmail_message_id: messageId,
    from_address:     fromAddress,
    user_id:          userId,
    sportsbook,
    wagers_created:   wagersCreated,
    parse_status:     parseStatus,
    error_detail:     errorDetail ?? null,
  }, { onConflict: "gmail_message_id" });
}

async function upsertWatchState(supabase: SupabaseClient, historyId: string): Promise<void> {
  await supabase.from("gmail_watch_state").upsert({
    id:            1,
    history_id:    historyId,
    expiration_ms: Date.now() + 7 * 24 * 60 * 60 * 1000,
    renewed_at:    new Date().toISOString(),
    updated_at:    new Date().toISOString(),
  }, { onConflict: "id" });
}
