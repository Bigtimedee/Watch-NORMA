import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  isSport, getTeam, listGames, teamPath, gamePath, absolute, appStoreUrl, breadcrumbJsonLd, broadcastTokens,
  fmtDay, fmtTime, SPORT_LABEL, LEAGUE_NAME, SPORT_SCHEMA, type Team, type Sport,
} from "@/lib/sports";
import { AppCta } from "@/components/sports/app-cta";
import { JsonLd } from "@/components/sports/json-ld";
import { SportsShell, Crumbs } from "@/components/sports/shell";
import { GameList } from "@/components/sports/game-list";
import Link from "next/link";

export const revalidate = 900;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

type Params = { sport: string; team: string };

async function load(p: Params): Promise<(Team & { sport: Sport }) | null> {
  if (!isSport(p.sport)) return null;
  return getTeam(p.sport, p.team);
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const t = await load(await params);
  if (!t) return { title: "Team not found | NORMA", robots: { index: false } };
  const title = `${t.name} Game Today: Channel, Time & Schedule | NORMA`;
  const description = `What channel is the ${t.name} game on? Next game time, TV channel and where to stream, plus recent results. Free ${t.name} alerts from NORMA.`;
  const url = absolute(teamPath(t));
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "NORMA", type: "website", images: [{ url: "/og-image.jpg", width: 1400, height: 930 }] },
    other: { "apple-itunes-app": "app-id=6759508383" },
  };
}

export default async function TeamPage({ params }: { params: Promise<Params> }) {
  const t = await load(await params);
  if (!t) notFound();
  const now = new Date();
  const [upcoming, recentDesc] = await Promise.all([
    listGames({ sport: t.sport, teamId: t.id, from: new Date(now.getTime() - 4 * 3600e3), to: new Date(now.getTime() + 365 * 86400e3), limit: 5 }),
    listGames({ sport: t.sport, teamId: t.id, from: new Date(now.getTime() - 365 * 86400e3), to: new Date(now.getTime() - 4 * 3600e3), limit: 5, ascending: false }),
  ]);
  const next = upcoming[0];
  const crumbs = [
    { name: "NORMA", path: "/" },
    { name: `${SPORT_LABEL[t.sport]} games`, path: `/schedule/${t.sport}/today` },
    { name: t.name, path: teamPath(t) },
  ];
  const teamLd = {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    name: t.name,
    url: absolute(teamPath(t)),
    sport: SPORT_SCHEMA[t.sport],
    ...(t.logo_url ? { logo: t.logo_url } : {}),
    memberOf: { "@type": "SportsOrganization", name: LEAGUE_NAME[t.sport] },
  };
  return (
    <SportsShell>
      <JsonLd data={[teamLd, breadcrumbJsonLd(crumbs)]} />
      <Crumbs items={crumbs} />
      <h1 className="text-3xl font-bold sm:text-4xl">What channel is the {t.name} game on?</h1>
      <section className="mt-5 rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {next ? (
          <p className="text-lg">
            Next: <Link href={gamePath(next)} className="font-bold underline">{next.away.name} at {next.home.name}</Link> on{" "}
            <strong>{broadcastTokens(next.broadcast).join(", ")}</strong>, {fmtDay(next.scheduled_at)} at {fmtTime(next.scheduled_at, "America/New_York")} ET /{" "}
            {fmtTime(next.scheduled_at, "America/Chicago")} CT.
          </p>
        ) : (
          <p className="text-lg">No upcoming {t.name} game with a listed broadcast yet.</p>
        )}
      </section>
      <AppCta variant="inline" href={appStoreUrl(`team_${t.id}`)} pageType="team" teamId={t.id} headline={`Get an alert when the ${t.name} game gets close. Free.`} />
      <section className="mt-8">
        <h2 className="text-xl font-bold">Upcoming {t.name} games</h2>
        <GameList games={upcoming} showDate />
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-bold">Recent {t.name} results</h2>
        <GameList games={recentDesc} showDate />
      </section>
      <AppCta variant="sticky" href={appStoreUrl(`team_${t.id}`)} pageType="team" teamId={t.id} headline={`Free ${t.name} alerts when it matters.`} />
    </SportsShell>
  );
}
