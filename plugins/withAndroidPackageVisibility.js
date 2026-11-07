/**
 * Android 11+ (API 30) package visibility: the Android counterpart of
 * ios.infoPlist.LSApplicationQueriesSchemes.
 *
 * On API 30+ PackageManager hides other apps from NORMA unless the manifest
 * declares a <queries> entry for them. React Native's Linking.canOpenURL
 * resolves an ACTION_VIEW intent, so without these entries it answers false
 * for every streaming / sportsbook scheme even when the app is installed.
 * Linking.openURL itself does not need <queries> (it starts the activity and
 * rejects on ActivityNotFoundException, which the deep-link fallback chain in
 * lib/deep-links.ts already catches and moves past).
 *
 * Installed-app detection stays iOS-only in lib/installed-apps.ts until each
 * provider's Android scheme is verified on a device; these entries only make
 * the probe possible. See docs/watch-norma-context/08 (Android section).
 *
 * Options: { schemes: string[] }  (app.json passes the iOS query list so the
 * two platforms stay in sync).
 */
const { withAndroidManifest } = require("expo/config-plugins");

function intentFor(scheme) {
  return {
    action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
    category: [{ $: { "android:name": "android.intent.category.BROWSABLE" } }],
    data: [{ $: { "android:scheme": scheme } }],
  };
}

function normalize(schemes) {
  return [
    ...new Set(
      (schemes || [])
        .filter((s) => s != null)
        .map((s) => String(s).replace(/:\/*$/, "").trim())
        .filter(Boolean)
    ),
  ];
}

/** Adds one VIEW intent per scheme (plus https) to <queries>. Idempotent. */
function applyQueries(manifest, schemes) {
  const root = manifest.manifest;
  const queries = Array.isArray(root.queries) ? root.queries : [];
  const present = new Set();
  for (const q of queries) {
    for (const intent of q.intent || []) {
      for (const d of intent.data || []) {
        if (d.$ && d.$["android:scheme"]) present.add(d.$["android:scheme"]);
      }
    }
  }
  // https VIEW lets canOpenURL answer for universal / App Links too.
  const wanted = [...normalize(schemes), "https"].filter((s) => !present.has(s));
  if (wanted.length) queries.push({ intent: wanted.map(intentFor) });
  root.queries = queries;
  return manifest;
}

function withAndroidPackageVisibility(config, props = {}) {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = applyQueries(cfg.modResults, props.schemes);
    return cfg;
  });
}

module.exports = withAndroidPackageVisibility;
module.exports.applyQueries = applyQueries;
module.exports.normalize = normalize;
