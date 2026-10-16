import type { MetadataRoute } from "next";
import { SITE_URL, SITEMAP_ROUTES } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return SITEMAP_ROUTES.map((path) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`,
    changeFrequency: path === "/" ? "daily" : "monthly",
    priority: path === "/" ? 1 : path.includes("-") ? 0.3 : 0.7,
  }));
}
