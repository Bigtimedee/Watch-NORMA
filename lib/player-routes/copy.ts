/**
 * Static customer copy. Functions must not interpolate a stream address,
 * host, label, or launch URL.
 */

import type { ValidationReason } from "./url-validation";

export const STRYMTV_APP_STORE_URL = "https://apps.apple.com/us/app/strymtv/id1497450933";
export const STRYMTV_DEVELOPER = "iTelli Apps, LLC";

export const ENCODING_GATE_MESSAGE =
  "NORMA will not open a stream in StrymTV on this build. The link format has not been checked on an iPhone with StrymTV. Tests run on a computer are not that check.";

export const DISCLOSURE_BODY =
  "NORMA does not provide, find, or host streams. Add only an HTTPS HLS address you are authorized to watch. When a later build can open it, NORMA hands that address to iOS, which passes it to whichever app handles the strymtv link. NORMA cannot prove the recipient is StrymTV. Another app can register the same link type. StrymTV is a separate app from iTelli Apps, LLC, with its own ads and privacy practices. Saving a mapping does not prove you have the rights, and NORMA cannot tell whether the right video played.";

export const ATTESTATION_LABEL =
  "I have the rights to watch the streams I add, and I understand NORMA does not check them.";

export const UNAVAILABLE_BODY =
  "This experimental player option is not available. NORMA still uses your usual watch button. Any address already saved on this device stays here until you delete it. NORMA does not send that address to its servers.";

export const REINSTALL_BODY =
  "NORMA found player routes saved on this device from before the app was reinstalled. They are locked and will not open. Delete them, or keep them locked until you review each one. Keeping them does not turn opening back on.";

export function validationMessage(reason: ValidationReason): string {
  switch (reason) {
    case "too_long":
      return "That address is too long for NORMA to store on this device.";
    case "userinfo":
      return "Remove the username and password from the address. NORMA does not store account passwords in a stream link.";
    case "credential_query":
    case "credential_path":
      return "That address looks like it carries an account token or password. NORMA will not store it. This check does not prove every other address is free of secrets.";
    case "local_or_private_host":
    case "not_https":
      return "NORMA only accepts a public HTTPS HLS address. Local and unencrypted addresses are not part of this version.";
    case "not_hls":
      return "Use an HTTPS address whose path ends in .m3u8.";
    case "empty":
    case "malformed":
    case "whitespace_or_control":
    case "bad_percent_encoding":
    case "null_byte":
    case "nested_scheme":
    case "fragment":
    case "ambiguous_normalization":
    case "invalid_host":
      return "NORMA can't use that address. Paste one public HTTPS HLS address ending in .m3u8.";
    default:
      return "NORMA can't use that address.";
  }
}

export interface HandoffFailureCopy {
  title: string;
  body: string;
  showAppStore: boolean;
  showProvider: boolean;
}

export function handoffFailureCopy(providerName: string | null): HandoffFailureCopy {
  const provider =
    providerName && providerName.trim().length > 0 ? providerName.trim() : null;
  return {
    title: "StrymTV could not be opened",
    body: provider
      ? `iOS did not accept the handoff. That does not mean a game is playing, and it does not tell NORMA which app responded. You can still use Watch on ${provider}.`
      : "iOS did not accept the handoff. That does not mean a game is playing, and it does not tell NORMA which app responded. You can still use the watch button on this screen.",
    showAppStore: true,
    showProvider: provider != null,
  };
}
