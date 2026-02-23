"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role: "advertiser" },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <h2 className="text-xl font-bold text-white">Check your email</h2>
          <p className="text-slate-400">
            We sent a verification link to <strong className="text-white">{email}</strong>.
            Click the link to complete your registration.
          </p>
          <Link href="/auth/login" className="text-sm text-orange-400 hover:text-orange-300">
            Back to login
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
            <Image src="/logo.png" alt="NORMA" width={160} height={67} className="h-14 w-auto" />
          </Link>
          <p className="mt-3 text-sm text-slate-400">Create your advertiser account</p>
        </div>

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
            <label className="block text-sm font-medium text-slate-300">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-orange-500 focus:outline-none"
              placeholder="Min 8 characters"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-orange-500 py-2.5 font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-orange-400 hover:text-orange-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
