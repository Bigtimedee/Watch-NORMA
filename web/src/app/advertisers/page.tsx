import Link from "next/link";
import type { Metadata } from "next";
import { StatCounter } from "@/components/stat-counter";

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

const momentRows = [
  { name: "Prediction Resolved", desc: "Prediction market position just resolved", floor: "$0.60", ctr: "14–20%", ctrMax: 20 },
  { name: "Bet Resolved", desc: "User's wager just settled, win or lose", floor: "$0.50", ctr: "12–18%", ctrMax: 18 },
  { name: "Overtime", desc: "Game goes to extra time, peak adrenaline", floor: "$0.40", ctr: "10–15%", ctrMax: 15 },
  { name: "Close Game", desc: "Within 6 points, final 5 minutes", floor: "$0.35", ctr: "8–14%", ctrMax: 14 },
  { name: "Spread Alert", desc: "User's spread line is being crossed", floor: "$0.30", ctr: "8–12%", ctrMax: 12 },
  { name: "Moneyline Alert", desc: "Moneyline outcome flipping", floor: "$0.30", ctr: "7–11%", ctrMax: 11 },
  { name: "Total Alert", desc: "Over/under pace changing", floor: "$0.25", ctr: "6–10%", ctrMax: 10 },
  { name: "Prop Alert", desc: "Player prop stat line in play", floor: "$0.25", ctr: "6–9%", ctrMax: 9 },
  { name: "Position Alert", desc: "Prediction market position at risk", floor: "$0.20", ctr: "5–8%", ctrMax: 8 },
  { name: "Foul Trouble", desc: "Key starter picks up 4th foul", floor: "$0.15", ctr: "4–7%", ctrMax: 7 },
  { name: "Follow Alert", desc: "Team follower with no financial stake", floor: "$0.10", ctr: "3–5%", ctrMax: 5 },
];

const differentiators = [
  {
    title: "The Push Notification Is the Ad Unit",
    body: "Your brand lives inside the alert that makes someone grab their phone. Not beside it. Not after it. Inside it. That's why CTRs run 10-50x higher than display.",
  },
  {
    title: "You're Buying Intent, Not Impressions",
    body: "Every viewer has money on the line. A spread covering, a prop hitting, a prediction resolving. They don't just see your ad. They act on it.",
  },
  {
    title: "11 Moment Types, Each Priced Differently",
    body: "Bid on overtime moments, bet resolutions, spread crossings, or close games. Higher-intent moments cost more and convert more.",
  },
  {
    title: "No Wasted Spend",
    body: "Second-price auction: you only pay the minimum needed to win. Floor prices start at $0.10. Average CPAs run 3-5x lower than social ads.",
  },
  {
    title: "Self-Optimizing Creatives",
    body: "Upload multiple variants. NORMA's Thompson Sampling engine shifts traffic to the top converter automatically. No manual A/B test management.",
  },
  {
    title: "Privacy-First by Design",
    body: "No individual user data exposed. All targeting is cohort-based, all reporting is aggregate. Built for the post-IDFA world.",
  },
];

const auctionSteps = [
  {
    num: "1",
    title: "Moment Fires",
    body: "A fan's bet is covering, their team hits overtime, or a prediction is about to resolve. NORMA detects the moment in real time.",
  },
  {
    num: "2",
    title: "Your Campaign Matches",
    body: "NORMA finds all campaigns targeting this moment type, sport, and audience segment. Budget-paced, frequency-capped, brand-safe.",
  },
  {
    num: "3",
    title: "Floor Check",
    body: "Bids below the moment's floor price are filtered out. Higher-intent moments have higher floors. Maximizes quality for both sides.",
  },
  {
    num: "4",
    title: "You Pay Second Price",
    body: "Highest bid wins but only pays the second highest bid plus $0.01. Bid your true value. The system protects you from overpaying.",
  },
];

