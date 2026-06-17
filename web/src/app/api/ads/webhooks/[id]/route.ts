import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/scope-middleware";
import { notFound, serverError } from "@/lib/ads-api";

type Params = Promise<{ id: string }>;

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const auth = await requireAuth(request, "campaigns:write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const supabase = createSupabaseAdmin();

  const { data: endpoint } = await supabase
    .from("webhook_endpoints")
    .select("id")
    .eq("id", id)
    .eq("advertiser_id", auth.ctx.advertiserId)
    .single();

  if (!endpoint) return notFound(`Webhook ${id} not found`);

  const { error } = await supabase
    .from("webhook_endpoints")
    .update({ is_active: false })
    .eq("id", id);

  if (error) return serverError(error.message);
  return NextResponse.json({ deactivated: true, id });
}
