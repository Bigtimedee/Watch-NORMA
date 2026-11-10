/**
 * Syntactic HTTPS HLS validation. NORMA does not fetch the address.
 * A passing result is not proof the address is non-secret or lawful.
 * The returned URL is the original string, and only when it round-trips
 * through the WHATWG parser without normalization.
 */

export const STREAM_URL_MAX_UTF8_BYTES = 2000;

const CREDENTIAL_NAMES = new Set([
  "password",
  "passwd",
  "pwd",
  "pass",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "auth_token",
  "api_key",
  "apikey",
  "api-key",
  "secret",
  "client_secret",
  "bearer",
  "authorization",
  "auth",
  "credential",
  "credentials",
  "session",
  "sessionid",
  "session_id",
  "sid",
  "signature",
  "sig",
  "policy",
  "key-pair-id",
  "keypairid",
  "key",
  "x-amz-signature",
  "x-amz-security-token",
  "x-amz-credential",
]);

export type ValidationReason =
  | "empty"
  | "malformed"
  | "too_long"
  | "whitespace_or_control"
  | "bad_percent_encoding"
  | "null_byte"
  | "not_https"
  | "not_hls"
  | "userinfo"
  | "credential_query"
  | "credential_path"
  | "nested_scheme"
  | "fragment"
  | "ambiguous_normalization"
  | "local_or_private_host"
  | "invalid_host";

export type ValidationResult =
  | { ok: true; url: string }
  | { ok: false; reason: ValidationReason };

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function hasBadPercent(input: string): boolean {
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] !== "%") continue;
    const hex = input.slice(i + 1, i + 3);
    if (!/^[0-9a-fA-F]{2}$/.test(hex)) return true;
  }
  return false;
}

function isIpv4(host: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
}

function ipv4Octets(host: string): number[] | null {
  if (!isIpv4(host)) return null;
  const parts = host.split(".").map((part) => Number(part));
  if (parts.some((n) => !Number.isInteger(n) || n > 255)) return null;
  return parts;
}

function isPrivateOrNonPublicIpv4(octets: number[]): boolean {
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

const LOCAL_SUFFIXES = [
  ".local",
  ".localhost",
  ".internal",
  ".home",
  ".lan",
  ".localdomain",
  ".arpa",
  ".onion",
];

function hostRejected(hostname: string): ValidationReason | null {
  const host = hostname.toLowerCase().replace(/\.+$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost")) return "local_or_private_host";
  if (host.includes(":")) return "local_or_private_host";
  if (LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return "local_or_private_host";
  if (isIpv4(hostname)) {
    const octets = ipv4Octets(hostname);
    if (!octets) return "invalid_host";
    if (isPrivateOrNonPublicIpv4(octets)) return "local_or_private_host";
    return null;
  }
  if (!/^[a-z0-9.-]+$/i.test(hostname) || hostname.includes("..") || hostname.startsWith(".") || hostname.endsWith(".")) {
    return "invalid_host";
  }
  if (!hostname.includes(".")) return "local_or_private_host";
  return null;
}

function reject(reason: ValidationReason): ValidationResult {
  return { ok: false, reason };
}

export function validateStreamUrl(input: unknown): ValidationResult {
  if (typeof input !== "string" || input.length === 0) return reject("empty");
  if (utf8ByteLength(input) > STREAM_URL_MAX_UTF8_BYTES) return reject("too_long");
  if (/[\u0000-\u0020\u007f-\u009f]/.test(input)) return reject("whitespace_or_control");
  if (/%00/i.test(input)) return reject("null_byte");
  if (hasBadPercent(input)) return reject("bad_percent_encoding");
  if (!input.startsWith("https://")) return reject("not_https");
  if (input.slice("https://".length).includes("://")) return reject("nested_scheme");

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return reject("malformed");
  }
  if (parsed.href !== input) return reject("ambiguous_normalization");
  if (parsed.hostname !== parsed.hostname.toLowerCase()) return reject("ambiguous_normalization");
  if (parsed.protocol !== "https:") return reject("not_https");
  if (parsed.username !== "" || parsed.password !== "") return reject("userinfo");
  if (parsed.hash !== "") return reject("fragment");
  if (!parsed.pathname.toLowerCase().endsWith(".m3u8")) return reject("not_hls");

  const hostReason = hostRejected(parsed.hostname);
  if (hostReason) return reject(hostReason);

  for (const key of parsed.searchParams.keys()) {
    if (CREDENTIAL_NAMES.has(key.toLowerCase())) return reject("credential_query");
  }
  for (const value of parsed.searchParams.values()) {
    if (/^bearer\s+/i.test(value)) return reject("credential_query");
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  for (const segment of segments) {
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return reject("bad_percent_encoding");
    }
    if (CREDENTIAL_NAMES.has(decoded.toLowerCase())) return reject("credential_path");
  }
  return { ok: true, url: input };
}
