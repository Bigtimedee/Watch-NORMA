import { privateMeta } from "@/lib/seo";

export const metadata = privateMeta("Set a New Password | NORMA", "Choose a new password for your NORMA account.");

export default function AuthResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