const aiFeatures = [
  {
    title: "Thompson Sampling Creatives",
    body: "Upload multiple variants. NORMA uses Beta distribution sampling to allocate traffic, locking to the statistical winner after 100 impressions per variant.",
  },
  {
    title: "CPA-Based Auto-Bidding",
    body: "Set a target cost-per-action and NORMA adjusts your bids every 30 minutes based on real conversion data. Stay on target without constant monitoring.",
  },
  {
    title: "Smart Budget Pacing",
    body: "Hourly pacing distributes spend evenly across each day's games. Daily caps prevent blowing your budget during a single high-traffic window.",
  },
  {
    title: "Dynamic Floor Premiums",
    body: "Floor prices automatically increase during high-demand windows: March Madness (1.5x), overtime late in a close game (1.5x), simultaneous games > 10 (1.3x).",
  },
  {
    title: "Ad Fatigue Protection",
    body: "NORMA tracks per-user ad exposure using exponential decay scoring. Users who've seen 6+ ads in 24 hours are automatically excluded to protect your brand CTR.",
  },
  {
    title: "7-Day Supply Forecasting",
    body: "See predicted inventory per moment type before you launch. Plan campaigns around live schedules with Bayesian-grounded confidence intervals.",
  },
];

export default function AdvertisersPage() {
  return (
    <div className="min-h-screen" style={{ background: "#0f172a", color: "#F5F3EE" }}>

      {/* ════════════════════════════════════════
          NAV
      ════════════════════════════════════════ */}
      <nav
        className="sticky top-0 z-50 stripe-dim"
        style={{ background: "rgba(8,8,8,0.88)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/">
            <img src="/logo.png" alt="NORMA" className="h-11 w-auto" />
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/advertisers" className="text-sm font-semibold" style={{ color: "#F5F3EE" }}>
              Advertisers
            </Link>
            <Link
              href="/auth/login"
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ background: "#f97316" }}
            >
              Advertiser Login
            </Link>
          </div>
        </div>
      </nav>

      {/* ════════════════════════════════════════
          HERO
      ════════════════════════════════════════ */}
      <section
        className="noise-overlay"
        style={{
          background: "radial-gradient(ellipse 70% 60% at 30% 50%, rgba(249,115,22,0.06) 0%, transparent 65%), #0f172a",
          paddingTop: 96,
          paddingBottom: 80,
        }}
      >
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col gap-16 lg:flex-row lg:items-center">

            {/* Left: Text */}
            <div className="flex-1" style={{ maxWidth: 600 }}>
              <div
                className="inline-block mb-6 font-semibold uppercase"
                style={{ fontSize: 11, color: "#f97316", letterSpacing: "0.14em" }}
              >
                NORMA Advertising Platform
              </div>
              <h1
                className="font-display leading-none"
                style={{ fontSize: "clamp(68px, 9vw, 110px)", color: "#F5F3EE", lineHeight: 0.92 }}
              >
                12-18% CTR.
                <br />
                <span style={{ color: "#64748b" }}>NOT A TYPO.</span>
              </h1>
              <p
                className="mt-8 leading-relaxed"
                style={{ fontSize: 18, color: "#94a3b8", maxWidth: 480 }}
              >
                NORMA doesn&apos;t interrupt attention. It creates it. Your brand appears inside the push notification that brings a fan back to a live game. Not a banner. Not a pre-roll.{" "}
                <strong style={{ color: "#F5F3EE" }}>The moment itself.</strong>
              </p>
              <div className="mt-10">
                <Link
                  href="/auth/signup"
                  className="inline-block rounded-xl px-8 py-4 text-base font-bold text-white"
                  style={{ background: "#f97316" }}
                >
                  Create Your Advertiser Account
                </Link>
              </div>
            </div>

            {/* Right: Stats */}
            <div className="flex-shrink-0 grid grid-cols-1 gap-3" style={{ width: "clamp(280px, 35vw, 380px)" }}>
              {[
                { value: 18, suffix: "%", label: "CTR on Bet Resolution", note: "Top moment type" },
                { value: 10, prefix: "$0.", suffix: "", label: "Floor Price Per Impression", note: "Follow Alert floor" },
                { value: 50, suffix: "×", label: "Higher CTR than display", note: "Overhead banner comparison" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl p-6"
                  style={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <div
                    className="font-display"
                    style={{ fontSize: 56, color: "#f97316", lineHeight: 1 }}
                  >
                    <StatCounter to={s.value} prefix={s.prefix ?? ""} suffix={s.suffix} duration={1400} />
                  </div>
                  <div
                    className="font-semibold mt-2 uppercase"
                    style={{ fontSize: 12, color: "#F5F3EE", letterSpacing: "0.08em" }}
                  >
                    {s.label}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{s.note}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          WHAT MAKES NORMA DIFFERENT
      ════════════════════════════════════════ */}
      <section className="stripe-dim py-28" style={{ background: "#0f172a" }}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-4">
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#f97316", textTransform: "uppercase" }}>
              Why NORMA
            </span>
          </div>
          <h2
            className="font-display"
            style={{ fontSize: "clamp(44px, 6vw, 76px)", color: "#F5F3EE", lineHeight: 0.95, marginBottom: 64 }}
          >
            THIS ISN&apos;T DISPLAY<br />
            <span style={{ color: "#64748b" }}>ADVERTISING.</span>
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {differentiators.map((d) => (
              <div key={d.title} className="glass-card glass-card-hover p-7">
                <h3 className="font-semibold mb-3" style={{ fontSize: 16, color: "#F5F3EE", lineHeight: 1.3 }}>
                  {d.title}
                </h3>
                <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.7 }}>{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          MOMENT TYPES + PRICING TABLE
      ════════════════════════════════════════ */}
      <section className="stripe-dim py-28" style={{ background: "#0f172a" }}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-4">
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#f97316", textTransform: "uppercase" }}>
              Inventory
            </span>
          </div>
          <h2
            className="font-display"
            style={{ fontSize: "clamp(44px, 6vw, 76px)", color: "#F5F3EE", lineHeight: 0.95, marginBottom: 16 }}
          >
            MOMENT TYPES
          </h2>
          <h2
            className="font-display mb-16"
            style={{ fontSize: "clamp(44px, 6vw, 76px)", color: "#64748b", lineHeight: 0.95 }}
          >
            & FLOOR PRICES.
          </h2>

          <div
            className="overflow-hidden rounded-2xl"
            style={{ border: "1px solid rgba(255,255,255,0.07)" }}
          >
            {/* Table header */}
            <div
              className="grid"
              style={{
                gridTemplateColumns: "2fr 2.5fr 80px 100px 100px",
                background: "#1e293b",
                padding: "12px 24px",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              {["Moment Type", "Description", "Floor", "CTR Range", ""].map((h) => (
                <div
                  key={h}
                  style={{ fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.12em", textTransform: "uppercase" }}
                >
                  {h}
                </div>
              ))}
            </div>

            {/* Table rows */}
            {momentRows.map((row, i) => (
              <div
                key={row.name}
                className="grid items-center"
                style={{
                  gridTemplateColumns: "2fr 2.5fr 80px 100px 100px",
                  padding: "14px 24px",
                  borderBottom: i < momentRows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                }}
              >
                <div className="font-semibold" style={{ fontSize: 14, color: "#F5F3EE" }}>{row.name}</div>
                <div style={{ fontSize: 13, color: "#475569" }}>{row.desc}</div>
                <div
                  className="font-display"
                  style={{ fontSize: 18, color: "#f97316" }}
                >
                  {row.floor}
                </div>
                <div style={{ fontSize: 13, color: "#94a3b8" }}>{row.ctr}</div>
                {/* CTR visual bar */}
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div
                    style={{
                      height: 3,
                      borderRadius: 2,
                      background: "#f97316",
                      width: `${(row.ctrMax / 20) * 100}%`,
                      opacity: 0.6 + (row.ctrMax / 20) * 0.4,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 12, color: "#64748b", marginTop: 12 }}>
            Floor prices reflect base rates. Dynamic premiums apply during tournament games, weekends, and simultaneous live events.
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════════
          HOW YOU WIN IMPRESSIONS (AUCTION)
      ════════════════════════════════════════ */}
      <section className="stripe-dim py-28" style={{ background: "#0f172a" }}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-4">
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#f97316", textTransform: "uppercase" }}>
              The Auction
            </span>
          </div>
          <h2
            className="font-display mb-16"
            style={{ fontSize: "clamp(44px, 6vw, 76px)", color: "#F5F3EE", lineHeight: 0.95 }}
          >
            HOW YOU WIN<br />
            <span style={{ color: "#64748b" }}>IMPRESSIONS.</span>
          </h2>

          {/* Step diagram */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {auctionSteps.map((step, i) => (
              <div key={step.num} className="relative">
                {/* Connector line */}
                {i < auctionSteps.length - 1 && (
                  <div
                    className="absolute hidden lg:block"
                    style={{
                      top: 20,
                      right: -16,
                      width: 28,
                      height: 1,
                      background: "rgba(249,115,22,0.2)",
                      zIndex: 10,
                    }}
                  />
                )}
                <div className="glass-card p-6 h-full">
                  <div
                    className="rounded-full flex items-center justify-center mb-5 font-bold"
                    style={{
                      width: 40,
                      height: 40,
                      background: "#f97316",
                      color: "#fff",
                      fontSize: 16,
                    }}
                  >
                    {step.num}
                  </div>
                  <h3 className="font-semibold mb-3" style={{ fontSize: 16, color: "#F5F3EE", lineHeight: 1.3 }}>
                    {step.title}
                  </h3>
                  <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.65 }}>{step.body}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Second-price callout */}
          <div
            className="mt-12 rounded-2xl p-8"
            style={{ background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.15)" }}
          >
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <div
                className="font-display flex-shrink-0"
                style={{ fontSize: 64, color: "#f97316", lineHeight: 1 }}
              >
                2nd
              </div>
              <div>
                <div className="font-semibold mb-2" style={{ fontSize: 16, color: "#F5F3EE" }}>
                  Second-Price (Vickrey) Auction
                </div>
                <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.7 }}>
                  The highest bid wins, but only pays the second-highest bid plus one cent. Bid your true value — the auction mechanics protect you from overpaying. This is the same model used by Google Ads and The Trade Desk.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          AI FEATURES — SET IT AND LET IT RUN
      ════════════════════════════════════════ */}
      <section className="stripe-dim py-28" style={{ background: "#0f172a" }}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-4">
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#f97316", textTransform: "uppercase" }}>
              AI Engine
            </span>
          </div>
          <h2
            className="font-display mb-4"
            style={{ fontSize: "clamp(44px, 6vw, 76px)", color: "#F5F3EE", lineHeight: 0.95 }}
          >
            SET IT AND
          </h2>
          <h2
            className="font-display mb-16"
            style={{ fontSize: "clamp(44px, 6vw, 76px)", color: "#64748b", lineHeight: 0.95 }}
          >
            LET IT RUN.
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {aiFeatures.map((f) => (
              <div key={f.title} className="glass-card glass-card-hover p-7">
                <div
                  className="mb-4"
                  style={{ width: 32, height: 3, background: "#f97316", borderRadius: 2 }}
                />
                <h3 className="font-semibold mb-3" style={{ fontSize: 15, color: "#F5F3EE", lineHeight: 1.3 }}>
                  {f.title}
                </h3>
                <p style={{ fontSize: 13.5, color: "#475569", lineHeight: 1.7 }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          SPORTSBOOK INTEGRATIONS
      ════════════════════════════════════════ */}
      <section className="stripe-dim py-24" style={{ background: "#0f172a" }}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-4">
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#f97316", textTransform: "uppercase" }}>
              Integrations
            </span>
          </div>
          <h2
            className="font-display mb-12"
            style={{ fontSize: "clamp(40px, 5vw, 64px)", color: "#F5F3EE", lineHeight: 0.95 }}
          >
            DEEP SPORTSBOOK<br />
            <span style={{ color: "#64748b" }}>INTEGRATIONS.</span>
          </h2>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 mb-10">
            {["DraftKings", "FanDuel", "BetMGM", "Caesars", "ESPN BET"].map((name) => (
              <div
                key={name}
                className="rounded-xl flex items-center justify-center py-6 font-semibold"
                style={{
                  background: "#1e293b",
                  border: "1px solid rgba(255,255,255,0.07)",
                  fontSize: 13,
                  color: "#64748b",
                }}
              >
                {name}
              </div>
            ))}
          </div>

          <div className="grid gap-6 sm:grid-cols-2 max-w-2xl">
            <div>
              <div className="font-semibold mb-2" style={{ fontSize: 14, color: "#F5F3EE" }}>Affiliate Attribution</div>
              <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.65 }}>
                Track which impressions drive wager placements. Configurable attribution windows and postback URLs. 30-minute conversion window with honest inferred vs app-verified labeling.
              </p>
            </div>
            <div>
              <div className="font-semibold mb-2" style={{ fontSize: 14, color: "#F5F3EE" }}>Branded CTAs</div>
              <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.65 }}>
                Your brand colors, your logo, your deep link. &quot;Bet Now on DraftKings&quot; rendered natively in the notification card — taking users directly into your app with the right game pre-loaded.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          SELF-SERVE PORTAL
      ════════════════════════════════════════ */}
      <section className="stripe-dim py-24" style={{ background: "#0f172a" }}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-4">
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#f97316", textTransform: "uppercase" }}>
              Platform
            </span>
          </div>
          <h2
            className="font-display mb-16"
            style={{ fontSize: "clamp(40px, 5vw, 64px)", color: "#F5F3EE", lineHeight: 0.95 }}
          >
            SELF-SERVE.<br />
            <span style={{ color: "#64748b" }}>NO SALES CALLS.</span>
          </h2>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: "Campaign Creation Wizard", desc: "5-step guided setup: basics, targeting, bidding, creatives, review. Launch your first campaign in under 10 minutes." },
              { title: "Real-Time Dashboard", desc: "Impressions, CTR, CPA, and spend updated every 15 minutes. No day-old reports." },
              { title: "Bid Management", desc: "Set bids per moment type with floor price indicators and win rate tracking. Know where you stand." },
              { title: "Creative A/B Testing", desc: "Upload variants, see which performs best via Thompson Sampling, auto-optimize. No manual management." },
              { title: "Inventory Forecasting", desc: "7-day supply forecast by moment type per sport. Plan campaigns around live schedules with confidence intervals." },
              { title: "Attribution Reporting", desc: "Closed-loop attribution with 30-minute window. App-verified vs inferred conversions labeled honestly." },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-xl p-5"
                style={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <h3 className="font-semibold mb-2" style={{ fontSize: 14, color: "#F5F3EE" }}>{item.title}</h3>
                <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          FINAL CTA
      ════════════════════════════════════════ */}
      <section
        className="stripe-orange py-28 noise-overlay"
        style={{ background: "#0f172a" }}
      >
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2
            className="font-display"
            style={{ fontSize: "clamp(44px, 6vw, 80px)", color: "#F5F3EE", lineHeight: 0.95, marginBottom: 20 }}
          >
            READY TO REACH FANS<br />
            AT THEIR MOST<br />
            <span style={{ color: "#f97316" }}>ENGAGED?</span>
          </h2>
          <p style={{ fontSize: 17, color: "#64748b", lineHeight: 1.7, marginBottom: 40 }}>
            Create your free advertiser account. Set up your first campaign in minutes. No minimum spend required.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/auth/signup"
              className="rounded-xl px-10 py-4 text-base font-bold text-white"
              style={{ background: "#f97316" }}
            >
              Create Advertiser Account
            </Link>
            <Link
              href="/demo"
              className="rounded-xl px-10 py-4 text-base font-semibold"
              style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8" }}
            >
              Schedule a Demo
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════ */}
      <footer className="stripe-dim py-12" style={{ background: "#0f172a" }}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
            <div>
              <Link href="/">
                <img src="/logo.png" alt="NORMA" className="h-8 w-auto" />
              </Link>
              <p style={{ fontSize: 12, color: "#64748b", marginTop: 6, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Real-Time Sports Intent Advertising
              </p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3" style={{ fontSize: 13, color: "#64748b" }}>
              <Link href="/" style={{ color: "#64748b" }} className="hover:text-white transition-colors">Home</Link>
              <Link href="/auth/login" style={{ color: "#64748b" }} className="hover:text-white transition-colors">Advertiser Portal</Link>
              <Link href="/developers" style={{ color: "#64748b" }} className="hover:text-white transition-colors">Developers API</Link>
              <a href="mailto:ads@norma-app.com" style={{ color: "#64748b" }} className="hover:text-white transition-colors">Contact</a>
            </div>
          </div>
          <div
            className="mt-10 pt-8"
            style={{ borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 12, color: "#64748b" }}
          >
            <p>&copy; {new Date().getFullYear()} NORMA. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
