"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

type PageState = "checking" | "ready" | "expired" | "success";

export default function ResetPasswordPage() {
  const [pageState, setPageState] = useState<PageState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowser();

    // PKCE flow: session already established by /auth/callback before redirect here
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setPageState("ready");
        return;
      }
      // Hash flow fallback: session arrives via fragment after Supabase redirect
      // onAuthStateChange fires when Supabase detects the #access_token fragment
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
            setPageState("ready");
          }
        }
      );
      // Give hash-based flow 2s to fire before declaring link expired
      const timer = setTimeout(() => {
        setPageState((s) => s === "checking" ? "expired" : s);
      }, 2000);

      return () => {
        subscription.unsubscribe();
        clearTimeout(timer);
      };
    });
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
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(
        error.status === 403 || error.message.toLowerCase().includes("session")
          ? "This reset link has expired or already been used. Please request a new one."
          : error.message
      );
      setLoading(false);
      return;
    }

    setPageState("success");
    // Sign out the reset session so the user logs in fresh with their new password
    await supabase.auth.signOut();
    router.push("/auth/login?reset=success");
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
          <h2 className="text-xl font-bold text-white">Link Expired</h2>
          <p className="text-slate-400">
            This password reset link is invalid or has already been used.
          </p>
          <Link
            href="/auth/forgot-password"
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
                  href="/auth/forgot-password"
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
