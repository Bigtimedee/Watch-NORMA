import crypto from "crypto";

const ALL_SCOPES = ["campaigns:read", "campaigns:write", "reporting:read", "inventory:read"] as const;
export type Scope = typeof ALL_SCOPES[number];

// ─── Key loading ─────────────────────────────────────────────────────────────

function getPrivateKey(): crypto.KeyObject {
  const pem = process.env.OAUTH_JWT_PRIVATE_KEY;
  if (!pem) throw new Error("OAUTH_JWT_PRIVATE_KEY is not set");
  return crypto.createPrivateKey(pem.replace(/\\n/g, "\n"));
}

function getPublicKey(): crypto.KeyObject {
  const pem = process.env.OAUTH_JWT_PUBLIC_KEY;
  if (!pem) throw new Error("OAUTH_JWT_PUBLIC_KEY is not set");
  return crypto.createPublicKey(pem.replace(/\\n/g, "\n"));
}

export function getKeyId(): string {
  return process.env.OAUTH_JWT_KEY_ID ?? "norma-ads-key-1";
}

// ─── JWT (RS256) ─────────────────────────────────────────────────────────────

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

export interface JwtPayload {
  iss: string;
  sub: string;
  advertiser_id: number;
  scope: string[];
  iat: number;
  exp: number;
  jti: string;
}

export function signJwt(payload: Omit<JwtPayload, "iat" | "exp" | "jti">): { token: string; jti: string; expiresAt: Date } {
  const now = Math.floor(Date.now() / 1000);
  const jti = crypto.randomUUID();
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + 3600,
    jti,
  };

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: getKeyId() }));
  const body = b64url(JSON.stringify(fullPayload));
  const sigInput = `${header}.${body}`;
  const sig = crypto.sign("SHA256", Buffer.from(sigInput), { key: getPrivateKey(), padding: crypto.constants.RSA_PKCS1_PADDING });

  return {
    token: `${sigInput}.${b64url(sig)}`,
    jti,
    expiresAt: new Date((now + 3600) * 1000),
  };
}

export function verifyJwt(token: string): JwtPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");

  const [header64, body64, sig64] = parts;
  const sigInput = `${header64}.${body64}`;

  const sigBuf = Buffer.from(sig64, "base64url");
  const valid = crypto.verify(
    "SHA256",
    Buffer.from(sigInput),
    { key: getPublicKey(), padding: crypto.constants.RSA_PKCS1_PADDING },
    sigBuf
  );
  if (!valid) throw new Error("Invalid JWT signature");

  const payload = JSON.parse(Buffer.from(body64, "base64url").toString()) as JwtPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error("JWT expired");

  return payload;
}

// ─── JWKS ─────────────────────────────────────────────────────────────────────

export function getJwks(): { keys: object[] } {
  const pub = getPublicKey();
  const jwk = pub.export({ format: "jwk" }) as Record<string, string>;
  return {
    keys: [{ ...jwk, use: "sig", alg: "RS256", kid: getKeyId() }],
  };
}

// ─── Secret hashing (scrypt) ──────────────────────────────────────────────────

export function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(secret, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    const candidate = crypto.scryptSync(secret, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

export function generateSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

// ─── Scope validation ─────────────────────────────────────────────────────────

export function hasScope(payload: JwtPayload, required: Scope): boolean {
  return payload.scope.includes(required);
}

export function validateScopeOrThrow(payload: JwtPayload, required: Scope): void {
  if (!hasScope(payload, required)) {
    throw Object.assign(new Error("insufficient_scope"), { status: 403 });
  }
}

// ─── Rate limiting (in-memory, per IP) ───────────────────────────────────────

const rateLimits = new Map<string, { count: number; windowStart: number }>();

export function checkTokenRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 10;

  const entry = rateLimits.get(ip);
  if (!entry || now - entry.windowStart > windowMs) {
    rateLimits.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

// ─── Bearer token extraction ──────────────────────────────────────────────────

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}
