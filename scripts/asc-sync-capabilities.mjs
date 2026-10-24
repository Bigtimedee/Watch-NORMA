// Enables required App ID capabilities on com.norma.app via the App Store Connect API
// so EAS sees the old provisioning profile as invalid and regenerates it.
import crypto from 'node:crypto';
import fs from 'node:fs';
const { EXPO_ASC_API_KEY_PATH: keyPath, EXPO_ASC_KEY_ID: kid, EXPO_ASC_ISSUER_ID: iss } = process.env;
const BUNDLE = process.env.BUNDLE_ID || 'com.norma.app';
const WANT = ['ASSOCIATED_DOMAINS', 'USERNOTIFICATIONS_TIMESENSITIVE'];
if (!keyPath || !kid || !iss) { console.log('ASC key not configured; skipping'); process.exit(0); }
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const data = `${b64({ alg: 'ES256', kid, typ: 'JWT' })}.${b64({ iss, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' })}`;
  const sig = crypto.sign('sha256', Buffer.from(data), { key: fs.readFileSync(keyPath), dsaEncoding: 'ieee-p1363' });
  return `${data}.${sig.toString('base64url')}`;
}
async function api(method, path, body) {
  const r = await fetch(`https://api.appstoreconnect.apple.com/v1/${path}`, {
    method, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  return { status: r.status, json: t ? JSON.parse(t) : {} };
}
const res = await api('GET', `bundleIds?filter[identifier]=${BUNDLE}&include=bundleIdCapabilities,profiles&limit=1`);
if (res.status !== 200) { console.log('bundleIds lookup failed', res.status, JSON.stringify(res.json.errors)); process.exit(0); }
const bundle = res.json.data.find((d) => d.attributes.identifier === BUNDLE);
if (!bundle) { console.log('bundle not found'); process.exit(0); }
const inc = res.json.included || [];
const have = inc.filter((i) => i.type === 'bundleIdCapabilities').map((i) => i.attributes.capabilityType);
console.log('Current capabilities:', have.join(', '));
for (const p of inc.filter((i) => i.type === 'profiles')) console.log('Profile:', p.attributes.name, p.attributes.profileState);
for (const cap of WANT) {
  if (have.includes(cap)) { console.log(`${cap}: already enabled`); continue; }
  const r = await api('POST', 'bundleIdCapabilities', {
    data: { type: 'bundleIdCapabilities', attributes: { capabilityType: cap },
      relationships: { bundleId: { data: { type: 'bundleIds', id: bundle.id } } } },
  });
  console.log(`${cap}: enable -> ${r.status}`, r.status >= 300 ? JSON.stringify(r.json.errors) : 'ok');
}
