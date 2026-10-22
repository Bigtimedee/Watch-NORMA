import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { clientIp, hashPart } from "@/lib/referral";

// Deferred deep link (free, probabilistic): the app calls this on first open with
// no stored referral code; we match an /i/[code] click from the same IP in 24h.
export async function GET(request: Request) {
  const ip = hashPart(clientIp(request.headers));
  if (!ip) return NextResponse.json({ code: null });
  const { data } = await createSupabaseAdmin().rpc("match_referral_click", { p_ip_hash: ip });
  return NextResponse.json({ code: typeof data === "string" ? data : null }, { headers: { "Cache-Control": "no-store" } });
}
