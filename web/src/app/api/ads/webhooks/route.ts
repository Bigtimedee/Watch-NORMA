import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/scope-middleware";
import { badRequest, serverError, notFound } from "@/lib/ads-api";
import { VALID_EVENTS } from "@/lib/webhook-delivery";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request, "campaigns:read");
  if (auth instanceof NextResponse) return auth;

  const supabase = createSupabaseAdmin();
  const { data: endpoints } = await supabase
    .from("webhook_endpoints")
    .select("id, url, events, is_active, batch_impressions, created_at, last_delivered_at, failure_count")
    .eq("advertiser_id", auth.ctx.advertiserId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ endpoints: endpoints ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "campaigns:write");
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  if (!body.url || typeof body.url !== "string") return badRequest("url is required");
  try { new URL(body.url as string); } catch { return badRequest("url must be a valid URL"); }

  if (!Array.isArray(body.events) || body.events.length === 0) return badRequest("events must be a non-empty array");
  const invalidEvents = (body.events as string[]).filter((e) => !VALID_EVENTS.includes(e as typeof VALID_EVENTS[number]));
  if (invalidEvents.length > 0) return badRequest(`Invalid events: ${invalidEvents.join(", ")}`);

  const secret = crypto.randomBytes(32).toString("hex");

  const supabase = createSupabaseAdmin();
  const { data: endpoint, error } = await supabase
    .from("webhook_endpoints")
    .insert({
      advertiser_id: auth.ctx.advertiserId,
      url: body.url,
      events: body.events,
      secret,
      batch_impressions: body.batch_impressions ?? false,
    })
    .select("id, url, events, is_active, created_at")
    .single();

  if (error || !endpoint) return serverError("Failed to register webhook");

  return NextResponse.json({
    id: endpoint.id,
    url: endpoint.url,
    events: endpoint.events,
    secret,
    is_active: endpoint.is_active,
    created_at: endpoint.created_at,
    warning: "Save this secret — it will not be shown again. Use it to verify X-Norma-Signature headers.",
  }, { status: 201 });
}
