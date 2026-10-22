import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  isSport, findGame, gamePath, teamPath, fmtDay, fmtTime, broadcastTokens, getStreamingMap,
  gameJsonLd, breadcrumbJsonLd, appStoreUrl, absolute, listGames, isLive, isFinal, SPORT_LABEL, etDate,
  type GameWithTeams,
} from "@/lib/sports";
import { AppCta } from "@/components/sports/app-cta";
import { JsonLd } from "@/components/sports/json-ld";
import { SportsShell, Crumbs } from "@/components/sports/shell";

export const revalidate = 900;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

type Params = { sport: string; date: string; matchup: string };

async function load(p: Params): Promise<GameWithTeams | null> {
  if (!isSport(p.sport)) return null;
  return findGame(p.sport, p.date, p.matchup);
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const g = await load(await params);
  if (!g) return { title: "Game not found | NORMA", robots: { index: false } };
  const channels = broadcastTokens(g.broadcast).join(", ");
  const day = fmtDay(g.scheduled_at);
  const title = `${g.away.name} vs ${g.home.name}: What Channel, ${day} | NORMA`;
  const description = `${g.away.name} at ${g.home.name} is on ${channels}. Kickoff ${fmtTime(g.scheduled_at, "America/New_York")} ET on ${day}. Where to watch and stream, free alerts from NORMA.`;
  const url = absolute(gamePath(g));
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "NORMA", type: "website", images: [{ url: "/og-image.jpg", width: 1400, height: 930 }] },
    twitter: { card: "summary_large_image", title, description, images: ["/og-image.jpg"] },
    other: { "apple-itunes-app": `app-id=6759508383, app-argument=norma://games/${g.id}` },
  };
}

export default async function GamePage({ params }: { params: Promise<Params> }) {
  const p = await params;
  const g = await load(p);
  if (!g) notFound();

  const tokens = broadcastTokens(g.broadcast);
  const channels = tokens.join(", ");
  const day = fmtDay(g.scheduled_at);
  const et = fmtTime(g.scheduled_at, "America/New_York");
  const ct = fmtTime(g.scheduled_at, "America/Chicago");
  const streaming = await getStreamingMap(tokens);
  const now = new Date();
  const [homeNext, awayNext] = await Promise.all(
    [g.home, g.away].map((t) =>
      listGames({ sport: g.sport, from: new Date(Math.max(now.getTime(), new Date(g.scheduled_at).getTime() + 3600e3)), to: new Date(now.getTime() + 120 * 86400e3), teamId: t.id, limit: 1 }),
    ),
  );
  const cta = appStoreUrl(`game_${g.id}`);
  const hub = `/schedule/${g.sport}/today`;
  const crumbs = [
    { name: "NORMA", path: "/" },
    { name: `${SPORT_LABEL[g.sport]} games`, path: hub },
    { name: `${g.away.name} at ${g.home.name}`, path: gamePath(g) },
  ];
  const final = isFinal(g.status) && g.home_score != null && g.away_score != null;
  const faq = [
    { q: `What channel is ${g.away.name} vs ${g.home.name} on?`, a: `${g.away.name} at ${g.home.name} is on ${channels}.` },
    { q: `What time does ${g.away.name} at ${g.home.name} start?`, a: `It starts at ${et} ET (${ct} CT) on ${day}.` },
    ...(g.venue ? [{ q: `Where is ${g.away.name} at ${g.home.name} played?`, a: `The game is at ${g.venue}.` }] : []),
  ];
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <SportsShell>
      <JsonLd data={[gameJsonLd(g), breadcrumbJsonLd(crumbs), faqLd]} />
      <Crumbs items={crumbs} />
      <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
        What channel is {g.away.name} vs {g.home.name} on? {day}
      </h1>
      <section aria-label="Answer" className="mt-5 rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <p className="text-lg">
          <strong>{g.away.name} at {g.home.name}</strong> is on <strong>{channels}</strong>.
        </p>
        <p className="mt-2" style={{ color: "#cbd5e1" }}>
          {final ? "Started" : "Starts"} {et} ET / {ct} CT{g.venue ? ` at ${g.venue}` : ""}.
        </p>
        {(isLive(g.status) || final) && (
          <p className="mt-3 text-xl font-bold">
            {final ? "Final" : g.status === "halftime" ? "Halftime" : `Live${g.clock ? `, ${g.clock}` : ""}${g.period ? ` (period ${g.period})` : ""}`}: {g.away.abbreviation ?? g.away.name} {g.away_score ?? 0}, {g.home.abbreviation ?? g.home.name} {g.home_score ?? 0}
          </p>
        )}
        {g.status === "postponed" && <p className="mt-3 font-bold">This game is postponed.</p>}
        {g.status === "cancelled" && <p className="mt-3 font-bold">This game is cancelled.</p>}
      </section>

      <AppCta variant="inline" href={cta} pageType="game" gameId={g.id} headline={final ? "Never miss the end of the next one. Free alerts from NORMA." : undefined} />

      <section className="mt-8">
        <h2 className="text-xl font-bold">Where to watch</h2>
        <ul className="mt-3 space-y-2">
          {tokens.map((t) => (
            <li key={t}>
              <strong>{t}</strong>
              {streaming[t]?.length ? <span style={{ color: "#94a3b8" }}>: stream on {streaming[t].join(", ")}</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold">Teams</h2>
        <ul className="mt-3 space-y-2">
          {[{ t: g.away, next: awayNext[0] }, { t: g.home, next: homeNext[0] }].map(({ t, next }) => (
            <li key={t.id}>
              <Link href={teamPath(t)} className="font-semibold text-orange-300 hover:text-orange-200">{t.name} schedule and channels</Link>
              {next && (
                <span style={{ color: "#94a3b8" }}>
                  {" "}Next: <Link href={gamePath(next)} className="underline">{next.away.name} at {next.home.name}</Link> on {etDate(next.scheduled_at)}
                </span>
              )}
            </li>
          ))}
          <li><Link href={hub} className="underline">All {SPORT_LABEL[g.sport]} games today</Link></li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold">FAQ</h2>
        {faq.map((f) => (
          <div key={f.q} className="mt-3">
            <h3 className="font-semibold">{f.q}</h3>
            <p style={{ color: "#cbd5e1" }}>{f.a}</p>
          </div>
        ))}
      </section>

      <AppCta variant="sticky" href={cta} pageType="game" gameId={g.id} headline={final ? "Free alerts when your team's game gets close." : undefined} />
    </SportsShell>
  );
}
