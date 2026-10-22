import { entriesFor, renderUrlset } from "@/lib/sitemap";

export const revalidate = 900;

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const id = file.replace(/\.xml$/, "");
  const entries = file.endsWith(".xml") ? await entriesFor(id) : null;
  if (!entries) return new Response("Not found", { status: 404 });
  return new Response(renderUrlset(entries), { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
