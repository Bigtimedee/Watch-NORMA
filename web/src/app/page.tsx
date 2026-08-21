import Link from "next/link";
import { WaitlistForm } from "@/components/waitlist-form";
import { NormaDemo } from "@/components/norma-demo";
import { StatCounter } from "@/components/stat-counter";

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

const momentTypes = [
  { name: "Bet Resolved", sub: "Win or lose — your result is in", accent: "#4ADE80", bg: "rgba(74,222,128,0.07)" },
  { name: "Close Game", sub: "Within 6 pts, final 5 minutes", accent: "#F87171", bg: "rgba(248,113,113,0.07)" },
  { name: "Overtime", sub: "Peak adrenaline, extra time", accent: "#f97316", bg: "rgba(249,115,22,0.09)" },
  { name: "Spread Alert", sub: "Your line is being crossed", accent: "#60A5FA", bg: "rgba(96,165,250,0.07)" },
  { name: "Moneyline Alert", sub: "Outcome flipping in real time", accent: "#A78BFA", bg: "rgba(167,139,250,0.07)" },
  { name: "Total Alert", sub: "Over/under pace is shifting", accent: "#FBBF24", bg: "rgba(251,191,36,0.07)" },
  { name: "Prop Alert", sub: "Player stat line in play", accent: "#34D399", bg: "rgba(52,211,153,0.07)" },
  { name: "Foul Trouble", sub: "Key starter picks up 4th foul", accent: "#FB923C", bg: "rgba(251,146,60,0.07)" },
  { name: "Position Alert", sub: "Prediction market at risk", accent: "#38BDF8", bg: "rgba(56,189,248,0.07)" },
  { name: "Prediction Resolved", sub: "Your market position settled", accent: "#C084FC", bg: "rgba(192,132,252,0.07)" },
  { name: "Follow Alert", sub: "Your team needs you now", accent: "#F5F3EE", bg: "rgba(245,243,238,0.05)" },
];

