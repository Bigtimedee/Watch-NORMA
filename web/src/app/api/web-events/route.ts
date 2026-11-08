import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

// Anonymous web analytics sink (page_view, seo_cta_click etc). Allowlisted names only.
// page_view comes from components/page-view-tracker.tsx on every route change.
const ALLOWED = new Set(["page_view", "seo_cta_click", "referral_link_open", "referral_cta_click"]);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body?.event_name ?? "");
    if (!ALLOWED.has(name)) return NextResponse.json({ error: "unknown event" }, { status: 400 });
    const raw = body?.properties && typeof body.properties === "object" ? body.properties : {};
    const properties: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw).slice(0, 10)) {
      if (v == null) continue;
      properties[k.slice(0, 40)] = String(v).slice(0, 200);
    }
    const { error } = await createSupabaseAdmin().from("web_events").insert({ event_name: name, properties });
    if (error) return NextResponse.json({ ok: false }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
