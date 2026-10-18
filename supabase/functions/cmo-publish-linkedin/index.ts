// =============================================================================
// NORMA CMO Agent — cmo-publish-linkedin Edge Function
// Queries linkedin-only draft/scheduled posts due for publishing and posts them
// to the NORMA LinkedIn company page (organization Posts / UGC API).
// Twitter/X content_calendar rows are never selected and must never be posted
// here (cmo-publish owns X; PR #32 twitter-only guard stays intact).
// Invoked by pg_cron every 30 minutes and optionally via HTTP.
//
// Company page: https://www.linkedin.com/company/watch-norma/
// Org id: 146336141  URN: urn:li:organization:146336141
// Org id resolution: LINKEDIN_ORGANIZATION_ID env → social_accounts.account_id
// (platform=linkedin) → this NORMA default. LINKEDIN_ACCESS_TOKEN is required.
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  appendNote,
  classifyPublishCandidate,
  CONTENT_CALENDAR_LINKEDIN_PLATFORM,
  DUE_POSTS_QUERY,
  GUARD_HOLD_STATUS,
  GUARD_REASON_STATIC_MEDIA,
  guardHoldNote,
  LINKEDIN_STATUS_MUTATION_FILTER,
  MAX_POSTS_PER_DAY,
  parseRunOptions,
  runLinkedInPublishLoop,
  staticMediaFlag,
  type CalendarPublishCandidate,
  type GuardReason,
} from "./logic.ts";
import { loadLinkedInConfig, publishOrganizationPost } from "./linkedin-client.ts";

// Untyped DB client (no generated types), same pattern as cmo-publish.
// deno-lint-ignore no-explicit-any
type Db = SupabaseClient<any, "public", any>;

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
  supabase: Db,
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
  supabase: Db,
  limit: number,
  asOf: Date = new Date(),
): Promise<ContentCalendarRow[]> {
  const now = asOf.toISOString();

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
  supabase: Db,
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

/**
 * Guard hold (static_media): status -> 'paused' plus a stale-guard line
 * appended to human_notes, same as cmo-publish. Only from linkedin
 * draft/scheduled, so a row paused/claimed in the meantime is left alone.
 * Rows are never deleted. Returns true when the hold was written.
 */
async function markGuardHold(
  supabase: Db,
  post: ContentCalendarRow,
  reason: GuardReason,
  now: Date,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("content_calendar")
    .update({
      status: GUARD_HOLD_STATUS,
      human_notes: appendNote(post.human_notes, guardHoldNote(reason, now)),
    })
    .eq("id", post.id)
    .eq("platform", LINKEDIN_STATUS_MUTATION_FILTER.platform)
    .in("status", [...LINKEDIN_STATUS_MUTATION_FILTER.statuses])
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(`[cmo-publish-linkedin] Failed to hold post ${post.id} (${reason}): ${error.message}`);
    return false;
  }
  return !!data;
}

/**
 * Best-effort org id from social_accounts. Never reads access_token —
 * LINKEDIN_ACCESS_TOKEN remains the only token source.
 */
async function lookupLinkedInSocialAccountId(
  supabase: Db,
): Promise<string | undefined> {
  const { data, error } = await supabase
    .from("social_accounts")
    .select("account_id")
    .eq("platform", "linkedin")
    .maybeSingle();

  if (error) {
    console.warn(
      `[cmo-publish-linkedin] social_accounts linkedin lookup skipped: ${error.message}`,
    );
    return undefined;
  }
  const accountId = typeof data?.account_id === "string" ? data.account_id.trim() : "";
  return accountId || undefined;
}

