"use client";
// Signup CTA for SEO pages. Consumer signup lives in the iOS app, so this links
// to the App Store with a campaign token and fires seo_cta_click.
type Props = {
  href: string;
  pageType: "game" | "team" | "hub";
  gameId?: string;
  teamId?: string;
  variant: "sticky" | "inline";
  headline?: string;
};

function track(p: Props) {
  const body = JSON.stringify({
    event_name: "seo_cta_click",
    properties: { page_type: p.pageType, game_id: p.gameId, team_id: p.teamId, path: location.pathname },
  });
  try {
    if (navigator.sendBeacon) navigator.sendBeacon("/api/web-events", new Blob([body], { type: "application/json" }));
    else void fetch("/api/web-events", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
  } catch {
    /* analytics must never block navigation */
  }
}

export function AppCta(p: Props) {
  const headline = p.headline ?? "Get an alert when this game gets close. Free.";
  if (p.variant === "sticky") {
    return (
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-3 px-4 py-3"
        style={{ background: "rgba(15,23,42,0.96)", borderTop: "1px solid rgba(249,115,22,0.4)" }}
      >
        <span style={{ color: "#F5F3EE", fontSize: 14, fontWeight: 600 }}>{headline}</span>
        <a
          href={p.href}
          onClick={() => track(p)}
          data-cta="seo_cta_click"
          className="shrink-0 rounded-lg px-4 py-2 text-sm font-bold"
          style={{ background: "#f97316", color: "#0f172a" }}
        >
          Get NORMA
        </a>
      </div>
    );
  }
  return (
    <div className="my-8 rounded-2xl p-6" style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.3)" }}>
      <p style={{ color: "#F5F3EE", fontSize: 18, fontWeight: 700 }}>{headline}</p>
      <p style={{ color: "#94a3b8", fontSize: 14, marginTop: 6 }}>
        NORMA watches the games you care about and pings you when they matter.
      </p>
      <a href={p.href} onClick={() => track(p)} data-cta="seo_cta_click" className="mt-4 inline-block" aria-label="Download NORMA on the App Store">
        <img src="/app-store-badge.svg" alt="Download on the App Store" width={150} height={50} />
      </a>
    </div>
  );
}
