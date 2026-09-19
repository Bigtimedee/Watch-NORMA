"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import {
  EXPIRED_RESET_COPY,
  EXPIRED_RESET_HEADLINE,
  WEB_FORGOT_PASSWORD_PATH,
  isExpiredRecoveryError,
  parseRecoveryParams,
  postResetDestination,
} from "@/lib/auth-recovery-landing";

type PageState = "checking" | "ready" | "expired" | "success";

export default function ResetPasswordPage() {
  const [pageState, setPageState] = useState<PageState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const href = window.location.href;
    const params = parseRecoveryParams(href);
    if (isExpiredRecoveryError(params)) {
      setPageState("expired");
      return;
    }

    const supabase = createSupabaseBrowser();
    let cancelled = false;

    const markReady = () => {
      if (!cancelled) setPageState("ready");
    };

    const run = async () => {
      // Browser client may already have consumed ?code= / #access_token
      // via detectSessionInUrl. Check first so we do not double-exchange.
      const existing = await supabase.auth.getSession();
      if (cancelled) return;
      if (existing.data.session) {
        markReady();
        return;
      }

      if (params.code && params.code.length >= 16) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          params.code
        );
        if (cancelled) return;
        if (!exchangeError) {
          markReady();
          return;
        }
      }

      if (params.accessToken && params.refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: params.accessToken,
          refresh_token: params.refreshToken,
        });
        if (cancelled) return;
        if (!sessionError) {
          markReady();
          return;
        }
      }

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
          markReady();
        }
      });

      const timer = setTimeout(() => {
        setPageState((s) => (s === "checking" ? "expired" : s));
      }, 2500);

      return () => {
        subscription.unsubscribe();
        clearTimeout(timer);
      };
    };

    let cleanup: (() => void) | undefined;
    run().then((fn) => {
      cleanup = fn;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowser();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(
        updateError.status === 403 ||
          updateError.message.toLowerCase().includes("session") ||
          updateError.message.toLowerCase().includes("expired")
          ? EXPIRED_RESET_COPY
          : updateError.message
      );
      setLoading(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const isAdmin = user?.app_metadata?.role === "admin";
    setPageState("success");
    router.push(postResetDestination(Boolean(isAdmin)));
    router.refresh();
  };

  if (pageState === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">Verifying reset link…</p>
      </div>
    );
  }

  if (pageState === "expired") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <h2 className="text-xl font-bold text-white">{EXPIRED_RESET_HEADLINE}</h2>
          <p className="text-slate-400">{EXPIRED_RESET_COPY}</p>
          <Link
            href={WEB_FORGOT_PASSWORD_PATH}
            className="block text-sm text-orange-400 hover:text-orange-300"
          >
            Request a new reset link →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <div className="flex flex-col items-center">
          <Link href="/">
            <img src="/logo.png" alt="NORMA" className="h-14 w-auto" />
          </Link>
          <p className="mt-3 text-sm text-slate-400">Choose a new password</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300">New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoFocus
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-orange-500 focus:outline-none"
              placeholder="Min 8 characters"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-orange-500 focus:outline-none"
              placeholder="Re-enter your password"
            />
          </div>

          {error && (
            <div className="space-y-1">
              <p className="text-sm text-red-400">{error}</p>
              {error.includes("expired") && (
                <Link
                  href={WEB_FORGOT_PASSWORD_PATH}
                  className="text-sm text-orange-400 hover:text-orange-300"
                >
                  Request a new reset link →
                </Link>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-orange-500 py-2.5 font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? "Updating…" : "Set New Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
