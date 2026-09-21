"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  shouldRouteToResetPassword,
  rewriteAuthDumpToResetPath,
} from "@/lib/auth-recovery-landing";

/**
 * Safety net for GoTrue dumps on marketing `/` (or any non-reset path).
 * HARD RULE: never leave `error=otp_expired` / recovery tokens on the homepage.
 */
export function AuthRecoveryLandingGuard() {
  const pathname = usePathname() || "/";

  useEffect(() => {
    const href = window.location.href;
    if (!shouldRouteToResetPassword(href, pathname)) return;
    window.location.replace(rewriteAuthDumpToResetPath(href));
  }, [pathname]);

  return null;
}
