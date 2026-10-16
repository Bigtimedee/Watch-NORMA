import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found | NORMA",
  description: "This page doesn't exist on getnorma.app.",
  robots: { index: false, follow: true },
  alternates: { canonical: null },
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4" style={{ background: "#0f172a", color: "#F5F3EE" }}>
      <h1 className="text-3xl font-bold">Page not found</h1>
      <Link href="/" className="text-orange-400 hover:text-orange-300">Back to NORMA</Link>
    </div>
  );
}
