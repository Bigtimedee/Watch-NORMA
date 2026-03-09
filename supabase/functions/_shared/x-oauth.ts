// x-oauth.ts
// Shared OAuth 1.0a helper for X (Twitter) API calls from metric-fetching functions.
// The full signing implementation also lives in social-publishers.ts but is
// duplicated here to keep _shared modules self-contained and avoid circular imports.

interface XCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

function pct(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

/** Build an OAuth 1.0a Authorization header (GET-safe, no body params needed) */
export async function buildOAuth1HeaderForMetrics(
  method: string,
  url: string,
  bodyParams: Record<string, string>,
  creds: XCredentials,
): Promise<string> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key:     creds.apiKey,
    oauth_nonce:            crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_token:            creds.accessToken,
    oauth_version:          "1.0",
  };

  const allParams: Record<string, string> = { ...bodyParams, ...oauthParams };
  const sortedParams = Object.keys(allParams)
    .sort()
    .map((k) => `${pct(k)}=${pct(allParams[k])}`)
    .join("&");

  const baseString = [method.toUpperCase(), pct(url), pct(sortedParams)].join("&");
  const signingKey = `${pct(creds.apiSecret)}&${pct(creds.accessSecret)}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(baseString));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

  oauthParams["oauth_signature"] = signature;

  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${pct(k)}="${pct(oauthParams[k])}"`);

  return `OAuth ${headerParts.join(", ")}`;
}
