"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

function ResetSuccessBanner() {
  const searchParams = useSearchParams();
  if (searchParams.get("reset") !== "success") return null;
  return (
    <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-400">
      Password updated successfully. Sign in with your new password.
    </div>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const isAdmin = user?.app_metadata?.role === "admin";

    router.push(isAdmin ? "/admin/dashboard" : "/dashboard");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <div className="flex flex-col items-center">
          <Link href="/">
            <img src="/logo.png" alt="NORMA" className="h-14 w-auto" />
          </Link>
          <p className="mt-3 text-sm text-slate-400">Advertiser Portal</p>
        </div>

        <Suspense>
          <ResetSuccessBanner />
        </Suspense>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-orange-500 focus:outline-none"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-300">Password</label>
              <Link href="/auth/forgot-password" className="text-sm text-slate-400 hover:text-orange-400">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-orange-500 focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-orange-500 py-2.5 font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-sm text-slate-400">
          Don&apos;t have an account?{" "}
          <Link href="/auth/signup" className="text-orange-400 hover:text-orange-300">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
