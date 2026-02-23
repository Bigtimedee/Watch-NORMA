import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Public Nav */}
      <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/">
            <img src="/logo.png" alt="NORMA" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/advertisers" className="text-sm font-medium text-slate-300 hover:text-white">
              Advertisers
            </Link>
            <Link
              href="/auth/login"
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Advertiser Login
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-24 pb-20 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-orange-400">
          Real-Time Sports Intent Advertising
        </p>
        <h1 className="mt-4 text-5xl font-black leading-tight text-white sm:text-6xl lg:text-7xl">
          The Perfect Moment<br />to Watch. The Perfect<br />Moment to Advertise.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          NORMA tells fans exactly when to tune in to the games they care about most —
          driven by their wagers, predictions, and team loyalties. For brands, it&apos;s
          access to the most engaged sports audience on the planet.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href="#download"
            className="rounded-xl bg-white px-8 py-3.5 text-base font-bold text-slate-950 shadow-lg hover:bg-slate-100"
          >
            Download the App
          </a>
          <Link
            href="/advertisers"
            className="rounded-xl border border-orange-500 px-8 py-3.5 text-base font-bold text-orange-400 hover:bg-orange-500/10"
          >
            Advertise with NORMA
          </Link>
        </div>
      </section>

      {/* How It Works — Fans */}
      <section className="border-t border-slate-800 bg-slate-900/50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-orange-400">For Fans</p>
          <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
            Never miss the moment that matters
          </h2>
          <p className="mt-4 max-w-2xl text-slate-400">
            Connect your sportsbook, prediction markets, and favorite teams. NORMA&apos;s
            Perfect Moment Engine watches every game and alerts you at the exact moment
            your interests are on the line.
          </p>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {[
              {
                step: "01",
                title: "Connect Your Interests",
                description:
                  "Link your DraftKings, FanDuel, Kalshi, or Polymarket accounts. Follow your favorite teams and players.",
              },
              {
                step: "02",
                title: "Live Your Life",
                description:
                  "You don't need to watch every minute. Go about your day while NORMA monitors every game in real time.",
              },
              {
                step: "03",
                title: "Tune In at the Perfect Moment",
                description:
                  "Get a push notification when your bet is covering, the spread is shifting, or your team's game goes to overtime.",
              },
            ].map((item) => (
              <div key={item.step} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <span className="text-3xl font-black text-orange-500">{item.step}</span>
                <h3 className="mt-4 text-lg font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Moment Types */}
      <section className="border-t border-slate-800 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-orange-400">
            Powered by the Perfect Moment Engine
          </p>
          <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
            10 moment types. Zero noise.
          </h2>
          <p className="mt-4 max-w-2xl text-slate-400">
            Every notification is scored and ranked by relevance to YOU. No spam, no box scores,
            no generic updates. Only moments that matter to your money and your teams.
          </p>

          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { name: "Bet Resolved", emoji: "💰" },
              { name: "Close Game", emoji: "🔥" },
              { name: "Overtime", emoji: "⏱" },
              { name: "Spread Alert", emoji: "📊" },
              { name: "Moneyline Alert", emoji: "📈" },
              { name: "Total Alert", emoji: "🏀" },
              { name: "Prop Alert", emoji: "🎯" },
              { name: "Position Alert", emoji: "📉" },
              { name: "Foul Trouble", emoji: "🚨" },
              { name: "Follow Alert", emoji: "⭐" },
            ].map((mt) => (
              <div
                key={mt.name}
                className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"
              >
                <span className="text-xl">{mt.emoji}</span>
                <span className="text-sm font-medium text-white">{mt.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works — Advertisers */}
      <section className="border-t border-slate-800 bg-slate-900/50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-orange-400">
            For Advertisers
          </p>
          <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
            Reach fans at peak engagement
          </h2>
          <p className="mt-4 max-w-2xl text-slate-400">
            NORMA&apos;s advertising marketplace lets you bid on the exact moments when fans are
            most emotionally invested. Second-price auction. Privacy-first. Self-serve.
          </p>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {[
              {
                title: "Intent-Based Targeting",
                description:
                  "Target users who hold active wagers, prediction positions, or team loyalties. Not demographics — actual financial interest.",
              },
              {
                title: "Second-Price Auction",
                description:
                  "You only pay the minimum needed to win each impression. No overpaying. Transparent floor prices by moment type.",
              },
              {
                title: "Privacy by Design",
                description:
                  "Advertisers never see individual user data. All reporting is aggregate. Cohort-level targeting only. Users can opt out.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h3 className="text-lg font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{item.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/advertisers"
              className="rounded-xl bg-orange-500 px-8 py-3.5 text-base font-bold text-white hover:bg-orange-600"
            >
              Learn More About Advertising
            </Link>
          </div>
        </div>
      </section>

      {/* Download Section */}
      <section id="download" className="border-t border-slate-800 py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Get NORMA on your iPhone
          </h2>
          <p className="mt-4 text-slate-400">
            Available for iPhone and iPad. Connect your sportsbooks, prediction markets,
            and favorite teams. Start getting notified at the perfect moment.
          </p>
          <div className="mt-8">
            <a
              href="#"
              className="inline-flex items-center gap-3 rounded-2xl bg-white px-8 py-4 text-slate-950 shadow-lg hover:bg-slate-100"
            >
              <svg className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              <div className="text-left">
                <p className="text-xs font-medium text-slate-500">Coming Soon on the</p>
                <p className="text-lg font-bold">App Store</p>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/50 py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div>
              <img src="/logo.png" alt="NORMA" className="h-8 w-auto" />
              <p className="mt-1 text-sm text-slate-500">Real-Time Sports Intent Advertising</p>
            </div>
            <div className="flex gap-6 text-sm text-slate-400">
              <Link href="/advertisers" className="hover:text-white">Advertisers</Link>
              <Link href="/auth/login" className="hover:text-white">Advertiser Portal</Link>
              <a href="mailto:support@norma-app.com" className="hover:text-white">Contact</a>
            </div>
          </div>
          <p className="mt-8 text-center text-xs text-slate-600">
            &copy; {new Date().getFullYear()} NORMA. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
