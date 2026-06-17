import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/scope-middleware";
import { notFound, badRequest, serverError, logApiAction } from "@/lib/ads-api";

type Params = Promise<{ id: string }>;

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const t0 = Date.now();
  const auth = await requireAuth(request, "campaigns:write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const supabase = createSupabaseAdmin();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, status")
    .eq("id", id)
    .eq("advertiser_id", auth.ctx.advertiserId)
    .single();

  if (!campaign) return notFound(`Campaign ${id} not found`);
  if (campaign.status !== "active") return badRequest(`Campaign is not active (current status: ${campaign.status})`);

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("campaigns")
    .update({ status: "paused", updated_at: now })
    .eq("id", id);

  if (error) return serverError(error.message);

  logApiAction("pause_campaign", auth.ctx.advertiserId, id, Date.now() - t0);
  return NextResponse.json({ id, status: "paused", updated_at: now });
}
