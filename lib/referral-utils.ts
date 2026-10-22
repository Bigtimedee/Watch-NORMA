import * as Linking from "expo-linking";

export function getReferralCode(url: string): string | null {
  // Universal link https://getnorma.app/i/CODE (Spec B) or legacy ?ref=CODE.
  const m = url.match(/\/i\/([A-Za-z0-9_-]{4,32})(?:[/?#]|$)/);
  if (m) return m[1];
  const parsed = Linking.parse(url);
  const ref = parsed.queryParams?.ref;
  if (Array.isArray(ref)) return ref[0] ?? null;
  return typeof ref === "string" && ref.length > 0 ? ref : null;
}
