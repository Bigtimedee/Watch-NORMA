import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NORMA Advertising — 12-18% CTR Push Notification Ads for Sports Fans",
  description:
    "Reach sports bettors at the exact moment their bet is covering. Self-serve ad platform with second-price auction, AI creative optimization, and $0.10 floor prices. No minimum spend.",
  openGraph: {
    title: "NORMA Advertising — 12-18% CTR. Not a Typo.",
    description:
      "Your ad inside the push notification that creates the viewer. Self-serve portal, second-price auction, Thompson Sampling creative optimization. Start with $25/day.",
  },
};

export default function AdvertisersPage() {
  return (
    <div className="min-h-screen">
      {/* Public Nav */}
      <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/">
            <img src="/logo.png" alt="NORMA" className="h-10 w-auto" />
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
          NORMA Advertising
        </p>
        <h1 className="mt-4 text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">
          12-18% CTR. Not a Typo.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          NORMA doesn&apos;t interrupt attention. It creates it. Your brand appears inside the
          push notification that brings a fan back to a live game. Not a banner. Not a pre-roll.{" "}
          <strong className="text-white">The moment itself.</strong>
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
            Banners and pre-rolls fight for attention that&apos;s already somewhere else.
            NORMA owns the push notification that creates the viewer. Your ad is the reason
            a fan picks up their phone, not the thing they skip past.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "The Push Notification Is the Ad Unit",
                description:
                  "Your brand lives inside the alert that makes someone grab their phone. Not beside it, not after it. Inside it. That's why CTRs run 10-50x higher than display.",
              },
              {
                title: "You're Buying Intent, Not Impressions",
                description:
                  "Every viewer has money on the line. A spread covering, a prop hitting, a prediction resolving. They don't just see your ad. They act on it.",
              },
              {
                title: "11 Moment Types, Each Priced Differently",
                description:
                  "Bid on overtime moments, bet resolutions, spread crossings, or close games. Higher-intent moments cost more and convert more. You choose where your budget goes.",
              },
              {
                title: "No Wasted Spend",
                description:
                  "You only pay the minimum needed to win each impression. Floor prices start at $0.10. Average CPAs run 3-5x lower than social ads for sportsbook install campaigns.",
              },
              {
                title: "Self-Optimizing Creatives",
                description:
                  "Upload multiple variants. NORMA automatically shifts traffic to the one that converts best. No manual A/B test management. Just upload and let it run.",
              },
              {
                title: "Privacy-First by Design",
                description:
                  "No individual user data exposed. All targeting is cohort-based, all reporting is aggregate. Built for the post-IDFA world. Users can opt out entirely.",
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
            command higher floor prices and deliver higher conversion rates.
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
                  { name: "Bet Resolved", desc: "User's wager just settled, win or lose", floor: "$0.50", ctr: "12-18%" },
                  { name: "Prediction Resolved", desc: "Prediction market position just resolved", floor: "$0.60", ctr: "14-20%" },
                  { name: "Overtime", desc: "Game goes to extra time, peak adrenaline", floor: "$0.40", ctr: "10-15%" },
                  { name: "Close Game", desc: "Within 6 points, final 5 minutes", floor: "$0.35", ctr: "8-14%" },
                  { name: "Spread Alert", desc: "User's spread line is being crossed", floor: "$0.30", ctr: "8-12%" },
                  { name: "Moneyline Alert", desc: "Moneyline outcome flipping", floor: "$0.30", ctr: "7-11%" },
                  { name: "Total Alert", desc: "Over/under pace changing", floor: "$0.25", ctr: "6-10%" },
                  { name: "Prop Alert", desc: "Player prop stat line in play", floor: "$0.25", ctr: "6-9%" },
                  { name: "Position Alert", desc: "Prediction market position at risk", floor: "$0.20", ctr: "5-8%" },
                  { name: "Foul Trouble", desc: "Key starter picks up 4th foul", floor: "$0.15", ctr: "4-7%" },
                  { name: "Follow Alert", desc: "Team follower with no financial stake", floor: "$0.10", ctr: "3-5%" },
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
          <h2 className="text-3xl font-bold text-white">How You Win Impressions</h2>
          <p className="mt-4 max-w-3xl text-slate-400">
            Every push notification triggers a real-time auction. The winning ad appears inside the
            alert, and you never pay more than one cent above the next highest bid.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: "1",
                title: "Moment Fires",
                description: "A fan's bet is covering, their team hits overtime, or a prediction is about to resolve.",
              },
              {
                step: "2",
                title: "Your Campaigns Match",
                description: "NORMA finds all campaigns targeting this moment type, sport, and audience segment.",
              },
              {
                step: "3",
                title: "Floor Check",
                description: "Bids below the moment's floor price are filtered out. Higher-intent moments have higher floors.",
              },
              {
                step: "4",
                title: "You Pay Second Price",
                description:
                  "Highest bid wins but only pays the second highest bid plus $0.01. Bid your true value. The system protects you from overpaying.",
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
          <h2 className="text-3xl font-bold text-white">Set It and Let It Run</h2>
          <p className="mt-4 max-w-3xl text-slate-400">
            NORMA&apos;s engine continuously optimizes your campaigns so you don&apos;t have to.
          </p>

          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            {[
              {
                title: "Auto-Winning Creatives",
                description:
                  "Upload multiple variants. NORMA automatically shifts traffic to the one with the highest CTR. Most campaigns find a winner within the first 200 impressions.",
              },
              {
                title: "CPA-Based Bidding",
                description:
                  "Set a target cost-per-action and NORMA adjusts your bids every 30 minutes based on real conversion data. Stay on target without constant monitoring.",
              },
              {
                title: "Smart Budget Pacing",
                description:
                  "Daily caps prevent blowing your budget during one high-traffic window. Hourly pacing distributes spend evenly across each day's games.",
              },
              {
                title: "Floor Price Optimizer",
                description:
                  "NORMA recommends floor-beating bids based on historical win rates for each moment type. See exactly where your bid sits relative to the competitive field.",
              },
              {
                title: "Fatigue Protection",
                description:
                  "NORMA tracks per-user ad exposure and automatically withholds your ad when a user has seen too many recently. Protects your brand and your CTR.",
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
              <strong className="text-slate-200">Affiliate attribution</strong>: Track which impressions
              drive wager placements. Configurable attribution windows and postback URLs.
            </p>
            <p className="mt-3">
              <strong className="text-slate-200">Branded CTAs</strong>: Your brand colors, your logo,
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
            Launch, manage, and optimize campaigns in one dashboard. No sales calls required.
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
              <img src="/logo.png" alt="NORMA" className="h-8 w-auto" />
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
