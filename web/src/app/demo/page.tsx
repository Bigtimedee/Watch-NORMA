import type { Metadata } from "next";
import Link from "next/link";
import { DemoForm } from "./demo-form";

export const metadata: Metadata = {
  title: "Schedule a Demo — NORMA Advertising",
  description:
    "Book a 30-minute demo with the NORMA advertising team. Learn how moment-based push notification ads deliver 12-18% CTR for sportsbooks, streaming services, and commerce brands.",
};

const whatYoullLearn = [
  "How NORMA's second-price auction works and how to bid for maximum ROI",
  "Which moment types deliver the highest CTR for your vertical",
  "How self-serve campaign setup and creative A/B testing work",
  "Custom pricing for volume advertisers and direct deal structures",
  "DSP and programmatic API access for machine-client bidding",
  "Attribution reporting and conversion tracking for your use case",
];

export default function DemoPage() {
  return (
    <div className="min-h-screen" style={{ background: "#080808", color: "#F5F3EE" }}>

      {/* Nav */}
      <nav
        className="sticky top-0 z-50 stripe-dim"
        style={{ background: "rgba(8,8,8,0.88)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/">
            <img src="/logo.png" alt="NORMA" className="h-9 w-auto" />
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/advertisers" className="hidden sm:block text-sm font-medium" style={{ color: "#9A9A9A" }}>
              Advertisers
            </Link>
            <Link
              href="/auth/login"
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ background: "#FF4C00" }}
            >
              Advertiser Login
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero + Form */}
      <section
        className="noise-overlay"
        style={{
          background: "radial-gradient(ellipse 60% 50% at 10% 40%, rgba(255,76,0,0.06) 0%, transparent 65%), #080808",
          paddingTop: 72,
          paddingBottom: 80,
        }}
      >
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col gap-16 lg:flex-row lg:gap-20">

            {/* ── Left: headline + benefits ── */}
            <div className="flex-1" style={{ maxWidth: 520 }}>
              <div
                className="inline-block mb-6 font-semibold uppercase"
                style={{ fontSize: 11, color: "#FF4C00", letterSpacing: "0.14em" }}
              >
                NORMA Advertising · 30-Minute Demo
              </div>
              <h1
                className="font-display leading-none"
                style={{ fontSize: "clamp(60px, 7vw, 96px)", color: "#F5F3EE", lineHeight: 0.92 }}
              >
                SCHEDULE<br />
                <span style={{ color: "#FF4C00" }}>A DEMO.</span>
              </h1>
              <p
                className="mt-8 leading-relaxed"
                style={{ fontSize: 17, color: "#6B6B6B", maxWidth: 440 }}
              >
                Talk directly with the NORMA advertising team. We&apos;ll show you how moment-based push notification ads work, walk through your specific use case, and build a campaign strategy together.
              </p>

              {/* What you'll learn */}
              <div className="mt-10">
                <div
                  className="font-semibold uppercase mb-5"
                  style={{ fontSize: 11, color: "#3A3A3A", letterSpacing: "0.12em" }}
                >
                  In 30 minutes you&apos;ll learn
                </div>
                <ul className="space-y-4">
                  {whatYoullLearn.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <div
                        className="flex-shrink-0 rounded-full flex items-center justify-center mt-0.5"
                        style={{ width: 20, height: 20, background: "rgba(255,76,0,0.12)", border: "1px solid rgba(255,76,0,0.25)" }}
                      >
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="#FF4C00" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <span style={{ fontSize: 14, color: "#6B6B6B", lineHeight: 1.55 }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Contact fallback */}
              <div className="mt-12 pt-8" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <p style={{ fontSize: 13, color: "#3A3A3A" }}>
                  Prefer email?{" "}
                  <a href="mailto:ads@norma-app.com" style={{ color: "#FF4C00" }}>
                    ads@norma-app.com
                  </a>
                </p>
              </div>
            </div>

            {/* ── Right: form ── */}
            <div className="flex-1" style={{ maxWidth: 520 }}>
              <DemoForm />
            </div>

          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="stripe-dim py-10" style={{ background: "#080808" }}>
        <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4" style={{ fontSize: 12, color: "#2A2A2A" }}>
          <Link href="/">
            <img src="/logo.png" alt="NORMA" className="h-7 w-auto opacity-40" />
          </Link>
          <p>&copy; {new Date().getFullYear()} NORMA. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
