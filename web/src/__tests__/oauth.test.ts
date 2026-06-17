import crypto from "crypto";
import {
  signJwt,
  verifyJwt,
  hashSecret,
  verifySecret,
  generateSecret,
  hasScope,
  validateScopeOrThrow,
  checkTokenRateLimit,
  getJwks,
  JwtPayload,
} from "../lib/oauth";

// Generate a test RSA key pair before all tests
let privateKeyPem: string;
let publicKeyPem: string;

beforeAll(() => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  privateKeyPem = privateKey;
  publicKeyPem = publicKey;
  process.env.OAUTH_JWT_PRIVATE_KEY = privateKeyPem;
  process.env.OAUTH_JWT_PUBLIC_KEY = publicKeyPem;
  process.env.OAUTH_JWT_KEY_ID = "test-key-1";
});

afterAll(() => {
  delete process.env.OAUTH_JWT_PRIVATE_KEY;
  delete process.env.OAUTH_JWT_PUBLIC_KEY;
  delete process.env.OAUTH_JWT_KEY_ID;
});

// ─── JWT sign + verify ────────────────────────────────────────────────────────

describe("JWT sign and verify", () => {
  const basePayload = {
    iss: "https://api.getnorma.app",
    sub: "client-abc",
    advertiser_id: 42,
    scope: ["campaigns:read", "campaigns:write"],
  };

  it("issues and verifies a valid token", () => {
    const { token } = signJwt(basePayload);
    const decoded = verifyJwt(token);
    expect(decoded.sub).toBe("client-abc");
    expect(decoded.advertiser_id).toBe(42);
    expect(decoded.scope).toEqual(["campaigns:read", "campaigns:write"]);
    expect(decoded.iss).toBe("https://api.getnorma.app");
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(decoded.jti).toBeTruthy();
  });

  it("embeds the correct scope in JWT", () => {
    const { token } = signJwt({ ...basePayload, scope: ["reporting:read"] });
    const decoded = verifyJwt(token);
    expect(decoded.scope).toEqual(["reporting:read"]);
  });

  it("rejects a tampered token", () => {
    const { token } = signJwt(basePayload);
    const parts = token.split(".");
    // Flip a byte in the payload
    const tamperedPayload = Buffer.from(parts[1], "base64url");
    tamperedPayload[10] ^= 0xff;
    const tampered = `${parts[0]}.${tamperedPayload.toString("base64url")}.${parts[2]}`;
    expect(() => verifyJwt(tampered)).toThrow();
  });

  it("rejects a token with a bad signature", () => {
    const { token } = signJwt(basePayload);
    const parts = token.split(".");
    const badSig = crypto.randomBytes(256).toString("base64url");
    expect(() => verifyJwt(`${parts[0]}.${parts[1]}.${badSig}`)).toThrow();
  });

  it("rejects an expired token", () => {
    const { token } = signJwt(basePayload);
    const parts = token.split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as JwtPayload;
    // Back-date by 2 hours
    payload.exp = Math.floor(Date.now() / 1000) - 7200;
    const newBody = Buffer.from(JSON.stringify(payload)).toString("base64url");
    // Re-sign with the real key so signature is valid but exp is past
    const sigInput = `${parts[0]}.${newBody}`;
    const privKey = crypto.createPrivateKey(privateKeyPem);
    const sig = crypto.sign("SHA256", Buffer.from(sigInput), { key: privKey, padding: crypto.constants.RSA_PKCS1_PADDING });
    const expiredToken = `${sigInput}.${sig.toString("base64url")}`;
    expect(() => verifyJwt(expiredToken)).toThrow("JWT expired");
  });

  it("rejects a malformed token (wrong number of parts)", () => {
    expect(() => verifyJwt("not.a.valid.jwt.with.too.many.parts")).toThrow();
    expect(() => verifyJwt("onlytwoparts.here")).toThrow();
  });
});

// ─── Secret hashing ───────────────────────────────────────────────────────────

