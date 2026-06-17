import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { fanOutWebhookEvent } from "@/lib/webhook-delivery";

const VALID_EVENT_TYPES = ["install", "registration", "deposit", "purchase", "custom"] as const;
const ATTRIBUTION_WINDOW_DAYS = 7;

function parseParams(request: NextRequest): Record<string, string | null> {
  const sp = request.nextUrl.searchParams;
  return {
    campaign_id: sp.get("campaign_id"),
    click_id: sp.get("click_id"),
    event_type: sp.get("event_type"),
    event_value_usd: sp.get("event_value_usd"),
    event_name: sp.get("event_name"),
    idempotency_key: sp.get("idempotency_key"),
  };
}

async function handlePostback(params: Record<string, string | null>) {
  const { campaign_id, click_id, event_type, event_value_usd, event_name, idempotency_key } = params;

  if (!campaign_id) return NextResponse.json({ error: "campaign_id is required" }, { status: 400 });
  if (!click_id) return NextResponse.json({ error: "click_id is required" }, { status: 400 });
  if (!event_type) return NextResponse.json({ error: "event_type is required" }, { status: 400 });
  if (!VALID_EVENT_TYPES.includes(event_type as typeof VALID_EVENT_TYPES[number])) {
    return NextResponse.json({ error: `event_type must be one of: ${VALID_EVENT_TYPES.join(", ")}` }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  // Look up click
  const { data: click } = await supabase
    .from("ad_clicks")
    .select("id, campaign_id, impression_id, moment_type, clicked_at, converted, idempotency_key")
    .eq("id", click_id)
    .single();

  if (!click) return NextResponse.json({ error: "Click not found" }, { status: 404 });
  if (String(click.campaign_id) !== String(campaign_id)) {
    return NextResponse.json({ error: "Click does not belong to this campaign" }, { status: 400 });
  }

  // Dedup check
  if (click.converted) {
    if (idempotency_key && click.idempotency_key === idempotency_key) {
      return NextResponse.json({ status: "already_recorded" });
    }
    return NextResponse.json({ status: "already_recorded" });
  }

  // Attribution window check
  const clickedAt = new Date(click.clicked_at as string);
  const windowMs = ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (Date.now() - clickedAt.getTime() > windowMs) {
    return NextResponse.json({ error: "Click is outside the attribution window" }, { status: 400 });
  }

  // Record conversion
  await supabase.from("conversions").insert({
    impression_id: click.impression_id,
    conversion_type: event_type === "custom" ? (event_name ?? "custom") : event_type,
    attribution_window_ms: Date.now() - clickedAt.getTime(),
    verification_source: "partner_api",
  });

  // Mark click as converted
  await supabase.from("ad_clicks").update({
    converted: true,
    postback_received_at: new Date().toISOString(),
    idempotency_key: idempotency_key ?? null,
  }).eq("id", click_id);

  // Get advertiser for webhook fan-out
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("advertiser_id, targeting_rules")
    .eq("id", campaign_id)
    .single();

  if (campaign) {
    // Async fan-out — don't block the response
    fanOutWebhookEvent(
      campaign.advertiser_id as number,
      "conversion.recorded",
      campaign_id,
      {
        click_id,
        event_type,
        event_value_usd: event_value_usd ? parseFloat(event_value_usd) : null,
        event_name: event_name ?? null,
        moment_type: click.moment_type,
      }
    ).catch(() => {});
  }

  return NextResponse.json({ status: "recorded" });
}

export async function GET(request: NextRequest) {
  return handlePostback(parseParams(request));
}

export async function POST(request: NextRequest) {
  let params: Record<string, string | null>;
  try {
    const body = await request.json() as Record<string, unknown>;
    params = {
      campaign_id: body.campaign_id as string ?? null,
      click_id: body.click_id as string ?? null,
      event_type: body.event_type as string ?? null,
      event_value_usd: body.event_value_usd != null ? String(body.event_value_usd) : null,
      event_name: body.event_name as string ?? null,
      idempotency_key: body.idempotency_key as string ?? null,
    };
  } catch {
    params = parseParams(request);
  }
  return handlePostback(params);
}
