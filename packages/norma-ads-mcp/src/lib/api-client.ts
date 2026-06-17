import { internalError } from "./errors.js";

const DEFAULT_BASE_URL = "https://getnorma.app/api/ads";

// OAuth token cache — module-level singleton, safe for a single-process server
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0; // ms since epoch; 0 = not yet fetched

export function getBaseUrl(): string {
  return process.env.NORMA_API_BASE_URL ?? DEFAULT_BASE_URL;
}

// Derive the token URL from the base URL origin so a custom NORMA_API_BASE_URL host works
function getTokenUrl(): string {
  const url = new URL(getBaseUrl());
  return `${url.origin}/api/auth/token`;
}

function readOAuthCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.NORMA_OAUTH_CLIENT_ID;
  const clientSecret = process.env.NORMA_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw internalError(
      "NORMA_OAUTH_CLIENT_ID and NORMA_OAUTH_CLIENT_SECRET must be set. " +
        "Create OAuth credentials at getnorma.app/settings under API Access."
    );
  }
  return { clientId, clientSecret };
}

async function fetchAccessToken(): Promise<string> {
  const { clientId, clientSecret } = readOAuthCredentials();

  const res = await fetch(getTokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const err = await res.json() as { error_description?: string; error?: string };
      detail = err.error_description ?? err.error ?? res.statusText;
    } catch {
      detail = res.statusText;
    }
    throw internalError(`OAuth token exchange failed (${res.status}): ${detail}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  // Cache the token; refresh 5 minutes before actual expiry
  _tokenExpiresAt = Date.now() + data.expires_in * 1000 - 5 * 60 * 1000;
  _cachedToken = data.access_token;
  return _cachedToken;
}

async function getAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiresAt) {
    return _cachedToken;
  }
  return fetchAccessToken();
}

async function request<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const token = await getAccessToken();

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = "";
    try {
      const err = await res.json() as { error?: string };
      detail = err.error ?? res.statusText;
    } catch {
      detail = res.statusText;
    }
    if (res.status === 401 || res.status === 403) {
      throw internalError(`Authentication failed: ${detail}`);
    }
    throw internalError(`API error ${res.status}: ${detail}`);
  }

  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
};
