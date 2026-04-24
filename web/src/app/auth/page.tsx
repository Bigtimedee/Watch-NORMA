import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AuthLandingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <div className="flex flex-col items-center">
          <Link href="/">
            <img src="/logo.png" alt="NORMA" className="h-14 w-auto" />
          </Link>
          <p className="mt-3 text-sm text-slate-400">Advertiser Portal</p>
        </div>

        <div className="space-y-3">
          <Link
            href="/auth/login"
            className="block w-full rounded-xl bg-orange-500 py-3.5 text-center text-base font-bold text-white hover:bg-orange-600"
          >
            Sign In
          </Link>
          <Link
            href="/auth/signup"
            className="block w-full rounded-xl border border-slate-700 py-3.5 text-center text-base font-bold text-slate-300 hover:border-slate-500 hover:text-white"
          >
            Create Account
          </Link>
        </div>

        <p className="text-center text-xs text-slate-600">
          By continuing you agree to NORMA&apos;s Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
