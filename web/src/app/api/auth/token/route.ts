import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  signJwt,
  verifySecret,
  checkTokenRateLimit,
} from "@/lib/oauth";

function errorResponse(error: string, description: string, status: number) {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { "Content-Type": "application/json" } }
  );
}

export async function POST(request: NextRequest) {
  // Rate limit per IP (10 req/min)
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (!checkTokenRateLimit(ip)) {
    return errorResponse("rate_limit_exceeded", "Too many requests", 429);
  }

  // Parse form body
  let body: URLSearchParams;
  try {
    const text = await request.text();
    body = new URLSearchParams(text);
  } catch {
    return errorResponse("invalid_request", "Request body must be application/x-www-form-urlencoded", 400);
  }

  const grantType = body.get("grant_type");
  const clientId = body.get("client_id");
  const clientSecret = body.get("client_secret");
  const scopeParam = body.get("scope");

  if (grantType !== "client_credentials") {
    return errorResponse("unsupported_grant_type", "Only client_credentials grant is supported", 400);
  }
  if (!clientId || !clientSecret) {
    return errorResponse("invalid_request", "client_id and client_secret are required", 400);
  }

  const supabase = createSupabaseAdmin();

  // Look up client
  const { data: client, error: clientError } = await supabase
    .from("oauth_clients")
    .select("*")
    .eq("client_id", clientId)
    .eq("is_active", true)
    .single();

  if (clientError || !client) {
    return errorResponse("invalid_client", "Invalid client credentials", 401);
  }

  // Verify secret (constant-time)
  if (!verifySecret(clientSecret, client.client_secret_hash)) {
    return errorResponse("invalid_client", "Invalid client credentials", 401);
  }

  // Resolve requested scopes (intersect with granted scopes)
  const requestedScopes = scopeParam
    ? scopeParam.split(" ").filter(Boolean)
    : client.scopes as string[];

  const grantedScopes = requestedScopes.filter((s: string) =>
    (client.scopes as string[]).includes(s)
  );

  if (grantedScopes.length === 0) {
    return errorResponse("invalid_scope", "No valid scopes requested", 400);
  }

  // Sign JWT
  const { token, jti, expiresAt } = signJwt({
    iss: "https://api.getnorma.app",
    sub: client.client_id,
    advertiser_id: client.advertiser_id,
    scope: grantedScopes,
  });

  // Record token (for revocation support)
  await supabase.from("oauth_access_tokens").insert({
    jti,
    client_id: client.client_id,
    advertiser_id: client.advertiser_id,
    scopes: grantedScopes,
    expires_at: expiresAt.toISOString(),
  });

  // Update last_used_at (non-blocking)
  supabase
    .from("oauth_clients")
    .update({ last_used_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .then(() => {});

  return NextResponse.json({
    access_token: token,
    token_type: "Bearer",
    expires_in: 3600,
    scope: grantedScopes.join(" "),
  });
}