const useCases = [
  {
    id: "01",
    label: "Sports Bettors",
    headline: "Your 3-leg parlay is live. Two legs hit.",
    body: "NORMA alerts you the moment the third leg is in play. DraftKings, FanDuel, BetMGM — scan your slip or enter manually. She watches while you live.",
    accent: "#f97316",
  },
  {
    id: "02",
    label: "Prediction Markets",
    headline: "Your Kalshi position is about to resolve.",
    body: "NORMA connects to your account and alerts you when outcomes shift. Watch the final moments of your prediction unfold live. Not after. Live.",
    accent: "#A78BFA",
  },
  {
    id: "03",
    label: "Team Fans",
    headline: "No bet. No problem. Just your team.",
    body: "Follow your teams and NORMA tells you when they force overtime, close a 14-point deficit, or set up a buzzer-beater. The moments that make sports worth watching.",
    accent: "#60A5FA",
  },
  {
    id: "04",
    label: "Cord-Cutters",
    headline: "NORMA tells you where to watch, not just when.",
    body: "One tap opens the game on YouTube TV, ESPN+, Peacock, or whatever service you have. The right stream. The right moment. No searching.",
    accent: "#34D399",
  },
  {
    id: "05",
    label: "Busy Professionals",
    headline: "You can't watch every game. You can't watch most.",
    body: "NORMA respects your time. She only interrupts when it truly matters to your money and your teams. The rest of the time — she's invisible.",
    accent: "#FBBF24",
  },
  {
    id: "06",
    label: "Multi-Sport Fans",
    headline: "NBA playoffs. MLB. March Madness. All at once.",
    body: "Hundreds of simultaneous games. NORMA cuts through all of it and tells you which one matters to you right now — and exactly why.",
    accent: "#F87171",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen" style={{ background: "#0f172a", color: "#F5F3EE" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ════════════════════════════════════════
          NAV
      ════════════════════════════════════════ */}
      <nav
        className="sticky top-0 z-50 stripe-dim"
        style={{ background: "rgba(8,8,8,0.85)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/">
            <img src="/logo.png" alt="NORMA" className="h-11 w-auto" />
          </Link>
          <div className="flex items-center gap-6">
            <a
              href="https://apps.apple.com/us/app/watch-norma/id6759508383"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:block text-sm font-medium"
              style={{ color: "#94a3b8" }}
            >
              Download App
            </a>
            <a href="#advertisers" className="hidden sm:block text-sm font-medium" style={{ color: "#94a3b8" }}>
              Advertisers
            </a>
            <Link
              href="/auth"
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ background: "#f97316" }}
            >
              Advertiser Portal
            </Link>
          </div>
        </div>
      </nav>

      {/* ════════════════════════════════════════
          HERO
      ════════════════════════════════════════ */}
      <section
        className="hero-glow noise-overlay relative overflow-hidden"
        style={{ minHeight: "92vh", display: "flex", alignItems: "center" }}
      >
        <div className="relative z-10 mx-auto w-full max-w-7xl px-6 pt-10 pb-0">
          {/* Mascot showcase — the brand's primary visual anchor */}
          <div className="flex justify-center mb-6">
            <img
              src="/logo.png"
              alt="NORMA"
              style={{ height: "clamp(180px, 20vw, 260px)", width: "auto" }}
            />
          </div>
          <div className="flex flex-col items-center gap-16 lg:flex-row lg:items-center lg:gap-8">

            {/* ── Left: Text ── */}
            <div className="flex-1 text-center lg:text-left" style={{ maxWidth: 580 }}>
              {/* Eyebrow */}
              <div
                className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-8"
                style={{
                  background: "rgba(249,115,22,0.1)",
                  border: "1px solid rgba(249,115,22,0.22)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#f97316",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "#f97316", animation: "pulse-dot 1.6s ease-in-out infinite", display: "inline-block" }}
                />
                Live Now — NBA · MLB · NCAA
              </div>

              {/* Headline */}
              <h1
                className="font-display leading-none tracking-wide"
                style={{ fontSize: "clamp(72px, 9vw, 120px)", color: "#F5F3EE", lineHeight: 0.93 }}
              >
                WATCH AT THE<br />
                <span style={{ color: "#f97316" }}>PERFECT</span><br />
                MOMENT.
              </h1>

              {/* Subheadline */}
              <p
                className="mt-8 leading-relaxed"
                style={{ fontSize: 18, color: "#94a3b8", maxWidth: 480 }}
              >
                Your wagers and predictions tell NORMA exactly what matters to you. When your bet is about to cover, your prediction is resolving, or your team forces overtime — she pulls you into the action.
              </p>

              {/* CTAs */}
              <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row lg:justify-start sm:justify-center">
                <a
                  href="https://apps.apple.com/us/app/watch-norma/id6759508383"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img src="/app-store-badge.svg" alt="Download on the App Store" className="h-14 w-auto" />
                </a>
                <p style={{ fontSize: 13, color: "#64748b" }}>iPhone · Free · No account required to start</p>
              </div>

              {/* Social proof */}
              <div
                className="mt-10 flex flex-wrap items-center gap-4 justify-center lg:justify-start"
                style={{ fontSize: 13 }}
              >
                <span className="flex items-center gap-1.5" style={{ color: "#94a3b8" }}>
                  <span style={{ color: "#f97316" }}>★★★★★</span>
                  5.0 App Store
                </span>
                <span style={{ color: "#64748b" }}>|</span>
                <span style={{ color: "#94a3b8" }}>11 Alert Types</span>
                <span style={{ color: "#64748b" }}>|</span>
                <span style={{ color: "#94a3b8" }}>3 Sports Covered</span>
              </div>
            </div>

            {/* ── Right: iPhone ── */}
            <div className="flex-shrink-0 flex items-center justify-center" style={{ paddingRight: "clamp(0px, 4vw, 60px)" }}>
              <NormaDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          SPORTSBOOK LOGOS BAR
      ════════════════════════════════════════ */}
      <div className="stripe-dim" style={{ background: "#0f172a" }}>
        <div className="mx-auto max-w-7xl px-6 py-5">
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6">
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Works with
            </span>
            {["DraftKings", "FanDuel", "BetMGM", "Caesars", "ESPN BET", "Kalshi"].map((name) => (
              <span
                key={name}
                style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════
          HOW IT WORKS
      ════════════════════════════════════════ */}
      <section className="stripe-dim py-28" style={{ background: "#0f172a" }}>
        <div className="mx-auto max-w-7xl px-6">
          {/* Section label */}
          <div className="text-center mb-4">
            <span
              style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#f97316", textTransform: "uppercase" }}
            >
              How It Works
            </span>
          </div>
          <h2
            className="font-display text-center"
            style={{ fontSize: "clamp(48px, 6vw, 80px)", color: "#F5F3EE", lineHeight: 0.95, marginBottom: 64 }}
          >
            THREE STEPS.<br />
            <span style={{ color: "#64748b" }}>THEN GO LIVE YOUR LIFE.</span>
          </h2>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                num: "01",
                title: "Tell NORMA What You Care About",
                body: "Link your sportsbook and prediction market accounts. Follow your favorite teams. Your wagers and predictions tell NORMA exactly what matters to you.",
                accent: "#f97316",
              },
              {
                num: "02",
                title: "Go Live Your Life",
                body: "No producer. No algorithm guessing. NORMA already knows because you told her with your money. She watches every game so you don't have to.",
                accent: "#94a3b8",
              },
              {
                num: "03",
                title: "Tune In When It Matters",
                body: "Your bet is covering. Your prediction is resolving. Your team just forced overtime. NORMA sends you there at the exact moment that's personal to you.",
                accent: "#F5F3EE",
              },
            ].map((step) => (
              <div
                key={step.num}
                className="glass-card glass-card-hover p-8"
                style={{ position: "relative", overflow: "hidden" }}
              >
                {/* Big decorative number */}
                <div
                  className="font-display absolute right-4 bottom-2 pointer-events-none select-none"
                  style={{ fontSize: 120, color: "rgba(255,255,255,0.03)", lineHeight: 1 }}
                >
                  {step.num}
                </div>
                <div
                  className="font-display relative z-10"
                  style={{ fontSize: 56, color: step.accent, lineHeight: 1, marginBottom: 20 }}
                >
                  {step.num}
                </div>
                <h3
                  className="font-semibold relative z-10"
                  style={{ fontSize: 17, color: "#F5F3EE", marginBottom: 12, lineHeight: 1.3 }}
                >
                  {step.title}
                </h3>
                <p className="relative z-10" style={{ fontSize: 14, color: "#64748b", lineHeight: 1.65 }}>
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          EDITORIAL PULL QUOTE
      ════════════════════════════════════════ */}
      <section
        className="py-28 noise-overlay"
        style={{ background: "linear-gradient(180deg, #0f172a 0%, #0f172a 100%)", position: "relative" }}
      >
        <div className="mx-auto max-w-5xl px-6 text-center">
          <div
            className="font-display"
            style={{ fontSize: "clamp(40px, 6vw, 72px)", color: "#F5F3EE", lineHeight: 1.05 }}
          >
            BANNERS BEG FOR YOUR ATTENTION.
            <br />
            PRE-ROLLS INTERRUPT IT.
          </div>
          <div
            className="font-display mt-3"
            style={{ fontSize: "clamp(40px, 6vw, 72px)", color: "#f97316", lineHeight: 1.05 }}
          >
            NORMA OWNS THE MOMENT
            <br />
            YOUR PHONE CREATES A VIEWER.
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          MOMENT TYPES
      ════════════════════════════════════════ */}
      <section className="stripe-dim py-28" style={{ background: "#0f172a" }}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-4">
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#f97316", textTransform: "uppercase" }}>
              Alert Types
            </span>
          </div>
          <h2
            className="font-display text-center"
            style={{ fontSize: "clamp(48px, 6vw, 80px)", color: "#F5F3EE", lineHeight: 0.95, marginBottom: 16 }}
          >
            11 MOMENT TYPES.
          </h2>
          <h2
            className="font-display text-center"
            style={{ fontSize: "clamp(48px, 6vw, 80px)", color: "#64748b", lineHeight: 0.95, marginBottom: 56 }}
          >
            ZERO NOISE.
          </h2>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {momentTypes.map((mt) => (
              <div
                key={mt.name}
                className="moment-card"
                style={{ position: "relative", overflow: "hidden" }}
              >
                {/* Accent bar */}
                <div
                  className="absolute left-0 top-0 bottom-0 rounded-l-[12px]"
                  style={{ width: 3, background: mt.accent }}
                />
                <div style={{ paddingLeft: 12 }}>
                  <div
                    className="font-display"
                    style={{ fontSize: 22, color: "#F5F3EE", lineHeight: 1, marginBottom: 4 }}
                  >
                    {mt.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.4 }}>
                    {mt.sub}
                  </div>
                </div>
              </div>
            ))}

            {/* 12th card: App Store CTA */}
            <div
              className="rounded-xl flex flex-col items-center justify-center text-center p-5"
              style={{
                border: "1px solid rgba(249,115,22,0.2)",
                background: "rgba(249,115,22,0.05)",
              }}
            >
              <div style={{ fontSize: 12, color: "#f97316", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                All 11 alerts. Free.
              </div>
              <a
                href="https://apps.apple.com/us/app/watch-norma/id6759508383"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img src="/app-store-badge.svg" alt="Download on the App Store" style={{ height: 40, width: "auto" }} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          USE CASES
      ════════════════════════════════════════ */}
      <section className="stripe-dim py-28" style={{ background: "#0f172a" }}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-4">
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#f97316", textTransform: "uppercase" }}>
              Built For You
            </span>
          </div>
          <h2
            className="font-display text-center"
            style={{ fontSize: "clamp(48px, 6vw, 80px)", color: "#F5F3EE", lineHeight: 0.95, marginBottom: 64 }}
          >
            BUILT FOR HOW YOU<br />
            <span style={{ color: "#64748b" }}>ACTUALLY WATCH SPORTS.</span>
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {useCases.map((uc) => (
              <div key={uc.id} className="glass-card glass-card-hover p-7" style={{ position: "relative", overflow: "hidden" }}>
                {/* Background number */}
                <div
                  className="font-display absolute right-3 bottom-1 pointer-events-none select-none"
                  style={{ fontSize: 96, color: "rgba(255,255,255,0.025)", lineHeight: 1 }}
                >
                  {uc.id}
                </div>
                {/* Label */}
                <div
                  className="font-semibold uppercase mb-4"
                  style={{ fontSize: 10, color: uc.accent, letterSpacing: "0.14em" }}
                >
                  {uc.label}
                </div>
                {/* Headline */}
                <h3
                  className="font-semibold relative z-10"
                  style={{ fontSize: 16, color: "#F5F3EE", lineHeight: 1.35, marginBottom: 10 }}
                >
                  {uc.headline}
                </h3>
                {/* Body */}
                <p className="relative z-10" style={{ fontSize: 13.5, color: "#64748b", lineHeight: 1.65 }}>
                  {uc.body}
                </p>
              </div>
            ))}
          </div>

          {/* Second download CTA */}
          <div className="mt-16 text-center">
            <a
              href="https://apps.apple.com/us/app/watch-norma/id6759508383"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block"
            >
              <img src="/app-store-badge.svg" alt="Download on the App Store" style={{ height: 52, width: "auto" }} />
            </a>
            <p style={{ fontSize: 12, color: "#64748b", marginTop: 10 }}>
              Free · No credit card · No account required to start
            </p>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          ADVERTISER TEASER
      ════════════════════════════════════════ */}
      <section
        id="advertisers"
        className="stripe-orange py-28 noise-overlay"
        style={{ background: "#0f172a" }}
      >
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-4">
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#f97316", textTransform: "uppercase" }}>
              For Advertisers
            </span>
          </div>
          <h2
            className="font-display text-center"
            style={{ fontSize: "clamp(48px, 6vw, 80px)", color: "#F5F3EE", lineHeight: 0.95, marginBottom: 64 }}
          >
            THE HIGHEST-INTENT<br />
            <span style={{ color: "#f97316" }}>AD UNIT IN SPORTS.</span>
          </h2>

          {/* Stats grid */}
          <div className="grid gap-0 sm:grid-cols-3" style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: 20, overflow: "hidden" }}>
            {[
              { label: "CTR on Bet Resolution", value: 18, suffix: "%", note: "Industry average: 0.35%" },
              { label: "Floor Price Per Impression", value: 10, prefix: "$0.", suffix: "", note: "Starts at $0.10 per moment" },
              { label: "Lower CPA vs Social Ads", value: 5, suffix: "×", note: "For sportsbook install campaigns" },
            ].map((stat, i) => (
              <div
                key={stat.label}
                className="text-center py-12 px-8"
                style={{
                  borderRight: i < 2 ? "1px solid rgba(255,255,255,0.07)" : "none",
                  background: "rgba(255,255,255,0.01)",
                }}
              >
                <div
                  className="font-display"
                  style={{ fontSize: "clamp(64px, 8vw, 96px)", color: "#f97316", lineHeight: 1 }}
                >
                  <StatCounter to={stat.value} prefix={stat.prefix ?? ""} suffix={stat.suffix} duration={1600} />
                </div>
                <div
                  className="font-semibold mt-3"
                  style={{ fontSize: 13, color: "#F5F3EE", textTransform: "uppercase", letterSpacing: "0.08em" }}
                >
                  {stat.label}
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>{stat.note}</div>
              </div>
            ))}
          </div>

          {/* Advertiser description */}
          <div className="mt-16 mx-auto max-w-3xl text-center">
            <p style={{ fontSize: 17, color: "#64748b", lineHeight: 1.75 }}>
              NORMA doesn&apos;t interrupt attention. It creates it. Every ad runs inside the push notification that brings a fan back to a live game they care about. Your brand is the reason they pick up their phone — not the thing they skip past.
            </p>
          </div>

          <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/auth"
              className="rounded-xl px-8 py-3.5 text-base font-bold text-white"
              style={{ background: "#f97316" }}
            >
              Create Advertiser Account
            </Link>
            <Link
              href="/advertisers"
              className="rounded-xl px-8 py-3.5 text-base font-semibold"
              style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8" }}
            >
              See Full Platform →
            </Link>
            <Link
              href="/demo"
              className="rounded-xl px-8 py-3.5 text-base font-semibold"
              style={{ border: "1px solid rgba(249,115,22,0.2)", color: "#f97316" }}
            >
              Request a Demo →
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          WAITLIST
      ════════════════════════════════════════ */}
      <section
        className="py-28 stripe-dim"
        style={{ background: "#0f172a" }}
      >
        <div className="mx-auto max-w-xl px-6 text-center">
          <div className="mb-4">
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#f97316", textTransform: "uppercase" }}>
              Android + New Markets
            </span>
          </div>
          <h2
            className="font-display"
            style={{ fontSize: "clamp(44px, 6vw, 72px)", color: "#F5F3EE", lineHeight: 0.95, marginBottom: 20 }}
          >
            BE FIRST TO KNOW<br />
            <span style={{ color: "#64748b" }}>WHEN NORMA</span><br />
            COMES TO YOU.
          </h2>
          <p style={{ fontSize: 15, color: "#475569", lineHeight: 1.7, marginBottom: 32 }}>
            Android support and new state markets are coming. Drop your email and we&apos;ll notify you the moment NORMA is ready for you.
          </p>
          <WaitlistForm />
        </div>
      </section>

      {/* ════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════ */}
      <footer className="stripe-dim py-12" style={{ background: "#0f172a" }}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
            <div>
              <img src="/logo.png" alt="NORMA" className="h-8 w-auto" />
              <p style={{ fontSize: 12, color: "#64748b", marginTop: 6, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Real-Time Sports Intent Advertising
              </p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3" style={{ fontSize: 13, color: "#64748b" }}>
              <a href="#advertisers" style={{ color: "#64748b" }} className="hover:text-white transition-colors">Advertisers</a>
              <Link href="/advertisers" style={{ color: "#64748b" }} className="hover:text-white transition-colors">Advertising</Link>
              <Link href="/auth" style={{ color: "#64748b" }} className="hover:text-white transition-colors">Advertiser Portal</Link>
              <Link href="/developers" style={{ color: "#64748b" }} className="hover:text-white transition-colors">Developers</Link>
              <a href="mailto:ads@getnorma.app" style={{ color: "#64748b" }} className="hover:text-white transition-colors">Contact</a>
              <a href="/privacy-policy" style={{ color: "#64748b" }} className="hover:text-white transition-colors">Privacy</a>
              <a href="/terms-of-service" style={{ color: "#64748b" }} className="hover:text-white transition-colors">Terms</a>
              <Link href="/status" style={{ color: "#64748b" }} className="hover:text-white transition-colors">Status</Link>
            </div>
          </div>
          <div
            className="mt-10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4"
            style={{ borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 12, color: "#64748b" }}
          >
            <p>&copy; {new Date().getFullYear()} NORMA. All rights reserved.</p>
            <p>Available on iPhone · Free to download</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
