import crypto from "crypto";
import { createSupabaseAdmin } from "./supabase-admin";

export const VALID_EVENTS = [
  "impression.served", "click.recorded", "conversion.recorded",
  "campaign.budget_50pct", "campaign.budget_90pct",
  "campaign.ended", "campaign.bid_adjusted",
] as const;

export type WebhookEvent = typeof VALID_EVENTS[number];

export interface WebhookPayload {
  event: WebhookEvent;
  event_id: string;
  timestamp: string;
  campaign_id: string;
  data: Record<string, unknown>;
}

function signPayload(body: string, secret: string): string {
  const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${sig}`;
}

export async function deliverWebhook(
  endpointId: string,
  url: string,
  secret: string,
  payload: WebhookPayload,
  attempt = 1
): Promise<{ success: boolean; statusCode?: number; durationMs: number }> {
  const body = JSON.stringify(payload);
  const signature = signPayload(body, secret);
  const t0 = Date.now();

  const TIMEOUT_MS = 10_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const supabase = createSupabaseAdmin();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Norma-Signature": signature,
        "X-Norma-Event": payload.event,
        "X-Norma-Event-Id": payload.event_id,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const durationMs = Date.now() - t0;
    const success = res.status >= 200 && res.status < 300;

    // Log delivery
    const backoffMinutes = [1, 5, 30, 120, 720];
    const nextRetryAt = !success && attempt <= 5
      ? new Date(Date.now() + backoffMinutes[attempt - 1] * 60 * 1000).toISOString()
      : null;

    await supabase.from("webhook_delivery_log").insert({
      endpoint_id: endpointId,
      event_type: payload.event,
      event_id: payload.event_id,
      attempt,
      status: success ? "delivered" : "failed",
      response_status: res.status,
      duration_ms: durationMs,
      next_retry_at: nextRetryAt,
    });

    if (success) {
      await supabase.from("webhook_endpoints").update({
        last_delivered_at: new Date().toISOString(),
        failure_count: 0,
      }).eq("id", endpointId);
    } else {
      const { data: ep } = await supabase.from("webhook_endpoints").select("failure_count").eq("id", endpointId).single();
      const newCount = ((ep?.failure_count as number) ?? 0) + 1;
      await supabase.from("webhook_endpoints").update({
        failure_count: newCount,
        is_active: newCount < 5,
      }).eq("id", endpointId);
    }

    return { success, statusCode: res.status, durationMs };
  } catch {
    clearTimeout(timer);
    const durationMs = Date.now() - t0;
    await supabase.from("webhook_delivery_log").insert({
      endpoint_id: endpointId,
      event_type: payload.event,
      event_id: payload.event_id,
      attempt,
      status: "timeout",
      duration_ms: durationMs,
    });
    return { success: false, durationMs };
  }
}

export async function fanOutWebhookEvent(
  advertiserId: number,
  eventType: WebhookEvent,
  campaignId: string,
  data: Record<string, unknown>
): Promise<void> {
  const supabase = createSupabaseAdmin();
  const { data: endpoints } = await supabase
    .from("webhook_endpoints")
    .select("id, url, secret")
    .eq("advertiser_id", advertiserId)
    .eq("is_active", true)
    .contains("events", [eventType]);

  if (!endpoints || endpoints.length === 0) return;

  const payload: WebhookPayload = {
    event: eventType,
    event_id: `evt_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
    timestamp: new Date().toISOString(),
    campaign_id: campaignId,
    data,
  };

  // Fire-and-forget: don't await delivery in the request path
  Promise.all(
    endpoints.map((ep) =>
      deliverWebhook(ep.id as string, ep.url as string, ep.secret as string, payload)
    )
  ).catch(() => {});
}
