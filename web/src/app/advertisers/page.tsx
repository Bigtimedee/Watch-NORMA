import Link from "next/link";

export default function AdvertisersPage() {
  return (
    <div className="min-h-screen">
      {/* Public Nav */}
      <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-black text-orange-500">
            NORMA
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/advertisers" className="text-sm font-medium text-white">
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
      <section className="mx-auto max-w-6xl px-6 pt-24 pb-16 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-orange-400">
          NORMA Advertising Marketplace
        </p>
        <h1 className="mt-4 text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">
          Advertise at the Exact Moment<br />Fans Care Most
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          NORMA&apos;s Perfect Moment Engine identifies the precise instant a live game becomes
          emotionally critical to each fan — based on their real wagers, prediction positions,
          and team loyalties. Your brand appears right there.
        </p>
        <div className="mt-8">
          <Link
            href="/auth/signup"
            className="rounded-xl bg-orange-500 px-8 py-3.5 text-base font-bold text-white hover:bg-orange-600"
          >
            Create Your Advertiser Account
          </Link>
        </div>
      </section>

      {/* What Makes NORMA Different */}
      <section className="border-t border-slate-800 bg-slate-900/50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-bold text-white">This isn&apos;t display advertising.</h2>
          <p className="mt-4 max-w-3xl text-slate-400">
            Traditional sports ads buy impressions against pageviews, pre-rolls, or banner placements.
            NORMA sells access to the moment a fan&apos;s attention peaks — when their money is on the line,
            their team is in overtime, or their prediction is about to resolve.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Intent, Not Demographics",
                description:
                  "Target users based on what they've wagered, predicted, and followed — not their age or location. A user with $500 on Duke -3.5 is more valuable than 10,000 random impressions.",
              },
              {
                title: "Moment-Level Precision",
                description:
                  "Choose exactly which moments trigger your ad: overtime, close games, bet resolutions, spread crossings. 10 distinct moment types, each with different floor prices and engagement profiles.",
              },
              {
                title: "Push Notification Placement",
                description:
                  "Your brand appears in the push notification that brings the fan back to the game. Not a banner they scroll past — the alert that makes them grab their phone.",
              },
              {
                title: "Second-Price Auction",
                description:
                  "Vickrey auction mechanics mean you only pay the minimum needed to win each impression. Bid your true value; the system ensures you never overpay.",
              },
              {
                title: "Privacy by Architecture",
                description:
                  "You never see individual user data. All targeting is cohort-based. All reporting is aggregate. Users can opt out entirely. Built for the post-IDFA world.",
              },
              {
                title: "Self-Serve Portal",
                description:
                  "Create campaigns, set targeting, manage bids, upload creatives, and track performance — all from your browser. No sales calls required to get started.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h3 className="text-lg font-bold text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Moment Types + Pricing */}
      <section className="border-t border-slate-800 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-bold text-white">Moment Types &amp; Floor Prices</h2>
          <p className="mt-4 max-w-3xl text-slate-400">
            Each moment type represents a different level of fan engagement. Higher-intent moments
            command higher floor prices — and deliver higher conversion rates.
          </p>

          <div className="mt-10 overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase text-slate-400">
                    Moment Type
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase text-slate-400">
                    Description
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase text-slate-400">
                    Floor Price
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase text-slate-400">
                    Typical CTR
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {[
                  { name: "Bet Resolved", desc: "User's wager just settled — win or lose", floor: "$0.50", ctr: "12-18%" },
                  { name: "Overtime", desc: "Game goes to extra time — peak adrenaline", floor: "$0.40", ctr: "10-15%" },
                  { name: "Close Game", desc: "Within 6 points, final 5 minutes", floor: "$0.35", ctr: "8-14%" },
                  { name: "Spread Alert", desc: "User's spread line is being crossed", floor: "$0.30", ctr: "8-12%" },
                  { name: "Moneyline Alert", desc: "Moneyline outcome flipping", floor: "$0.30", ctr: "7-11%" },
                  { name: "Total Alert", desc: "Over/under pace changing", floor: "$0.25", ctr: "6-10%" },
                  { name: "Prop Alert", desc: "Player prop stat line in play", floor: "$0.25", ctr: "6-9%" },
                  { name: "Position Alert", desc: "Prediction market position at risk", floor: "$0.20", ctr: "5-8%" },
                  { name: "Foul Trouble", desc: "Key starter picks up 4th foul", floor: "$0.15", ctr: "4-7%" },
                  { name: "Follow Alert", desc: "Team follower — no financial stake", floor: "$0.10", ctr: "3-5%" },
                ].map((m) => (
                  <tr key={m.name} className="hover:bg-slate-900/50">
                    <td className="px-6 py-4 font-medium text-white">{m.name}</td>
                    <td className="px-6 py-4 text-sm text-slate-400">{m.desc}</td>
                    <td className="px-6 py-4 text-right font-mono text-sm text-orange-400">{m.floor}</td>
                    <td className="px-6 py-4 text-right text-sm text-slate-300">{m.ctr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-sm text-slate-500">
            Floor prices reflect base rates. Dynamic premiums apply during high-traffic windows
            (tournament games, weekends, simultaneous live games).
          </p>
        </div>
      </section>

      {/* How the Auction Works */}
      <section className="border-t border-slate-800 bg-slate-900/50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-bold text-white">How the Auction Works</h2>
          <p className="mt-4 max-w-3xl text-slate-400">
            Every time NORMA fires a push notification, a real-time auction determines which
            advertiser&apos;s sponsorship appears alongside it.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: "1",
                title: "Moment Fires",
                description: "The Perfect Moment Engine detects a significant game event for a user.",
              },
              {
                step: "2",
                title: "Eligible Bids",
                description: "All campaigns matching the moment type, segment, and game are gathered.",
              },
              {
                step: "3",
                title: "Floor Check",
                description: "Bids below the moment type's floor price (with dynamic premium) are filtered out.",
              },
              {
                step: "4",
                title: "Winner Pays Second Price",
                description:
                  "Highest bid wins. Pays only the second-highest bid + $0.01 (or the floor, whichever is higher).",
              },
            ].map((item) => (
              <div key={item.step} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-lg font-bold text-white">
                  {item.step}
                </span>
                <h3 className="mt-4 text-lg font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Features */}
      <section className="border-t border-slate-800 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-bold text-white">Built-In Intelligence</h2>
          <p className="mt-4 max-w-3xl text-slate-400">
            NORMA&apos;s ad engine continuously optimizes your campaigns without manual tuning.
          </p>

          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            {[
              {
                title: "A/B Creative Testing",
                description:
                  "Upload multiple creative variants. NORMA uses Thompson Sampling to automatically shift traffic to the highest-performing variant — no manual analysis needed.",
              },
              {
                title: "Auto-Bidding",
                description:
                  "Set a target CPA and let NORMA adjust your bids every 30 minutes based on observed conversion rates. Stay within your target without constant monitoring.",
              },
              {
                title: "Budget Pacing",
                description:
                  "Daily budget caps prevent blowing your entire budget in one high-traffic window. Hourly pacing distributes spend evenly across each day's games.",
              },
              {
                title: "Fatigue Protection",
                description:
                  "NORMA tracks per-user ad fatigue and automatically withholds your sponsorship when a user has seen too many ads recently. Protects your brand and CTR.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h3 className="text-lg font-bold text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sportsbook Integrations */}
      <section className="border-t border-slate-800 bg-slate-900/50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-bold text-white">Deep Sportsbook Integrations</h2>
          <p className="mt-4 max-w-3xl text-slate-400">
            If you&apos;re a sportsbook, NORMA offers game-contextual deep links that take users
            from a live-game alert straight into your app with the right game pre-loaded.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-5">
            {["DraftKings", "FanDuel", "BetMGM", "Caesars", "ESPN BET"].map((name) => (
              <div
                key={name}
                className="flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900 py-6 text-sm font-semibold text-slate-300"
              >
                {name}
              </div>
            ))}
          </div>

          <div className="mt-8 max-w-3xl text-sm text-slate-400">
            <p>
              <strong className="text-slate-200">Affiliate attribution</strong> — Track which impressions
              drive wager placements. Configurable attribution windows and postback URLs.
            </p>
            <p className="mt-3">
              <strong className="text-slate-200">Branded CTAs</strong> — Your brand colors, your logo,
              your deep link. &quot;Bet Now on DraftKings&quot; rendered natively in the alert card.
            </p>
          </div>
        </div>
      </section>

      {/* Self-Serve Portal Preview */}
      <section className="border-t border-slate-800 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-bold text-white">Self-Serve Advertiser Portal</h2>
          <p className="mt-4 max-w-3xl text-slate-400">
            Everything you need to launch, manage, and optimize campaigns — in one dashboard.
          </p>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: "Campaign Creation Wizard", desc: "5-step guided setup: basics, targeting, bidding, creatives, review." },
              { title: "Real-Time Dashboard", desc: "Impressions, CTR, CPA, and spend updated every 15 minutes." },
              { title: "Bid Management", desc: "Set bids per moment type with floor price indicators and win rate tracking." },
              { title: "Creative A/B Testing", desc: "Upload variants, see which performs best, auto-optimize." },
              { title: "Inventory Forecasting", desc: "7-day supply forecast by moment type. Plan campaigns around live schedules." },
              { title: "Cross-Campaign Analytics", desc: "Compare performance across campaigns. Engagement funnel visualization." },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <h3 className="font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-800 bg-slate-900/50 py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Ready to reach fans at their most engaged?
          </h2>
          <p className="mt-4 text-slate-400">
            Create your free advertiser account. Set up your first campaign in minutes.
            No minimum spend required.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/auth/signup"
              className="rounded-xl bg-orange-500 px-8 py-3.5 text-base font-bold text-white hover:bg-orange-600"
            >
              Create Advertiser Account
            </Link>
            <a
              href="mailto:ads@norma-app.com"
              className="rounded-xl border border-slate-700 px-8 py-3.5 text-base font-bold text-slate-300 hover:border-slate-500 hover:text-white"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div>
              <span className="text-lg font-black text-orange-500">NORMA</span>
              <p className="mt-1 text-sm text-slate-500">Real-Time Sports Intent Advertising</p>
            </div>
            <div className="flex gap-6 text-sm text-slate-400">
              <Link href="/" className="hover:text-white">Home</Link>
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
