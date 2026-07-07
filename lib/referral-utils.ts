import * as Linking from "expo-linking";

export function getReferralCode(url: string): string | null {
  const parsed = Linking.parse(url);
  const ref = parsed.queryParams?.ref;
  if (Array.isArray(ref)) return ref[0] ?? null;
  return typeof ref === "string" && ref.length > 0 ? ref : null;
}
