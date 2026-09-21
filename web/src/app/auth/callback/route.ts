import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import {
  WEB_RECOVERY_PATH,
  isExpiredRecoveryError,
  parseRecoveryParams,
} from "@/lib/auth-recovery-landing";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? WEB_RECOVERY_PATH;
  const params = parseRecoveryParams(request.url);

  // GoTrue error dumps (otp_expired, access_denied) must never fall through
  // to marketing `/` or a silent login redirect.
  if (isExpiredRecoveryError(params) || params.error) {
    const dest = new URL(WEB_RECOVERY_PATH, origin);
    searchParams.forEach((value, key) => {
      dest.searchParams.set(key, value);
    });
    return NextResponse.redirect(dest);
  }

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const dest = next.startsWith("/") ? `${origin}${next}` : `${origin}${WEB_RECOVERY_PATH}`;
      return NextResponse.redirect(dest);
    }
    const failed = new URL(WEB_RECOVERY_PATH, origin);
    failed.searchParams.set("error", "access_denied");
    failed.searchParams.set("error_code", "otp_expired");
    return NextResponse.redirect(failed);
  }

  const fallback = new URL(WEB_RECOVERY_PATH, origin);
  fallback.searchParams.set("error", "access_denied");
  fallback.searchParams.set("error_code", "otp_expired");
  return NextResponse.redirect(fallback);
}
