import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NORMA — Real-Time Sports Intent Advertising",
  description:
    "NORMA tells fans exactly when to tune in to live games based on their wagers, predictions, and team loyalties. For advertisers, it's access to the most engaged sports audience on the planet.",
  metadataBase: new URL("https://getnorma.app"),
  icons: {
    icon: "/favicon-32.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "NORMA — The Perfect Moment to Watch. The Perfect Moment to Advertise.",
    description:
      "Real-time push notifications for sports bettors and fans. Self-serve advertising marketplace with second-price auction, privacy-first targeting, and AI optimization.",
    url: "https://getnorma.app",
    siteName: "NORMA",
    type: "website",
    images: [{ url: "/og-image.jpg", width: 1400, height: 930 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "NORMA — Real-Time Sports Intent Advertising",
    description:
      "Push notifications at the perfect moment. Advertising at peak fan engagement.",
    images: ["/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-white antialiased">{children}</body>
    </html>
  );
}
