import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Advertiser Portal | NORMA",
  description: "Sign in or create an account to advertise on NORMA.",
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
