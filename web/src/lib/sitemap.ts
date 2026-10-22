import { SITE_URL, SITEMAP_ROUTES } from "@/lib/seo";
import { SPORTS, isSport, listTeams, listGames, gamePath, teamPath, isoWeek, type Sport } from "@/lib/sports";

export type SitemapEntry = { loc: string; lastmod?: string; changefreq?: string; priority?: number };

export const SITEMAP_IDS = ["static", ...SPORTS] as const;

export function renderUrlset(entries: SitemapEntry[]): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries
      .map(
        (e) =>
          `<url><loc>${esc(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}${e.changefreq ? `<changefreq>${e.changefreq}</changefreq>` : ""}${e.priority != null ? `<priority>${e.priority}</priority>` : ""}</url>`,
      )
      .join("\n") +
    `\n</urlset>\n`
  );
}

export function renderIndex(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    SITEMAP_IDS.map((id) => `<sitemap><loc>${SITE_URL}/sitemap/${id}.xml</loc></sitemap>`).join("\n") +
    `\n</sitemapindex>\n`
  );
}

export async function entriesFor(id: string): Promise<SitemapEntry[] | null> {
  if (id === "static") {
    return SITEMAP_ROUTES.map((path) => ({
      loc: `${SITE_URL}${path === "/" ? "" : path}`,
      changefreq: path === "/" ? "daily" : "monthly",
      priority: path === "/" ? 1 : path.includes("-") ? 0.3 : 0.7,
    }));
  }
  if (!isSport(id)) return null;
  const sport = id as Sport;
  const now = Date.now();
  const [teams, games] = await Promise.all([
    listTeams(sport),
    listGames({ sport, from: new Date(now - 7 * 86400e3), to: new Date(now + 30 * 86400e3) }),
  ]);
  const wk = isoWeek(new Date()).week;
  const hubs: SitemapEntry[] = [
    { loc: `${SITE_URL}/schedule/${sport}/today`, changefreq: "hourly", priority: 0.8 },
    ...[wk, wk + 1]
      .filter((w) => w <= 53)
      .map((w) => ({ loc: `${SITE_URL}/schedule/${sport}/week/${w}`, changefreq: "daily", priority: 0.6 })),
  ];
  return [
    ...hubs,
    ...teams.filter((t) => t.slug).map((t) => ({ loc: `${SITE_URL}${teamPath(t)}`, changefreq: "daily", priority: 0.6 })),
    ...games.map((g) => ({
      loc: `${SITE_URL}${gamePath(g)}`,
      lastmod: g.updated_at ? new Date(g.updated_at).toISOString() : undefined,
      changefreq: "hourly",
      priority: 0.7,
    })),
  ];
}
