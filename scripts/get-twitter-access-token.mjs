#!/usr/bin/env node
/**
 * NORMA — @watchNORMA X/Twitter Access Token Generator
 *
 * This script performs a PIN-based OAuth 1.0a flow to generate an
 * Access Token + Secret for the @watchNORMA account.
 *
 * Run once, save the output, then discard this script.
 *
 * Usage:
 *   node scripts/get-twitter-access-token.mjs
 *
 * Requirements:
 *   node 18+ (uses built-in fetch)
 */

import crypto from 'crypto';
import readline from 'readline';

// ─── Paste your watchNORMA app credentials here ───────────────────────────────
const CONSUMER_KEY    = 'dtR8XJqdZDrGNc9gd8oq8f9GQ';
const CONSUMER_SECRET = 'KscKnCbhBLFVyq7RmI12PCl8ZkhpnEelpYESjB3rSa1F71CV6R';
// ──────────────────────────────────────────────────────────────────────────────

// OAuth 1.0a helpers
function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g,  '%21')
    .replace(/'/g,  '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

function buildOAuthHeader(method, url, params, tokenSecret = '') {
  const oauthParams = {
    oauth_consumer_key:     CONSUMER_KEY,
    oauth_nonce:            crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_version:          '1.0',
    ...params,
  };

  const sortedParams = Object.keys(oauthParams)
    .sort()
    .map(k => `${percentEncode(k)}=${percentEncode(oauthParams[k])}`)
    .join('&');

  const signingKey   = `${percentEncode(CONSUMER_SECRET)}&${percentEncode(tokenSecret)}`;
  const baseString   = `${method}&${percentEncode(url)}&${percentEncode(sortedParams)}`;
  const signature    = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams.oauth_signature = signature;

  const headerValue = 'OAuth ' + Object.keys(oauthParams)
    .filter(k => k.startsWith('oauth_'))
    .map(k => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(', ');

  return headerValue;
}

async function getRequestToken() {
  const url    = 'https://api.twitter.com/oauth/request_token';
  const method = 'POST';
  const header = buildOAuthHeader(method, url, { oauth_callback: 'oob' });

  const res  = await fetch(url, { method, headers: { Authorization: header } });
  const body = await res.text();

  if (!res.ok) throw new Error(`request_token failed: ${res.status} ${body}`);

  const params = Object.fromEntries(new URLSearchParams(body));
  return { token: params.oauth_token, secret: params.oauth_token_secret };
}

async function getAccessToken(requestToken, requestSecret, pin) {
  const url    = 'https://api.twitter.com/oauth/access_token';
  const method = 'POST';
  const header = buildOAuthHeader(method, url, {
    oauth_token:    requestToken,
    oauth_verifier: pin,
  }, requestSecret);

  const res  = await fetch(url, { method, headers: { Authorization: header } });
  const body = await res.text();

  if (!res.ok) throw new Error(`access_token failed: ${res.status} ${body}`);

  const params = Object.fromEntries(new URLSearchParams(body));
  return {
    accessToken:       params.oauth_token,
    accessTokenSecret: params.oauth_token_secret,
    userId:            params.user_id,
    screenName:        params.screen_name,
  };
}

async function main() {
  console.log('\n\u2554' + '\u2550'.repeat(54) + '\u2557');
  console.log('\u2551   NORMA \u2014 @watchNORMA Access Token Generator         \u2551');
  console.log('\u255a' + '\u2550'.repeat(54) + '\u255d\n');

  console.log('Step 1: Requesting temporary token from X...');
  const { token: requestToken, secret: requestSecret } = await getRequestToken();
  console.log('\u2705 Got temporary token.\n');

  const authUrl = `https://api.twitter.com/oauth/authorize?oauth_token=${requestToken}`;
  console.log('Step 2: Open this URL in a browser logged in as @watchNORMA:\n');
  console.log(`  \uD83D\uDC49  ${authUrl}\n`);
  console.log('After authorizing, X will show you a 7-digit PIN.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const pin = await new Promise(resolve => rl.question('Step 3: Enter the PIN shown by X: ', ans => {
    rl.close();
    resolve(ans.trim());
  }));

  console.log('\nStep 4: Exchanging PIN for Access Token...');
  const result = await getAccessToken(requestToken, requestSecret, pin);

  console.log('\n\u2554' + '\u2550'.repeat(54) + '\u2557');
  console.log('\u2551   \u2705  SUCCESS \u2014 Save these credentials securely!     \u2551');
  console.log('\u255a' + '\u2550'.repeat(54) + '\u255d\n');
  console.log(`Screen Name:          @${result.screenName}`);
  console.log(`User ID:              ${result.userId}`);
  console.log(`\nX_ACCESS_TOKEN=       ${result.accessToken}`);
  console.log(`X_ACCESS_TOKEN_SECRET=${result.accessTokenSecret}`);
  console.log('\n\u26a0\ufe0f  Add these to your .env file and Supabase secrets.');
  console.log('   Never commit them to GitHub.\n');

  if (result.screenName.toLowerCase() !== 'watchnorma') {
    console.log(`\u26a0\ufe0f  WARNING: Token is for @${result.screenName}, not @watchNORMA.`);
    console.log('   Make sure you authorized with the correct account.\n');
  }
}

main().catch(err => {
  console.error('\n\u274c Error:', err.message);
  process.exit(1);
});
