import type { Metadata } from "next";
import { Bebas_Neue, DM_Sans } from "next/font/google";
import { AuthRecoveryLandingGuard } from "@/components/auth-recovery-landing-guard";
import { PageViewTracker } from "@/components/page-view-tracker";
import "./globals.css";
import { pageMetadata, SITE_URL, organizationJsonLd, websiteJsonLd } from "@/lib/seo";

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm",
  display: "swap",
  axes: ["opsz"],
});

export const metadata: Metadata = {
  ...pageMetadata("home"),
  // No site-wide canonical: each page sets its own self-referencing one
  // (an inherited canonical would point 404s and /auth at the homepage).
  alternates: undefined,
  metadataBase: new URL(SITE_URL),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${dmSans.variable}`}>
      <head>
        <link rel="adagents" type="application/json" href="/adagents.json" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify([organizationJsonLd, websiteJsonLd]) }}
        />
      </head>
      <body className="antialiased">
        <AuthRecoveryLandingGuard />
        <PageViewTracker />
        {children}
      </body>
    </html>
  );
}
