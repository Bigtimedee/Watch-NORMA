// =============================================================================
// NORMA CMO Agent — cmo-publish-linkedin Edge Function
// Queries linkedin-only draft/scheduled posts due for publishing and posts them
// to the NORMA LinkedIn company page (organization Posts / UGC API).
// Twitter/X content_calendar rows are never selected and must never be posted
// here (cmo-publish owns X; PR #32 twitter-only guard stays intact).
// Invoked by pg_cron every 30 minutes and optionally via HTTP.
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  CONTENT_CALENDAR_LINKEDIN_PLATFORM,
  DUE_POSTS_QUERY,
  LINKEDIN_STATUS_MUTATION_FILTER,
  MAX_POSTS_PER_DAY,
  runLinkedInPublishLoop,
  type CalendarPublishCandidate,
} from "./logic.ts";
import { loadLinkedInConfig, publishOrganizationPost } from "./linkedin-client.ts";

interface ContentCalendarRow extends CalendarPublishCandidate {
  content_type?: string;
  scheduled_for: string | null;
  published_at: string | null;
  generation_prompt?: string | null;
  human_notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

async function countPublishedToday(
  supabase: ReturnType<typeof createClient>,
  platform: string,
): Promise<number> {
  const startOfDayET = new Date();
  startOfDayET.setUTCHours(startOfDayET.getUTCHours() - 5);
  startOfDayET.setUTCHours(0, 0, 0, 0);
  startOfDayET.setUTCHours(startOfDayET.getUTCHours() + 5);

  const { count, error } = await supabase
    .from("content_calendar")
    .select("id", { count: "exact", head: true })
    .eq("platform", platform)
    .eq("status", "published")
    .gte("published_at", startOfDayET.toISOString());

  if (error) {
    console.error(`[cmo-publish-linkedin] Error counting today's posts: ${error.message}`);
    return 0;
  }

  return count ?? 0;
}

async function fetchDuePosts(
  supabase: ReturnType<typeof createClient>,
  limit: number,
): Promise<ContentCalendarRow[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from(DUE_POSTS_QUERY.table)
    .select("*")
    .eq("platform", DUE_POSTS_QUERY.platform)
    .in("status", [...DUE_POSTS_QUERY.statuses])
    .lte("scheduled_for", now)
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch due posts: ${error.message}`);
  }

  return (data as ContentCalendarRow[]) ?? [];
}

async function markPublished(
  supabase: ReturnType<typeof createClient>,
  postId: string,
  platformPostId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("content_calendar")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      platform_post_id: platformPostId,
    })
    .eq("id", postId)
    .eq("platform", LINKEDIN_STATUS_MUTATION_FILTER.platform)
    .in("status", [...LINKEDIN_STATUS_MUTATION_FILTER.statuses])
    .is("platform_post_id", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to mark post ${postId} as published: ${error.message}`);
  }
  if (!data) {
    throw new Error(
      `Failed to mark post ${postId} as published: no matching linkedin draft/scheduled row (already published or wrong platform)`,
    );
  }
}

