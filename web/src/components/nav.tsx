"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/reporting", label: "Reporting" },
  { href: "/inventory", label: "Inventory" },
  { href: "/billing", label: "Billing" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  return (
    <nav className="border-b border-slate-800 bg-slate-900">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-8">
          <Link href="/dashboard">
            <img src="/logo.png" alt="NORMA" className="h-8 w-auto" />
          </Link>
          <div className="flex gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  pathname.startsWith(item.href)
                    ? "bg-slate-800 text-white"
                    : "text-slate-400 hover:text-white"
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="text-sm text-slate-400 hover:text-white"
        >
          Sign Out
        </button>
      </div>
    </nav>
  );
}
