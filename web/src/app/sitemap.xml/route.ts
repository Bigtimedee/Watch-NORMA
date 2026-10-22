import { renderIndex } from "@/lib/sitemap";

export const revalidate = 3600;

export function GET() {
  return new Response(renderIndex(), { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
