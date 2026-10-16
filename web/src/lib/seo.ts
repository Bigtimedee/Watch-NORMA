// Central SEO config for www.getnorma.app.
// Content owns the title/description copy below; Eng wires it in. Edit here,
// not in individual pages, so titles and descriptions stay consistent.
import type { Metadata } from "next";

export const SITE_URL = "https://www.getnorma.app";
export const APP_STORE_URL = "https://apps.apple.com/app/id6759508383";
export const X_URL = "https://x.com/watchNORMA";
export const LOGO_URL = `${SITE_URL}/logo.png`;

export type PageKey = "home" | "advertisers" | "demo" | "developers" | "status";

/** path: route path used for the self-referencing canonical. */
export const PAGE_META: Record<PageKey, { path: string; title: string; description: string }> = {
  home: {
    path: "/",
    title: "Where to Watch NFL & College Football Live | NORMA",
    description:
      "See what channel every NFL and college football game is on, when it kicks off and where to stream it. NORMA alerts you when your game gets good. Free.",
  },
  advertisers: {
    path: "/advertisers",
    title: "Advertise on NORMA: Ads in the Moments Fans Tune In",
    description:
      "Reach sports fans the moment they choose to tune in, and after the wins they celebrate. Start a NORMA pilot with $100 and get a $250 + $250 match.",
  },
  demo: {
    path: "/demo",
    title: "Schedule a Demo — NORMA Advertising",
    description:
      "Book a 30-minute demo with the NORMA advertising team. Learn how moment-based push notification ads work for sportsbooks, streaming services, and commerce brands.",
  },
  developers: {
    path: "/developers",
    title: "NORMA for Developers | Agentic Ad Inventory API",
    description:
      "Programmatic access to NORMA push notification inventory on high-intent sports moments. REST API, MCP Server, and AdCP-compatible.",
  },
  status: {
    path: "/status",
    title: "NORMA System Status",
    description: "Live operational status for the NORMA sports alert platform.",
  },
};

/** Title, description, self-referencing canonical and OG url for a page. */
export function pageMetadata(key: PageKey, extra: Metadata = {}): Metadata {
  const m = PAGE_META[key];
  const url = `${SITE_URL}${m.path === "/" ? "" : m.path}`;
  return {
    title: m.title,
    description: m.description,
    alternates: { canonical: url },
    ...extra,
    openGraph: {
      title: m.title,
      description: m.description,
      url,
      siteName: "NORMA",
      type: "website",
      images: [{ url: "/og-image.jpg", width: 1400, height: 930 }],
      ...(extra.openGraph ?? {}),
    },
    twitter: {
      card: "summary_large_image",
      title: m.title,
      description: m.description,
      images: ["/og-image.jpg"],
      ...(extra.twitter ?? {}),
    },
  };
}

/** Public, indexable routes for sitemap.xml. */
export const SITEMAP_ROUTES = ["/", "/advertisers", "/developers", "/demo", "/privacy-policy", "/terms-of-service"];

export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: "NORMA",
  url: SITE_URL,
  logo: LOGO_URL,
  email: "support@getnorma.app",
  sameAs: [X_URL, APP_STORE_URL],
};

export const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: "NORMA",
  url: SITE_URL,
  publisher: { "@id": `${SITE_URL}/#organization` },
};
