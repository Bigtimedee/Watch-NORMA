import type { Metadata } from "next";
import { isSport, SPORT_LABEL, absolute, etDate } from "@/lib/sports";
import { Hub } from "../hub";
import { OG_IMAGE } from "@/lib/seo";

export const revalidate = 300;
type Params = { sport: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { sport } = await params;
  if (!isSport(sport)) return { robots: { index: false } };
  const title = `${SPORT_LABEL[sport]} Games Today: TV Channels & Times | NORMA`;
  const description = `What channel is every ${SPORT_LABEL[sport]} game on today? Start times and TV channels, updated through the day.`;
  const url = absolute(`/schedule/${sport}/today`);
  // Own openGraph/twitter so share cards (X, IG, FB) don't fall back to the
  // homepage's football title when Today's Games links an NBA/NCAAM slate.
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "NORMA", type: "website", images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: ["/og-image.jpg"] },
    // Safari smart app banner, same as the team pages (plan 4.6.3: every social link has an install path).
    other: { "apple-itunes-app": "app-id=6759508383" },
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
