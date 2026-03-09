// renew-gmail-watch: Weekly cron (Sunday 2am UTC) — renew the Gmail API watch()
// subscription for the bets@getnorma.app inbox.
//
// Gmail watch() subscriptions expire after ~7 days. This function re-issues
// the watch() call and updates the expiration timestamp in gmail_watch_state.
//
// Required env vars:
//   GMAIL_SERVICE_ACCOUNT_JSON  — Google service account JSON (stringified)
//   GMAIL_WATCHED_ADDRESS       — e.g. bets@getnorma.app
//   GMAIL_PUBSUB_TOPIC          — e.g. projects/YOUR_PROJECT/topics/gmail-norma

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const accessToken = await getGmailAccessToken();
    if (!accessToken) throw new Error("Could not obtain Gmail access token");

    const watchedAddress = Deno.env.get("GMAIL_WATCHED_ADDRESS") ?? "bets@getnorma.app";
    const pubsubTopic    = Deno.env.get("GMAIL_PUBSUB_TOPIC");
    if (!pubsubTopic)    throw new Error("GMAIL_PUBSUB_TOPIC env var not set");

    const url = `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(watchedAddress)}/watch`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topicName:   pubsubTopic,
        labelIds:    ["INBOX"],
        labelFilterAction: "include",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gmail watch() failed ${res.status}: ${err.slice(0, 300)}`);
    }

    const data = await res.json();

    // Update watch state with new historyId and expiration
    await supabase.from("gmail_watch_state").upsert({
      id:            1,
      history_id:    String(data.historyId),
      expiration_ms: Number(data.expiration),
      renewed_at:    new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    }, { onConflict: "id" });

    console.log(JSON.stringify({
      function:      "renew-gmail-watch",
      event:         "renewed",
      history_id:    data.historyId,
      expiration_ms: data.expiration,
      timestamp:     new Date().toISOString(),
    }));

    return new Response(
      JSON.stringify({ ok: true, historyId: data.historyId, expiration: data.expiration }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[renew-gmail-watch] error:", (err as Error).message);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ---------------------------------------------------------------------------
// Service Account JWT (duplicated from ingest-email-wagers for independence)
// ---------------------------------------------------------------------------

async function getGmailAccessToken(): Promise<string | null> {
  const saJson = Deno.env.get("GMAIL_SERVICE_ACCOUNT_JSON");
  if (!saJson) return null;

  let sa: { client_email: string; private_key: string; token_uri?: string };
  try { sa = JSON.parse(saJson); } catch { return null; }

  const now = Math.floor(Date.now() / 1000);
  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const header = encode({ alg: "RS256", typ: "JWT" });
  const claim  = encode({
    iss:   sa.client_email,
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    aud:   sa.token_uri ?? "https://oauth2.googleapis.com/token",
    exp:   now + 3600,
    iat:   now,
    sub:   Deno.env.get("GMAIL_WATCHED_ADDRESS") ?? "bets@getnorma.app",
  });

  const signingInput = `${header}.${claim}`;
  const pemKey      = sa.private_key.replace(/\\n/g, "\n");
  const pemContents = pemKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, "");
  const binaryKey   = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  let signature: ArrayBuffer;
  try {
    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8", binaryKey.buffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false, ["sign"],
    );
    signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput));
  } catch {
    return null;
  }

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${signingInput}.${sigB64}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) return null;
  return (await tokenRes.json()).access_token ?? null;
}
