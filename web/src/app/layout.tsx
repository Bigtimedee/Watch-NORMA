import type { Metadata } from "next";
import { Bebas_Neue, DM_Sans } from "next/font/google";
import "./globals.css";

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
  title: "NORMA: Sports Alerts & Scores — Live Game Notifications for Bettors & Fans",
  description:
    "NORMA sends you push notifications at the exact moment your bet is covering, your prediction is resolving, or your team forces overtime. Free for iPhone. Track NBA, MLB, NCAA wagers, parlays, and prediction markets. Never miss the moment that matters to your money.",
  keywords: [
    "sports alerts", "live game notifications", "bet tracker", "sports betting app",
    "NBA alerts", "MLB alerts", "NCAA basketball", "parlay tracker",
    "spread alert", "moneyline alert", "sports scores", "prediction market",
    "Kalshi", "DraftKings", "FanDuel", "sports push notifications",
    "live sports", "overtime alert", "bet slip scanner", "wager tracker",
  ],
  metadataBase: new URL("https://getnorma.app"),
  icons: {
    icon: "/favicon-32.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "NORMA — Watch at the Perfect Moment",
    description:
      "Free sports app that alerts you when your bets are covering, your predictions are resolving, and your teams need you. 11 alert types. Zero noise. Download now.",
    url: "https://getnorma.app",
    siteName: "NORMA",
    type: "website",
    images: [{ url: "/og-image.jpg", width: 1400, height: 930 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "NORMA — Your Bet Is Covering. Your Team Needs You. Tune In Now.",
    description:
      "Live sports notifications based on YOUR money and YOUR teams. 12-18% CTR ad platform for advertisers. Free app for fans.",
    images: ["/og-image.jpg"],
  },
  alternates: {
    canonical: "https://getnorma.app",
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
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
