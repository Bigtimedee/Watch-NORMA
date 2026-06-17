import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/scope-middleware";
import { badRequest } from "@/lib/ads-api";
import { parseBrief, buildPlan, getClarifyingQuestions, BriefPlan } from "@/lib/brief-parser";

interface CreativeInput {
  headline: string;
  body: string;
  icon_url: string;
  action_url: string;
  cta_text?: string;
}

async function logBrief(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  advertiser_id: number,
  brief: string,
  status: string,
  plan: BriefPlan | null,
  campaign_id: string | null
) {
  await supabase.from("brief_log").insert({
    advertiser_id,
    brief,
    status,
    plan: plan ?? null,
    campaign_id,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request, "campaigns:write");
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  const briefText = body.brief as string | undefined;
  if (!briefText || typeof briefText !== "string" || briefText.trim().length < 10) {
    return badRequest("brief must be a string of at least 10 characters");
  }

  const budgetOverride = typeof body.budget_usd === "number" ? body.budget_usd : undefined;
  const startOverride = typeof body.start_date === "string" ? body.start_date : undefined;
  const endOverride = typeof body.end_date === "string" ? body.end_date : undefined;
  const confirm = body.confirm === true;
  const creative = body.creative as CreativeInput | undefined;

  const parsed = await parseBrief(briefText);
  const questions = getClarifyingQuestions(parsed);

  if (questions.length > 0 && !budgetOverride && parsed.moment_types.length === 0) {
    const supabase = createSupabaseAdmin();
    await logBrief(supabase, auth.ctx.advertiserId, briefText, "insufficient", null, null);
    return NextResponse.json({
      status: "insufficient",
      message: "Brief is too vague to construct a campaign plan.",
      clarifying_questions: questions,
    });
  }

  const plan = buildPlan(parsed, budgetOverride, startOverride, endOverride);

  if (!plan) {
    const supabase = createSupabaseAdmin();
    await logBrief(supabase, auth.ctx.advertiserId, briefText, "insufficient", null, null);
    return NextResponse.json({
      status: "insufficient",
      message: "Brief is too vague to construct a campaign plan.",
      clarifying_questions: getClarifyingQuestions(parsed),
    });
  }

  if (!confirm) {
    const supabase = createSupabaseAdmin();
    await logBrief(supabase, auth.ctx.advertiserId, briefText, "proposed", plan, null);
    return NextResponse.json({
      status: "proposed",
      plan,
      confirm_instruction:
        "Call POST /api/ads/briefs again with confirm: true and add a 'creative' field to execute this plan.",
    });
  }

  // Stage 2: execute
  if (!creative) {
    return badRequest("creative is required when confirm is true");
  }
  if (!creative.headline || typeof creative.headline !== "string") return badRequest("creative.headline is required");
  if (creative.headline.length > 60) return badRequest("creative.headline must be <= 60 characters");
  if (!creative.body || typeof creative.body !== "string") return badRequest("creative.body is required");
  if (creative.body.length > 120) return badRequest("creative.body must be <= 120 characters");
  if (!creative.icon_url || typeof creative.icon_url !== "string") return badRequest("creative.icon_url is required");
  if (!creative.action_url || typeof creative.action_url !== "string") return badRequest("creative.action_url is required");

  const supabase = createSupabaseAdmin();

  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .insert({
      advertiser_id: auth.ctx.advertiserId,
      name: plan.name,
      budget_cents: Math.round(plan.total_budget_usd * 100),
      daily_budget_cents: Math.round(plan.daily_budget_usd * 100),
      flight_start: new Date(plan.start_date).toISOString(),
      flight_end: plan.end_date ? new Date(plan.end_date).toISOString() : null,
      targeting_rules: {
        moment_types: plan.moment_types,
        sports: plan.sports,
        bid_cpm_usd: plan.recommended_bid_cpm_usd,
        creative_body: creative.body,
        auto_bid: plan.target_cpa_usd
          ? { enabled: true, target_cpa_cents: Math.round(plan.target_cpa_usd * 100), max_bid_cents: Math.round(plan.recommended_bid_cpm_usd * 100), strategy: "target_cpa" }
          : undefined,
      },
      status: "active",
    })
    .select("id")
    .single();

  if (campErr || !campaign) {
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }

  await supabase.from("creatives").insert({
    campaign_id: campaign.id,
    format: "notification_sponsor",
    sponsor_text: creative.headline,
    cta_text: creative.cta_text ?? null,
    cta_url: creative.action_url,
    logo_url: creative.icon_url,
    variant_label: "variant_a",
    status: "pending",
  });

  const bidCents = Math.round(plan.recommended_bid_cpm_usd * 100);
  await supabase.from("bids").insert(
    plan.moment_types.map((mt) => ({
      campaign_id: campaign.id,
      moment_type: mt,
      bid_cents: bidCents,
      floor_aware: true,
      status: "active",
    }))
  );

  const campaign_id = String(campaign.id);
  await logBrief(supabase, auth.ctx.advertiserId, briefText, "created", plan, campaign_id);

  return NextResponse.json({ status: "created", campaign_id, plan }, { status: 201 });
}
