import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/scope-middleware";
import { notFound, badRequest, serverError, isValidUrl, isReachableUrl, logApiAction } from "@/lib/ads-api";

type Params = Promise<{ id: string }>;

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const t0 = Date.now();
  const auth = await requireAuth(request, "campaigns:write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  if (!body.headline || typeof body.headline !== "string") return badRequest("headline is required");
  if ((body.headline as string).length > 60) return badRequest("headline must be <= 60 characters");
  if (!body.body || typeof body.body !== "string") return badRequest("body is required");
  if ((body.body as string).length > 120) return badRequest("body must be <= 120 characters");
  if (!body.icon_url || typeof body.icon_url !== "string" || !isValidUrl(body.icon_url as string)) {
    return badRequest("icon_url must be a valid HTTPS URL");
  }
  if (!body.action_url || typeof body.action_url !== "string" || !isValidUrl(body.action_url as string)) {
    return badRequest("action_url must be a valid URL");
  }
  if (!await isReachableUrl(body.icon_url as string)) return badRequest("icon_url must be publicly reachable");

  const supabase = createSupabaseAdmin();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, status, targeting_rules")
    .eq("id", id)
    .eq("advertiser_id", auth.ctx.advertiserId)
    .single();

  if (!campaign) return notFound(`Campaign ${id} not found`);

  const { count } = await supabase
    .from("creatives")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id);

  const variantLabel = `variant_${String.fromCharCode(97 + (count ?? 0))}`;

  const { data: creative, error } = await supabase
    .from("creatives")
    .insert({
      campaign_id: campaign.id,
      format: "notification_sponsor",
      sponsor_text: body.headline,
      cta_text: body.cta_text ?? null,
      cta_url: body.action_url,
      logo_url: body.icon_url,
      variant_label: variantLabel,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !creative) return serverError("Failed to create creative");

  // Create bids for new creative (same moment types as campaign)
  const momentTypes = (campaign.targeting_rules as Record<string, unknown>).moment_types as string[] ?? [];
  const bidCpmUsd = (campaign.targeting_rules as Record<string, unknown>).bid_cpm_usd as number ?? 0;
  const bids = momentTypes.map((mt) => ({
    campaign_id: campaign.id,
    creative_id: creative.id,
    moment_type: mt,
    bid_cents: Math.round(bidCpmUsd * 100),
    floor_aware: true,
    status: "active",
  }));
  if (bids.length > 0) await supabase.from("bids").insert(bids);

  // Fire prescreen asynchronously — does not block creative creation response
  void supabase.functions.invoke("creative-prescreen", {
    body: { creative_id: creative.id },
  });

  logApiAction("add_creative", auth.ctx.advertiserId, id, Date.now() - t0);

  return NextResponse.json({
    creative_id: String(creative.id),
    campaign_id: id,
    status: "pending",
    traffic_allocation: 1 / ((count ?? 0) + 1),
  }, { status: 201 });
}
