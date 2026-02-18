// kalshi-proxy: Authenticated proxy for Kalshi API calls
// Uses RSA-PSS API key signing (Kalshi's only supported auth method).
//
// SAFETY: No trade execution is ever permitted. Only GET requests to whitelisted
// read-only endpoints are allowed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { importRsaPrivateKey, signKalshiRequest } from "../_shared/kalshi-crypto.ts";

const KALSHI_API_BASE = "https://api.elections.kalshi.com";

// Read-only endpoints only — no orders, no trades
const ALLOWED_PATHS = [
  "/trade-api/v2/portfolio/balance",
  "/trade-api/v2/portfolio/positions",
  "/trade-api/v2/markets",
  "/trade-api/v2/events",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authenticate the calling NORMA user
    const authHeader = req.headers.get("Authorization") ?? "";
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const { action } = body as { action: string };

    // ── ACTION: connect ────────────────────────────────────────────────
    // User provides API Key ID + RSA private key PEM. We verify they work
    // by fetching the balance, then store them.
    if (action === "connect") {
      const { apiKeyId, privateKey } = body as {
        apiKeyId: string;
        privateKey: string;
      };
      if (!apiKeyId || !privateKey) {
        return json({ error: "API Key ID and Private Key are required" }, 400);
      }

      // Verify the credentials work
      let cryptoKey: CryptoKey;
      try {
        cryptoKey = await importRsaPrivateKey(privateKey);
      } catch (e) {
        return json({ error: "Invalid RSA private key format" }, 400);
      }

      const testPath = "/trade-api/v2/portfolio/balance";
      const timestamp = Date.now().toString();
      const signature = await signKalshiRequest(
        cryptoKey,
        timestamp,
        "GET",
        testPath
      );

      const testRes = await fetch(`${KALSHI_API_BASE}${testPath}`, {
        headers: {
          "KALSHI-ACCESS-KEY": apiKeyId,
          "KALSHI-ACCESS-SIGNATURE": signature,
          "KALSHI-ACCESS-TIMESTAMP": timestamp,
        },
      });

      if (!testRes.ok) {
        const errText = await testRes.text();
        console.warn("Kalshi credential verification failed:", testRes.status, errText);
        return json({ error: "Invalid Kalshi credentials — please check your API Key ID and Private Key" }, 401);
      }

      // Credentials work — store them
      const { error: upsertError } = await supabase.from("connections").upsert(
        {
          user_id: user.id,
          provider_type: "sportsbook",
          provider_key: "kalshi",
          provider_name: "Kalshi",
          connected: true,
          metadata: { api_key_id: apiKeyId, private_key: privateKey },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider_type,provider_key" }
      );

      if (upsertError) {
        console.error("Failed to store Kalshi connection:", upsertError);
        return json({ error: "Failed to save connection" }, 500);
      }

      return json({ success: true });
    }

    // ── ACTION: query ──────────────────────────────────────────────────
    // Proxy a read-only GET request to Kalshi using stored API credentials.
    if (action === "query") {
      const { endpoint } = body as { endpoint: string };

      // Whitelist check
      if (!ALLOWED_PATHS.some((p) => endpoint.startsWith(p))) {
        return json({ error: "Endpoint not allowed" }, 403);
      }

      // Get stored connection
      const { data: connection } = await supabase
        .from("connections")
        .select("metadata")
        .eq("user_id", user.id)
        .eq("provider_key", "kalshi")
        .eq("connected", true)
        .single();

      if (!connection?.metadata) {
        return json({ error: "No Kalshi connection found" }, 400);
      }

      const meta = connection.metadata as {
        api_key_id?: string;
        private_key?: string;
      };
      if (!meta.api_key_id || !meta.private_key) {
        return json({ error: "Incomplete Kalshi credentials — please reconnect" }, 400);
      }

      const cryptoKey = await importRsaPrivateKey(meta.private_key);
      const timestamp = Date.now().toString();
      const signature = await signKalshiRequest(
        cryptoKey,
        timestamp,
        "GET",
        endpoint
      );

      const kalshiRes = await fetch(`${KALSHI_API_BASE}${endpoint}`, {
        method: "GET",
        headers: {
          "KALSHI-ACCESS-KEY": meta.api_key_id,
          "KALSHI-ACCESS-SIGNATURE": signature,
          "KALSHI-ACCESS-TIMESTAMP": timestamp,
        },
      });

      const data = await kalshiRes.json();
      return json(data, kalshiRes.status);
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error("kalshi-proxy error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