async function markFailed(
  supabase: Db,
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

  const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

  // Parse the payload before LinkedIn config: a dry run only classifies
  // due rows (never uploads/posts), so it must not require the LinkedIn
  // token. Live runs still fail fast on a missing token below.
  let earlyPayload: Record<string, unknown> = {};
  try {
    const bodyText = await req.text();
    if (bodyText.trim()) {
      earlyPayload = JSON.parse(bodyText);
    }
  } catch {
    // Ignore
  }
  const { dryRun: earlyDryRun } = parseRunOptions(earlyPayload, new Date());

  const envOrgId = Deno.env.get("LINKEDIN_ORGANIZATION_ID");
  const socialAccountId = envOrgId?.trim()
    ? undefined
    : await lookupLinkedInSocialAccountId(supabase);

  const linkedInLoaded = loadLinkedInConfig(
    {
      LINKEDIN_ACCESS_TOKEN: Deno.env.get("LINKEDIN_ACCESS_TOKEN"),
      LINKEDIN_ORGANIZATION_ID: Deno.env.get("LINKEDIN_ORGANIZATION_ID"),
      LINKEDIN_CLIENT_ID: Deno.env.get("LINKEDIN_CLIENT_ID"),
      LINKEDIN_CLIENT_SECRET: Deno.env.get("LINKEDIN_CLIENT_SECRET"),
      LINKEDIN_REFRESH_TOKEN: Deno.env.get("LINKEDIN_REFRESH_TOKEN"),
      LINKEDIN_API_VERSION: Deno.env.get("LINKEDIN_API_VERSION"),
    },
    { socialAccountId },
  );

  if (!linkedInLoaded.ok && !earlyDryRun) {
    const missing = linkedInLoaded.missing.join(", ");
    console.error(`[cmo-publish-linkedin] Missing LinkedIn secrets: ${missing}`);
    return new Response(
      JSON.stringify({
        error: `Missing LinkedIn secrets: ${missing}`,
        hint: "Set LINKEDIN_ACCESS_TOKEN via `supabase secrets set`. LINKEDIN_ORGANIZATION_ID is optional and defaults to the NORMA company page (146336141 / https://www.linkedin.com/company/watch-norma/). Do not post LinkedIn drafts to X.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!linkedInLoaded.ok) {
    console.warn(
      "[cmo-publish-linkedin] DRY RUN without LinkedIn secrets; classifying only, nothing will post.",
    );
  }

  const requestPayload: Record<string, unknown> = earlyPayload;

  const now = new Date();
  const { dryRun, asOf } = parseRunOptions(requestPayload, now);
  console.log(
    `[cmo-publish-linkedin] Run started at ${now.toISOString()}, source=${requestPayload.source ?? "direct"}` +
      (dryRun ? `, DRY RUN as_of=${asOf.toISOString()}` : ""),
  );

  const linkedInConfig = linkedInLoaded.ok ? linkedInLoaded.config : undefined;
  if (linkedInConfig) {
    console.log(
      `[cmo-publish-linkedin] Organization ${linkedInConfig.organizationUrn} (source=${linkedInConfig.organizationIdSource})`,
    );
  }

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
    duePosts = await fetchDuePosts(supabase, remainingSlots, asOf);
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
      JSON.stringify({
        success: true,
        published: 0,
        message: "No posts due",
        dry_run: dryRun,
        as_of: asOf.toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log(`[cmo-publish-linkedin] Found ${duePosts.length} LinkedIn post(s) due.`);

  // Dry run: classify only. Never uploads media, posts, or writes status.
  // static_media is surfaced exactly like the live guard hold below.
  if (dryRun) {
    const results = duePosts.map((post) => {
      const disposition = classifyPublishCandidate(post);
      if (disposition.kind === "pause" && disposition.reason === GUARD_REASON_STATIC_MEDIA) {
        console.warn(
          `[cmo-publish-linkedin] Post ${post.id} NOT posted (dry run): ${staticMediaFlag()}; would hold as status='paused'.`,
        );
      }
      return {
        id: post.id,
        success: false,
        skipped: true,
        would: disposition.kind === "publish" ? "publish" : `${disposition.kind}:${disposition.reason}`,
        ...(disposition.kind === "pause" && disposition.reason === GUARD_REASON_STATIC_MEDIA
          ? { detail: staticMediaFlag() }
          : {}),
      };
    });
    return new Response(
      JSON.stringify({
        success: true,
        dry_run: true,
        as_of: asOf.toISOString(),
        due: results.length,
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const cycle = await runLinkedInPublishLoop({
    posts: duePosts,
    publish: (input) =>
      linkedInConfig
        ? publishOrganizationPost(linkedInConfig, input)
        : Promise.reject(new Error("LinkedIn config unavailable in dry run")),
    markPublished: (id, platformPostId) => markPublished(supabase, id, platformPostId),
    markFailed: (id, reason) => markFailed(supabase, id, reason),
    markPaused: (post, reason) => markGuardHold(supabase, post as ContentCalendarRow, reason, now),
    log: (message) => console.log(`[cmo-publish-linkedin] ${message}`),
  });

  const pausedCount = cycle.results.filter((r) => r.held_paused).length;
  console.log(
    `[cmo-publish-linkedin] Run complete. Published: ${cycle.published}, Failed: ${cycle.failed}, Skipped: ${cycle.skipped}, Paused: ${pausedCount}`,
  );

  return new Response(
    JSON.stringify({
      success: true,
      published: cycle.published,
      failed: cycle.failed,
      skipped: cycle.skipped,
      paused: pausedCount,
      total_today: publishedTodayCount + cycle.published,
      results: cycle.results,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
