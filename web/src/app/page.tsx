import Link from "next/link";
import { WaitlistForm } from "@/components/waitlist-form";

export const dynamic = "force-dynamic";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "MobileApplication",
  name: "NORMA: Sports Alerts & Scores",
  operatingSystem: "iOS",
  applicationCategory: "SportsApplication",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  aggregateRating: { "@type": "AggregateRating", ratingValue: "5.0", ratingCount: "1" },
  description:
    "Live game notifications for sports bettors and fans. Track NBA, MLB, NCAA wagers, parlays, and prediction markets. Never miss the moment that matters.",
  url: "https://apps.apple.com/us/app/watch-norma/id6759508383",
};

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Nav */}
      <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/">
            <img src="/logo.png" alt="NORMA" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-6">
            <a
              href="https://apps.apple.com/us/app/watch-norma/id6759508383"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-slate-300 hover:text-white"
            >
              Download App
            </a>
            <a href="#advertisers" className="text-sm font-medium text-slate-300 hover:text-white">
              Advertisers
            </a>
            <Link
              href="/auth"
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
          Your wagers and predictions tell NORMA exactly what matters to you. When your
          bet is about to cover, your prediction is resolving, or your team forces overtime,
          she pulls you into the action. No producer deciding what&apos;s important. No algorithm
          guessing. Just your money, your interests, your perfect moment.
        </p>

        {/* App Store Button */}
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href="https://apps.apple.com/us/app/watch-norma/id6759508383"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src="/app-store-badge.svg"
              alt="Download on the App Store"
              className="h-14 w-auto"
            />
          </a>
        </div>
        <p className="mt-4 text-sm text-slate-600">iPhone. Free to download. No account required to start.</p>

        {/* Social Proof Bar */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="text-orange-400">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
            <span className="text-slate-400">5.0 on the App Store</span>
          </span>
          <span className="hidden sm:inline text-slate-700">|</span>
          <span className="text-slate-400">NBA + MLB + NCAA Basketball</span>
          <span className="hidden sm:inline text-slate-700">|</span>
          <span className="text-slate-400">11 Alert Types</span>
        </div>
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
                title: "Tell NORMA What You Care About",
                description:
                  "Link your sportsbook and prediction market accounts. Follow your favorite teams. Your wagers and predictions tell NORMA exactly what matters to you.",
              },
              {
                step: "02",
                title: "Go Live Your Life",
                description:
                  "No producer. No algorithm guessing what you might like. NORMA already knows because you told her with your money. She watches every game so you don\u2019t have to.",
              },
              {
                step: "03",
                title: "Tune In When It Matters to You",
                description:
                  "Your bet is about to cover. Your prediction is resolving. Your team just forced overtime. NORMA sends you there at the exact moment that\u2019s personal to you.",
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
            Watch how NORMA delivers the perfect moment, from bet placement to buzzer-beater notification.
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
            11 Moment Types. Zero Noise.
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
              { name: "Prediction Resolved", emoji: "🏆" },
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
      {/* USE CASES — drive home the value prop        */}
      {/* ============================================ */}
      <section className="border-t border-slate-800 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">
            Built for How You Actually Watch Sports
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-400">
            You have money on the line and a life to live. NORMA watches so you don&apos;t have to.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                emoji: "🎰",
                title: "Sports Bettors",
                description:
                  "Your 3-leg parlay is live. Two legs hit. NORMA alerts you the moment the third is in play. DraftKings, FanDuel, BetMGM — scan your slip or enter manually.",
              },
              {
                emoji: "📊",
                title: "Prediction Markets",
                description:
                  "Your Kalshi position is about to resolve. NORMA connects to your account and alerts you when outcomes shift. Watch the final moments unfold live.",
              },
              {
                emoji: "🏀",
                title: "Team Fans",
                description:
                  "No bet, no problem. Follow your teams and NORMA tells you when they force overtime, close a 14-point deficit, or pull off a buzzer-beater.",
              },
              {
                emoji: "📱",
                title: "Cord-Cutters",
                description:
                  "NORMA tells you WHERE to watch, not just when. One tap opens the game on YouTube TV, ESPN+, Peacock, or whatever service you use.",
              },
              {
                emoji: "🏈",
                title: "Multi-Sport Fans",
                description:
                  "NBA playoffs, MLB full season, March Madness — hundreds of games happening simultaneously. NORMA tells you which ones matter to you right now.",
              },
              {
                emoji: "💼",
                title: "Busy Professionals",
                description:
                  "You can\u2019t watch every game. You can\u2019t even watch most games. NORMA respects your time and only interrupts when it truly matters.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <span className="text-3xl">{item.emoji}</span>
                <h3 className="mt-3 text-lg font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{item.description}</p>
              </div>
            ))}
          </div>

          {/* Second CTA for downloads */}
          <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href="https://apps.apple.com/us/app/watch-norma/id6759508383"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src="/app-store-badge.svg"
                alt="Download on the App Store"
                className="h-12 w-auto"
              />
            </a>
            <p className="text-sm text-slate-500">Free. No credit card. No account required to start.</p>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* WAITLIST — Email capture                    */}
      {/* ============================================ */}
      <section className="border-t border-slate-800 bg-slate-900/50 py-20">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Be first to know when Watch-NORMA launches near you
          </h2>
          <p className="mx-auto mt-4 text-slate-400">
            We&apos;re rolling out to new markets and adding Android support. Drop your email
            and we&apos;ll let you know the moment NORMA is ready for you.
          </p>
          <div className="mt-8">
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* ADVERTISERS SECTION                         */}
      {/* ============================================ */}
      <section id="advertisers" className="border-t-2 border-orange-500/30 py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-orange-400">
              For Advertisers
            </p>
            <h2 className="mt-6 text-3xl font-black leading-snug text-white sm:text-4xl lg:text-5xl">
              The Highest-Intent Ad Unit<br className="hidden sm:block" /> in Sports
            </h2>
          </div>

          <div className="mt-12 space-y-6 text-lg leading-relaxed text-slate-300 max-w-3xl mx-auto">
            <p>
              <strong className="text-white">CTRs 10-50x higher than display.</strong>{" "}
              NORMA doesn&apos;t interrupt attention. It creates it. Every ad runs inside the push
              notification that brings a fan back to a live game they care about.
            </p>
            <p>
              Banners and pre-rolls fight for eyeballs that are already elsewhere.{" "}
              <strong className="text-orange-400">
                NORMA owns the moment that creates the viewer.
              </strong>{" "}
              Your brand is the reason they pick up their phone, not the thing they skip past.
            </p>
          </div>
        </div>
      </section>

      {/* Advertiser Features */}
      <section className="border-t border-slate-800 bg-slate-900/50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mt-0 grid gap-8 sm:grid-cols-3">
            {[
              {
                title: "The Push Notification Ad Unit",
                description:
                  "Your brand appears inside the alert that makes a fan grab their phone. Not a banner they scroll past. The notification that creates the viewer. 12-18% CTR on bet resolution moments.",
              },
              {
                title: "Pay-Per-Moment Pricing",
                description:
                  "Bid on specific moment types like overtime, spread crossings, and bet resolutions. Floor prices from $0.10 to $0.50. You only pay what the moment is worth.",
              },
              {
                title: "Self-Optimizing Engine",
                description:
                  "Upload multiple creatives and NORMA automatically shifts traffic to the winner. Set a target CPA and bids adjust every 30 minutes. No manual tuning required.",
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
              href="/auth"
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
              <Link href="/auth" className="hover:text-white">Advertiser Portal</Link>
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
