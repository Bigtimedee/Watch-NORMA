import { toolError } from "../lib/errors.js";
import { apiClient } from "../lib/api-client.js";

interface CreativeInput {
  headline: string;
  body: string;
  icon_url: string;
  action_url: string;
  cta_text?: string;
}

interface SubmitBriefArgs {
  brief?: string;
  budget_usd?: number;
  start_date?: string;
  end_date?: string;
  confirm?: boolean;
  creative?: CreativeInput;
}

export async function submitBrief(args: Record<string, unknown> | undefined) {
  const a = (args ?? {}) as SubmitBriefArgs;

  if (!a.brief || typeof a.brief !== "string") {
    return toolError("brief is required and must be a string");
  }

  const payload: Record<string, unknown> = { brief: a.brief };
  if (typeof a.budget_usd === "number") payload.budget_usd = a.budget_usd;
  if (typeof a.start_date === "string") payload.start_date = a.start_date;
  if (typeof a.end_date === "string") payload.end_date = a.end_date;
  if (a.confirm === true) payload.confirm = true;
  if (a.creative) payload.creative = a.creative;

  let result: Record<string, unknown>;
  try {
    result = await apiClient.post("/api/ads/briefs", payload) as Record<string, unknown>;
  } catch (err) {
    return toolError((err as Error).message ?? "Failed to submit brief");
  }

  if (result.status === "proposed") {
    const plan = result.plan as Record<string, unknown>;
    const lines = [
      `**Campaign Plan Proposed**`,
      ``,
      `**Name:** ${plan.name}`,
      `**Moment types:** ${(plan.moment_types as string[]).join(", ")}`,
      `**Sports:** ${(plan.sports as string[]).join(", ")}`,
      `**Recommended bid:** $${plan.recommended_bid_cpm_usd} CPM`,
      `**Daily budget:** $${plan.daily_budget_usd}`,
      `**Total budget:** $${plan.total_budget_usd}`,
      `**Start date:** ${plan.start_date}`,
      plan.end_date ? `**End date:** ${plan.end_date}` : null,
      plan.target_cpa_usd ? `**Target CPA:** $${plan.target_cpa_usd}` : null,
      `**Estimated impressions:** ${plan.estimated_impressions?.toLocaleString()}`,
      `**Estimated conversions:** ${plan.estimated_conversions_low}–${plan.estimated_conversions_high}`,
      ``,
      `**Interpretation notes:**`,
      ...((plan.interpretation_notes as string[]) ?? []).map((n: string) => `- ${n}`),
      ``,
      `**Next step:** ${result.confirm_instruction}`,
    ].filter(Boolean);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  if (result.status === "created") {
    return {
      content: [{
        type: "text",
        text: `**Campaign created successfully**\n\nCampaign ID: \`${result.campaign_id}\`\nName: ${(result.plan as Record<string, unknown>)?.name}\n\nUse get_campaign_performance to track results after 24 hours.`,
      }],
    };
  }

  if (result.status === "insufficient") {
    const questions = (result.clarifying_questions as string[] | undefined) ?? [];
    const text = [
      `**Brief needs more detail**`,
      ``,
      result.message,
      ``,
      `**Clarifying questions:**`,
      ...questions.map((q: string) => `- ${q}`),
    ].join("\n");
    return { content: [{ type: "text", text }] };
  }

  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
