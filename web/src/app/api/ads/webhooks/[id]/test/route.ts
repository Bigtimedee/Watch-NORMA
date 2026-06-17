import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/scope-middleware";
import { notFound } from "@/lib/ads-api";
import { deliverWebhook, WebhookPayload } from "@/lib/webhook-delivery";

type Params = Promise<{ id: string }>;

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const auth = await requireAuth(request, "campaigns:write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const supabase = createSupabaseAdmin();

  const { data: endpoint } = await supabase
    .from("webhook_endpoints")
    .select("id, url, secret, events")
    .eq("id", id)
    .eq("advertiser_id", auth.ctx.advertiserId)
    .single();

  if (!endpoint) return notFound(`Webhook ${id} not found`);

  const testPayload: WebhookPayload = {
    event: "conversion.recorded",
    event_id: `evt_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
    timestamp: new Date().toISOString(),
    campaign_id: "test",
    data: {
      click_id: "test-click-id",
      event_type: "install",
      event_value_usd: null,
      moment_type: "bet_resolved",
      cpm_paid_usd: 0.60,
      test: true,
    },
  };

  const result = await deliverWebhook(
    endpoint.id as string,
    endpoint.url as string,
    endpoint.secret as string,
    testPayload
  );

  return NextResponse.json({
    success: result.success,
    status_code: result.statusCode ?? null,
    duration_ms: result.durationMs,
    message: result.success
      ? "Test event delivered successfully"
      : "Test event delivery failed — check your endpoint and try again",
  });
}
