import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NORMA Advertiser Portal",
  description: "Real-Time Sports Intent Advertising",
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