async function markFailed(
  supabase: ReturnType<typeof createClient>,
  postId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from("content_calendar")
    .update({
      status: "failed",
      human_notes: `[AUTO-FAIL ${new Date().toISOString()}] ${reason.slice(0, 500)}`,
    })
    .eq("id", postId)
    .eq("platform", LINKEDIN_STATUS_MUTATION_FILTER.platform)
    .in("status", [...LINKEDIN_STATUS_MUTATION_FILTER.statuses]);

  if (error) {
    console.error(`[cmo-publish-linkedin] Failed to mark post ${postId} as failed: ${error.message}`);
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ status: "ok", function: "cmo-publish-linkedin" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const missingInfra = [
    !supabaseUrl && "SUPABASE_URL",
    !supabaseServiceKey && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);

  if (missingInfra.length > 0) {
    console.error(`[cmo-publish-linkedin] Missing env vars: ${missingInfra.join(", ")}`);
    return new Response(
      JSON.stringify({ error: `Missing environment variables: ${missingInfra.join(", ")}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const linkedInLoaded = loadLinkedInConfig({
    LINKEDIN_ACCESS_TOKEN: Deno.env.get("LINKEDIN_ACCESS_TOKEN"),
    LINKEDIN_ORGANIZATION_ID: Deno.env.get("LINKEDIN_ORGANIZATION_ID"),
    LINKEDIN_CLIENT_ID: Deno.env.get("LINKEDIN_CLIENT_ID"),
    LINKEDIN_CLIENT_SECRET: Deno.env.get("LINKEDIN_CLIENT_SECRET"),
    LINKEDIN_REFRESH_TOKEN: Deno.env.get("LINKEDIN_REFRESH_TOKEN"),
    LINKEDIN_API_VERSION: Deno.env.get("LINKEDIN_API_VERSION"),
  });

  if (!linkedInLoaded.ok) {
    const missing = linkedInLoaded.missing.join(", ");
    console.error(`[cmo-publish-linkedin] Missing LinkedIn secrets: ${missing}`);
    return new Response(
      JSON.stringify({
        error: `Missing LinkedIn secrets: ${missing}`,
        hint: "Set LINKEDIN_ACCESS_TOKEN and LINKEDIN_ORGANIZATION_ID via `supabase secrets set`. Do not post LinkedIn drafts to X.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let requestPayload: Record<string, unknown> = {};
  try {
    const bodyText = await req.text();
    if (bodyText.trim()) {
      requestPayload = JSON.parse(bodyText);
    }
  } catch {
    // Ignore
  }

  const now = new Date();
  console.log(
    `[cmo-publish-linkedin] Run started at ${now.toISOString()}, source=${requestPayload.source ?? "direct"}`,
  );

  const supabase = createClient(supabaseUrl!, supabaseServiceKey!);
  const linkedInConfig = linkedInLoaded.config;

  const publishedTodayCount = await countPublishedToday(
    supabase,
    CONTENT_CALENDAR_LINKEDIN_PLATFORM,
  );
  console.log(
    `[cmo-publish-linkedin] Published today: ${publishedTodayCount}/${MAX_POSTS_PER_DAY}`,
  );

  if (publishedTodayCount >= MAX_POSTS_PER_DAY) {
    console.log("[cmo-publish-linkedin] Daily post limit reached. Skipping run.");
    return new Response(
      JSON.stringify({
        success: true,
        skipped: true,
        reason: "daily_limit_reached",
        published_today: publishedTodayCount,
        limit: MAX_POSTS_PER_DAY,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const remainingSlots = MAX_POSTS_PER_DAY - publishedTodayCount;

  let duePosts: ContentCalendarRow[];
  try {
    duePosts = await fetchDuePosts(supabase, remainingSlots);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cmo-publish-linkedin] Failed to fetch due posts: ${message}`);
    return new Response(
      JSON.stringify({ error: "Failed to fetch posts", details: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  if (duePosts.length === 0) {
    console.log("[cmo-publish-linkedin] No LinkedIn posts due for publishing.");
    return new Response(
      JSON.stringify({ success: true, published: 0, message: "No posts due" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log(`[cmo-publish-linkedin] Found ${duePosts.length} LinkedIn post(s) due.`);

  const cycle = await runLinkedInPublishLoop({
    posts: duePosts,
    publish: (input) => publishOrganizationPost(linkedInConfig, input),
    markPublished: (id, platformPostId) => markPublished(supabase, id, platformPostId),
    markFailed: (id, reason) => markFailed(supabase, id, reason),
    log: (message) => console.log(`[cmo-publish-linkedin] ${message}`),
  });

  console.log(
    `[cmo-publish-linkedin] Run complete. Published: ${cycle.published}, Failed: ${cycle.failed}, Skipped: ${cycle.skipped}`,
  );

  return new Response(
    JSON.stringify({
      success: true,
      published: cycle.published,
      failed: cycle.failed,
      skipped: cycle.skipped,
      total_today: publishedTodayCount + cycle.published,
      results: cycle.results,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
