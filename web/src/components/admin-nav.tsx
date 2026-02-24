"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

const adminNavItems = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/advertisers", label: "Advertisers" },
  { href: "/admin/campaigns", label: "Campaigns" },
  { href: "/admin/revenue", label: "Revenue" },
  { href: "/admin/fraud", label: "Fraud" },
];

export function AdminNav() {
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
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard">
              <img src="/logo.png" alt="NORMA" className="h-8 w-auto" />
            </Link>
            <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
              Admin
            </span>
          </div>
          <div className="flex gap-1">
            {adminNavItems.map((item) => (
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
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-sm text-slate-400 hover:text-white"
          >
            Back to Portal
          </Link>
          <button
            onClick={handleSignOut}
            className="text-sm text-slate-400 hover:text-white"
          >
            Sign Out
          </button>
        </div>
      </div>
    </nav>
  );
}