describe("secret hashing", () => {
  it("hashes a secret and verifies it correctly", () => {
    const secret = generateSecret();
    const hash = hashSecret(secret);
    expect(verifySecret(secret, hash)).toBe(true);
  });

  it("rejects a wrong secret", () => {
    const secret = generateSecret();
    const hash = hashSecret(secret);
    expect(verifySecret("wrong-secret", hash)).toBe(false);
  });

  it("generates secrets of adequate length", () => {
    const secret = generateSecret();
    // base64url of 32 bytes = 43 chars
    expect(secret.length).toBeGreaterThanOrEqual(40);
  });

  it("produces different hashes for the same secret (salted)", () => {
    const secret = generateSecret();
    const hash1 = hashSecret(secret);
    const hash2 = hashSecret(secret);
    expect(hash1).not.toBe(hash2);
    // Both should still verify
    expect(verifySecret(secret, hash1)).toBe(true);
    expect(verifySecret(secret, hash2)).toBe(true);
  });
});

// ─── Scope validation ─────────────────────────────────────────────────────────

describe("scope validation", () => {
  function makePayload(scopes: string[]): JwtPayload {
    const now = Math.floor(Date.now() / 1000);
    return { iss: "https://api.getnorma.app", sub: "c", advertiser_id: 1, scope: scopes, iat: now, exp: now + 3600, jti: "x" };
  }

  it("hasScope returns true when scope is present", () => {
    expect(hasScope(makePayload(["campaigns:read"]), "campaigns:read")).toBe(true);
  });

  it("hasScope returns false when scope is absent", () => {
    expect(hasScope(makePayload(["campaigns:read"]), "campaigns:write")).toBe(false);
  });

  it("validateScopeOrThrow does not throw when scope is present", () => {
    expect(() => validateScopeOrThrow(makePayload(["campaigns:write"]), "campaigns:write")).not.toThrow();
  });

  it("validateScopeOrThrow throws when scope is absent", () => {
    expect(() => validateScopeOrThrow(makePayload(["campaigns:read"]), "campaigns:write")).toThrow();
  });

  it("a campaigns:read token is rejected on a write endpoint", () => {
    const readOnlyPayload = makePayload(["campaigns:read"]);
    expect(() => validateScopeOrThrow(readOnlyPayload, "campaigns:write")).toThrow();
  });
});

// ─── JWKS ─────────────────────────────────────────────────────────────────────

describe("JWKS", () => {
  it("returns a valid JWKS document", () => {
    const jwks = getJwks();
    expect(jwks.keys).toHaveLength(1);
    const key = jwks.keys[0] as Record<string, string>;
    expect(key.kty).toBe("RSA");
    expect(key.use).toBe("sig");
    expect(key.alg).toBe("RS256");
    expect(key.kid).toBe("test-key-1");
    expect(key.n).toBeTruthy();
    expect(key.e).toBeTruthy();
  });
});

// ─── Rate limiting ────────────────────────────────────────────────────────────

describe("token rate limiting", () => {
  it("allows up to 10 requests per minute", () => {
    const ip = `test-ip-${Date.now()}`;
    for (let i = 0; i < 10; i++) {
      expect(checkTokenRateLimit(ip)).toBe(true);
    }
  });

  it("blocks the 11th request in the same window", () => {
    const ip = `test-ip-ratelimit-${Date.now()}`;
    for (let i = 0; i < 10; i++) checkTokenRateLimit(ip);
    expect(checkTokenRateLimit(ip)).toBe(false);
  });

  it("allows requests from different IPs independently", () => {
    const ip1 = `test-ip-a-${Date.now()}`;
    const ip2 = `test-ip-b-${Date.now()}`;
    for (let i = 0; i < 10; i++) checkTokenRateLimit(ip1);
    expect(checkTokenRateLimit(ip1)).toBe(false);
    expect(checkTokenRateLimit(ip2)).toBe(true);
  });
});
