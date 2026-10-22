import Link from "next/link";
import { SPORTS, SPORT_LABEL } from "@/lib/sports";

export function SportsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-24" style={{ background: "#0f172a", color: "#F5F3EE" }}>
      <header className="mx-auto flex max-w-4xl items-center justify-between px-5 py-5">
        <Link href="/" aria-label="NORMA home">
          <img src="/logo.png" alt="NORMA" className="h-7 w-auto" width={110} height={28} />
        </Link>
      </header>
      <main className="mx-auto max-w-4xl px-5">{children}</main>
      <SportsFooterLinks />
    </div>
  );
}

export function SportsFooterLinks() {
  return (
    <nav aria-label="Schedules" className="mx-auto mt-12 max-w-4xl px-5 py-6" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex flex-wrap gap-x-6 gap-y-2" style={{ fontSize: 13, color: "#94a3b8" }}>
        {SPORTS.map((s) => (
          <Link key={s} href={`/schedule/${s}/today`} className="hover:text-white">
            {SPORT_LABEL[s]} games today
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function Crumbs({ items }: { items: { name: string; path: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" style={{ fontSize: 12, color: "#94a3b8" }} className="mb-4">
      {items.map((it, i) => (
        <span key={it.path}>
          {i > 0 && " / "}
          {i === items.length - 1 ? <span>{it.name}</span> : <Link href={it.path} className="hover:text-white">{it.name}</Link>}
        </span>
      ))}
    </nav>
  );
}
