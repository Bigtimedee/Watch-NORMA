import type { Metadata } from "next";
import { isSport, SPORT_LABEL, absolute, etDate } from "@/lib/sports";
import { Hub } from "../hub";

export const revalidate = 300;
type Params = { sport: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { sport } = await params;
  if (!isSport(sport)) return { robots: { index: false } };
  const title = `${SPORT_LABEL[sport]} Games Today: TV Channels & Times | NORMA`;
  return {
    title,
    description: `What channel is every ${SPORT_LABEL[sport]} game on today? Start times and TV channels, updated through the day.`,
    alternates: { canonical: absolute(`/schedule/${sport}/today`) },
  };
}

/** Today in US Eastern: [00:00 ET, 24:00 ET). */
function todayEt(): { from: Date; to: Date } {
  const d = etDate(new Date());
  const probe = new Date(`${d}T12:00:00Z`);
  const offH = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
    .formatToParts(probe).find((p) => p.type === "timeZoneName")?.value.match(/-(\d+)/)?.[1] ?? "5";
  const from = new Date(`${d}T00:00:00Z`);
  from.setUTCHours(Number(offH));
  return { from, to: new Date(from.getTime() + 24 * 3600e3) };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { sport } = await params;
  const { from, to } = todayEt();
  const label = isSport(sport) ? SPORT_LABEL[sport] : "";
  return <Hub sport={sport} from={from} to={to} title={`${label} games today`} path={`/schedule/${sport}/today`} showDate={false} />;
}
