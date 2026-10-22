import { notFound } from "next/navigation";
import Link from "next/link";
import {
  isSport, listGames, gamePath, absolute, appStoreUrl, breadcrumbJsonLd, SPORT_LABEL, isoWeek, type Sport,
} from "@/lib/sports";
import { AppCta } from "@/components/sports/app-cta";
import { JsonLd } from "@/components/sports/json-ld";
import { SportsShell, Crumbs } from "@/components/sports/shell";
import { GameList } from "@/components/sports/game-list";

export async function Hub({ sport, from, to, title, path, showDate }: { sport: string; from: Date; to: Date; title: string; path: string; showDate: boolean }) {
  if (!isSport(sport)) notFound();
  const s = sport as Sport;
  const games = await listGames({ sport: s, from, to });
  const crumbs = [
    { name: "NORMA", path: "/" },
    { name: title, path },
  ];
  const list = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    itemListElement: games.map((g, i) => ({ "@type": "ListItem", position: i + 1, url: absolute(gamePath(g)), name: `${g.away.name} at ${g.home.name}` })),
  };
  const wk = isoWeek(new Date());
  return (
    <SportsShell>
      <JsonLd data={[list, breadcrumbJsonLd(crumbs)]} />
      <Crumbs items={crumbs} />
      <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
      <p className="mt-3" style={{ color: "#cbd5e1" }}>Every {SPORT_LABEL[s]} game with its TV channel and start time.</p>
      <div className="mt-6"><GameList games={games} showDate={showDate} /></div>
      <p className="mt-6 flex gap-4" style={{ fontSize: 14 }}>
        <Link href={`/schedule/${s}/today`} className="underline">Today</Link>
        <Link href={`/schedule/${s}/week/${wk.week}`} className="underline">This week</Link>
      </p>
      <AppCta variant="sticky" href={appStoreUrl(`hub_${s}`)} pageType="hub" headline="Free alerts when your game gets close." />
    </SportsShell>
  );
}
