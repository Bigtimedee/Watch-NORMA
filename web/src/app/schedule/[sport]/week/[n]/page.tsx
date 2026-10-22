import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSport, SPORT_LABEL, absolute, isoWeek, isoWeekStart } from "@/lib/sports";
import { Hub } from "../../hub";

export const revalidate = 900;
type Params = { sport: string; n: string };

/** n = ISO week number of the current year (e.g. /schedule/nfl/week/43). */
function range(n: string) {
  const w = Number(n);
  if (!Number.isInteger(w) || w < 1 || w > 53) return null;
  const year = isoWeek(new Date()).year;
  const from = isoWeekStart(year, w);
  return { from, to: new Date(from.getTime() + 7 * 86400e3) };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { sport, n } = await params;
  if (!isSport(sport) || !range(n)) return { robots: { index: false } };
  const from = range(n)!.from;
  const label = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long", day: "numeric" }).format(from);
  return {
    title: `${SPORT_LABEL[sport]} Schedule, Week of ${label}: TV Channels | NORMA`,
    description: `Every ${SPORT_LABEL[sport]} game the week of ${label} with TV channel and start time.`,
    alternates: { canonical: absolute(`/schedule/${sport}/week/${Number(n)}`) },
  };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { sport, n } = await params;
  const r = range(n);
  if (!r || !isSport(sport)) notFound();
  const label = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long", day: "numeric" }).format(r.from);
  return <Hub sport={sport} from={r.from} to={r.to} title={`${SPORT_LABEL[sport]} games, week of ${label}`} path={`/schedule/${sport}/week/${Number(n)}`} showDate />;
}
