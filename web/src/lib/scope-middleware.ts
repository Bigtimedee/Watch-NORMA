import { NextRequest, NextResponse } from "next/server";
import { verifyJwt, extractBearerToken, validateScopeOrThrow, JwtPayload } from "./oauth";
import type { Scope } from "./oauth";

export interface AuthContext {
  payload: JwtPayload;
  advertiserId: number;
}

function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

function forbidden(message = "Insufficient scope") {
  return NextResponse.json({ error: message }, { status: 403 });
}

// Legacy API key: treat as all-scopes token
async function resolveApiKey(key: string): Promise<JwtPayload | null> {
  // Dynamically import to avoid circular deps at build time
  const { createSupabaseAdmin } = await import("./supabase-admin");
  const { default: crypto } = await import("crypto");

  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from("api_keys")
    .select("key_id, advertiser_id, scopes, is_active")
    .eq("key_hash", hash)
    .eq("is_active", true)
    .single();

  if (!data) return null;

  const now = Math.floor(Date.now() / 1000);
  return {
    iss: "https://api.getnorma.app",
    sub: `apikey:${data.key_id}`,
    advertiser_id: data.advertiser_id,
    scope: data.scopes ?? ["campaigns:read", "campaigns:write", "reporting:read", "inventory:read"],
    iat: now,
    exp: now + 3600,
    jti: crypto.randomUUID(),
  };
}

export async function requireAuth(
  request: NextRequest,
  requiredScope: Scope
): Promise<{ ctx: AuthContext } | NextResponse> {
  const auth = request.headers.get("Authorization");
  const token = extractBearerToken(auth);

  if (!token) return unauthorized();

  let payload: JwtPayload;

  // Try JWT first
  try {
    payload = verifyJwt(token);
  } catch {
    // Fall back to legacy API key
    const apiKeyPayload = await resolveApiKey(token);
    if (!apiKeyPayload) return unauthorized("Invalid or expired token");
    payload = apiKeyPayload;
  }

  // Scope check
  try {
    validateScopeOrThrow(payload, requiredScope);
  } catch {
    return forbidden(`Token does not have required scope: ${requiredScope}`);
  }

  return { ctx: { payload, advertiserId: payload.advertiser_id } };
}
