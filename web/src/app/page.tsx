import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/">
            <img src="/logo.png" alt="NORMA" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-6">
            <a href="#advertisers" className="text-sm font-medium text-slate-300 hover:text-white">
              Advertisers
            </a>
            <Link
              href="/auth/login"
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Advertiser Portal
            </Link>
          </div>
        </div>
      </nav>

      {/* ============================================ */}
      {/* HERO — User-first: logo, tagline, download  */}
      {/* ============================================ */}
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-16 text-center">
        <img src="/logo.png" alt="NORMA" className="mx-auto h-28 w-auto sm:h-36" />
        <h1 className="mt-8 text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">
          Watch at the Perfect Moment.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
          NORMA monitors every live game and tells you exactly when to tune in — based on
          your wagers, your predictions, and the teams you follow. No more staring at screens
          waiting for something to happen. NORMA watches so you don&apos;t have to.
        </p>

        {/* App Store Buttons */}
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href="#"
            className="inline-flex items-center gap-3 rounded-2xl bg-white px-8 py-4 text-slate-950 shadow-lg hover:bg-slate-100 transition-colors"
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
        <p className="mt-4 text-sm text-slate-600">iPhone &amp; iPad. Free to download.</p>
      </section>

      {/* ============================================ */}
      {/* HOW IT WORKS — 3 steps                      */}
      {/* ============================================ */}
      <section className="border-t border-slate-800 bg-slate-900/50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">
            How NORMA Works
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-400">
            Three steps. Then go live your life.
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

      {/* ============================================ */}
      {/* VIDEO DEMOS — placeholder for 2-4 videos    */}
      {/* ============================================ */}
      <section className="border-t border-slate-800 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">
            See NORMA in Action
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-400">
            Watch how NORMA delivers the perfect moment — from bet placement to buzzer-beater notification.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {[
              { title: "Your Spread Is Live", description: "See how NORMA alerts you when your bet line is being crossed in real time." },
              { title: "Overtime. You Need to Watch.", description: "A game you wagered on goes to OT. NORMA gets you there instantly." },
              { title: "From Couch to Cash", description: "How a Kalshi prediction holder gets the perfect tune-in moment." },
              { title: "The Full Experience", description: "End-to-end: connect, wager, wait, get notified, tune in, win." },
            ].map((video) => (
              <div
                key={video.title}
                className="group relative flex aspect-video items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden"
              >
                {/* Play button overlay */}
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/20 border border-orange-500/40">
                    <svg className="h-8 w-8 text-orange-500 ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <div className="text-center px-6">
                    <p className="font-semibold text-white">{video.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{video.description}</p>
                  </div>
                </div>
                <div className="absolute bottom-3 right-3">
                  <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-500">Coming Soon</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* MOMENT TYPES                                */}
      {/* ============================================ */}
      <section className="border-t border-slate-800 bg-slate-900/50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">
            10 Moment Types. Zero Noise.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-400">
            Every notification is scored and ranked by relevance to you. No spam, no box scores,
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

      {/* ============================================ */}
      {/* ADVERTISERS SECTION                         */}
      {/* ============================================ */}
      <section id="advertisers" className="border-t-2 border-orange-500/30 py-24">
        <div className="mx-auto max-w-5xl px-6">
          {/* Bold positioning statement */}
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-orange-400">
              For Advertisers
            </p>
            <h2 className="mt-6 text-3xl font-black leading-snug text-white sm:text-4xl lg:text-5xl">
              NORMA Captures Intent<br className="hidden sm:block" /> for Live Sports.
            </h2>
          </div>

          <div className="mt-12 space-y-8 text-lg leading-relaxed text-slate-300">
            <p>
              NORMA monetizes something the dominant ad platforms cannot:{" "}
              <strong className="text-white">the exact moment a fan suddenly cares.</strong>{" "}
              Incumbents like Google, Meta Platforms, and The Trade Desk optimize for reach,
              targeting, and historical behavior, but they largely miss real-time intent
              inside live sports. NORMA sits directly in that gap.
            </p>
            <p>
              By combining live game data, streaming access, and a user&apos;s existing wagers,
              NORMA identifies when attention spikes — a comeback, a milestone, a bet on the
              line — and turns that moment into{" "}
              <strong className="text-white">premium advertising inventory.</strong>{" "}
              Brands are not buying impressions; they are buying certainty that a viewer is
              about to tune in and act.
            </p>
            <p>
              The companies that benefit most are those whose revenue depends on that moment:
              sportsbooks like <strong className="text-white">DraftKings</strong> and{" "}
              <strong className="text-white">FanDuel</strong>, streamers such as{" "}
              <strong className="text-white">YouTube TV</strong>,{" "}
              <strong className="text-white">Amazon Prime Video</strong>, and{" "}
              <strong className="text-white">Peacock</strong>, and commerce platforms like{" "}
              <strong className="text-white">Fanatics</strong> that monetize fan emotion
              immediately after outcomes occur.
            </p>
            <p>
              NORMA becomes the decision layer that routes viewers, wagers, and spending at
              the precise second value is highest.{" "}
              <strong className="text-orange-400">
                Just as search captured intent for the web, NORMA captures intent for live
                sports
              </strong>{" "}
              — positioning it to build a marketplace measured in billions rather than impressions.
            </p>
          </div>
        </div>
      </section>

      {/* Advertiser Features */}
      <section className="border-t border-slate-800 bg-slate-900/50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">
            The Self-Serve Advertising Platform
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-400">
            Create campaigns, set targeting, manage bids, and track performance — all from your browser.
          </p>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {[
              {
                title: "Intent-Based Targeting",
                description:
                  "Target users who hold active wagers, prediction positions, or team loyalties. Not demographics — actual financial interest in the outcome.",
              },
              {
                title: "Second-Price Auction",
                description:
                  "Vickrey auction mechanics. You only pay the minimum needed to win each impression. Transparent floor prices by moment type.",
              },
              {
                title: "Privacy by Architecture",
                description:
                  "Advertisers never see individual user data. All targeting is cohort-based. All reporting is aggregate. Users can opt out entirely.",
              },
              {
                title: "AI Creative Optimization",
                description:
                  "Upload multiple creative variants. Thompson Sampling automatically shifts traffic to the highest-performing variant.",
              },
              {
                title: "Auto-Bidding & Pacing",
                description:
                  "Set a target CPA and let NORMA adjust bids in real time. Daily budget pacing prevents overspend during high-traffic windows.",
              },
              {
                title: "Sportsbook Deep Links",
                description:
                  "Game-contextual deep links take users from alert straight into DraftKings, FanDuel, BetMGM, or ESPN BET with the right game loaded.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h3 className="text-lg font-bold text-white">{item.title}</h3>
                <p className="mt-3 text-sm text-slate-400">{item.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/auth/signup"
              className="rounded-xl bg-orange-500 px-8 py-3.5 text-base font-bold text-white hover:bg-orange-600"
            >
              Create Advertiser Account
            </Link>
            <Link
              href="/advertisers"
              className="rounded-xl border border-slate-700 px-8 py-3.5 text-base font-bold text-slate-300 hover:border-slate-500 hover:text-white"
            >
              Learn More
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div>
              <img src="/logo.png" alt="NORMA" className="h-8 w-auto" />
              <p className="mt-1 text-sm text-slate-500">Real-Time Sports Intent Advertising</p>
            </div>
            <div className="flex gap-6 text-sm text-slate-400">
              <a href="#advertisers" className="hover:text-white">Advertisers</a>
              <Link href="/auth/login" className="hover:text-white">Advertiser Portal</Link>
              <a href="mailto:ads@norma-app.com" className="hover:text-white">Contact</a>
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
