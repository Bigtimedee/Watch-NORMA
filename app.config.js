/**
 * Dynamic layer over app.json (app.json stays the source of truth).
 *
 * Android push: Expo push tokens on Android require Firebase Cloud Messaging,
 * which needs google-services.json at build time. That file does not exist
 * yet (it comes from a Firebase project Dave creates; see
 * docs/watch-norma-context/08 "Android release"). EAS injects it as a
 * file-type env var named GOOGLE_SERVICES_JSON; until then the key is left
 * out so `expo prebuild` / `expo config` keep working without it. Without it
 * an Android build still runs, but getExpoPushTokenAsync fails and the app
 * simply registers no push token (registerPushToken already swallows that).
 */
module.exports = ({ config }) => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  if (!googleServicesFile) return config;
  return {
    ...config,
    android: { ...config.android, googleServicesFile },
  };
};
