import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

const APP_STORE_URL = "https://apps.apple.com/app/watch-norma/id6504228672";

const VALUE_PROPS = [
  {
    icon: "📲",
    headline: "Get alerted when your spread is live",
    body: "NORMA watches the game so you don't have to. When the margin crosses your line, you'll know instantly.",
  },
  {
    icon: "📺",
    headline: "Know exactly when to tune in",
    body: "Stop watching blowouts. NORMA tells you when games get tight — so you only watch the moments that matter.",
  },
  {
    icon: "🎯",
    headline: "See your wager status in real time",
    body: "Track all your active bets in one place. Watch your spread, total, and parlay legs update live as the game moves.",
  },
];

export default async function PartnerLandingPage({
  params,
}: {
  params: Promise<{ partnerKey: string }>;
}) {
  const { partnerKey } = await params;
  const supabase = createSupabaseAdmin();

  // Load partner from provider_registry
  const { data: provider } = await supabase
    .from("streaming_providers")
    .select("key, name, logo_url")
    .eq("key", partnerKey)
    .single();

  if (!provider) notFound();

  // Load referral code and increment click count
  const { data: ref } = await supabase
    .from("partner_referral_codes")
    .select("code")
    .eq("partner_key", partnerKey)
    .single();

  if (ref) {
    // Best-effort click tracking — non-fatal if it fails
    await (supabase.rpc as any)("increment_partner_clicks", { p_key: partnerKey }).catch(() => {});
  }

  const referralCode = ref?.code ?? "";
  const downloadUrl = referralCode
    ? `${APP_STORE_URL}?pt=norma&ct=${partnerKey}&mt=8&ref=${referralCode}`
    : APP_STORE_URL;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <img src="/logo.png" alt="Watch NORMA" className="h-10 w-auto" />
            </Link>
            {provider.logo_url && (
              <>
                <span className="text-slate-600">×</span>
                <img
                  src={provider.logo_url}
                  alt={provider.name}
                  className="h-8 w-auto object-contain"
                />
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <div className="mx-auto max-w-2xl space-y-8">
          <div className="space-y-4">
            <span className="inline-block rounded-full bg-orange-500/15 px-4 py-1.5 text-sm font-medium text-orange-400">
              Exclusive for {provider.name} bettors
            </span>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Track your {provider.name} bets with{" "}
              <span className="text-orange-400">Watch NORMA</span>
            </h1>
            <p className="text-lg text-slate-400">
              The sports alert app built for bettors. Know when your spread is live,
              when to tune in, and when the game is over — without watching every minute.
            </p>
          </div>

          <a
            href={downloadUrl}
            className="inline-flex items-center gap-3 rounded-2xl bg-orange-500 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600 active:scale-95"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            Download on the App Store
          </a>

          <p className="text-xs text-slate-500">
            Free download. No subscription required.{referralCode && " Install attributed to your referral."}
          </p>

          {/* Value props */}
          <div className="grid gap-4 pt-8 sm:grid-cols-3">
            {VALUE_PROPS.map((prop) => (
              <div
                key={prop.headline}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-left"
              >
                <div className="mb-3 text-3xl">{prop.icon}</div>
                <h3 className="mb-2 font-semibold text-white">{prop.headline}</h3>
                <p className="text-sm text-slate-400">{prop.body}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
            <p className="text-sm text-slate-400">
              Watch NORMA is free to download. Your {provider.name} bets are tracked
              privately on your device. NORMA never shares your wagering data with any third party.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-800 px-6 py-4 text-center text-xs text-slate-600">
        <Link href="/" className="hover:text-slate-400">getnorma.app</Link>
        {" · "}
        <Link href="/privacy" className="hover:text-slate-400">Privacy</Link>
        {" · "}
        <Link href="/terms" className="hover:text-slate-400">Terms</Link>
      </footer>
    </div>
  );
}
