/**
 * generate-advertiser-onepager.ts
 *
 * Generates a personalized markdown one-pager for advertiser outreach,
 * pulling LIVE supply forecast and floor price data from the NORMA database.
 *
 * Usage:
 *   npx ts-node scripts/generate-advertiser-onepager.ts \
 *     --name "DraftKings" \
 *     --category sportsbook \
 *     --moments bet_resolved,spread_alert,close_game
 *
 * Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * (copy from .env.local or Supabase project settings)
 *
 * Output: stdout (pipe to a .md file or paste into email)
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// ─── CLI parsing ───────────────────────────────────────────────────────────────

function getArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

const advertiserName = getArg("--name");
const category = getArg("--category") as
  | "sportsbook"
  | "streaming"
  | "commerce"
  | "ticketing"
  | "fantasy"
  | null;
const momentsArg = getArg("--moments");

if (!advertiserName || !category || !momentsArg) {
  console.error(
    "Usage: npx ts-node scripts/generate-advertiser-onepager.ts " +
      '--name "DraftKings" --category sportsbook --moments bet_resolved,spread_alert'
  );
  process.exit(1);
}

const targetMoments = momentsArg.split(",").map((m) => m.trim());

// ─── Supabase client ───────────────────────────────────────────────────────────

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ─── Data helpers ──────────────────────────────────────────────────────────────

function formatCpm(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatBudgetExample(
  budgetDollars: number,
  avgFloorCents: number
): string {
  if (avgFloorCents <= 0) return "N/A";
  const impressions = Math.round((budgetDollars * 100) / avgFloorCents);
  return `~${impressions.toLocaleString()} impressions`;
}

type MomentLabel = Record<string, string>;
const MOMENT_LABELS: MomentLabel = {
  bet_resolved: "Bet Resolved",
  close_game: "Close Game (≤6 pts, 2H)",
  overtime: "Overtime",
  spread_alert: "Spread Alert",
  moneyline_alert: "Moneyline Alert",
  total_alert: "Total Alert",
  prop_alert: "Player Prop Alert",
  position_alert: "Prediction Market Alert",
  foul_trouble: "Foul Trouble",
  follow_alert: "Team Follow Alert",
};

type CategoryCta = Record<string, string>;
const CATEGORY_CTA: CategoryCta = {
  sportsbook: "Bet Now",
  streaming: "Watch Now",
  commerce: "Shop Now",
  ticketing: "Get Tickets",
  fantasy: "Check Your Lineup",
};

type CategoryNote = Record<string, string>;
const CATEGORY_NOTE: CategoryNote = {
  sportsbook:
    "Geo-restricted to your licensed states (enforced by NORMA — no wasted spend outside your footprint).",
  streaming:
    "No geo-restrictions. One-tap deep-link to your app already built into NORMA's Watch flow.",
  commerce:
    "No geo-restrictions. Best on post_outcome moments: users are in peak euphoria within seconds of a win.",
  ticketing:
    "Timezone-inferred geo-targeting available to prioritize local game markets.",
  fantasy:
    "No geo-restrictions. Strong product-audience fit: NORMA users are active fantasy and betting players.",
};

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAhead = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);
  const sevenDaysAheadStr = sevenDaysAhead.toISOString().slice(0, 10);

  // Fetch supply forecasts for target moments, next 7 days
  const { data: forecasts, error: forecastError } = await supabase
    .from("supply_forecasts")
    .select(
      "forecast_date, moment_type, league, predicted_moments, predicted_moments_low, predicted_moments_high, predicted_eligible_users, games_scheduled"
    )
    .in("moment_type", targetMoments)
    .gte("forecast_date", today.toISOString().slice(0, 10))
    .lte("forecast_date", sevenDaysAheadStr)
    .order("forecast_date", { ascending: true });

  if (forecastError) {
    console.error("Failed to fetch supply forecasts:", forecastError.message);
    process.exit(1);
  }

  // Fetch floor prices for target moments
  const { data: floors, error: floorError } = await supabase
    .from("floor_prices")
    .select("moment_type, floor_cents, premium_multiplier")
    .in("moment_type", targetMoments);

  if (floorError) {
    console.error("Failed to fetch floor prices:", floorError.message);
    process.exit(1);
  }

  // Aggregate forecasts by moment type
  type MomentSummary = {
    totalMoments: number;
    minMoments: number;
    maxMoments: number;
    totalUsers: number;
    days: number;
  };
  const momentSummary: Record<string, MomentSummary> = {};

  for (const f of forecasts ?? []) {
    if (!momentSummary[f.moment_type]) {
      momentSummary[f.moment_type] = {
        totalMoments: 0,
        minMoments: 0,
        maxMoments: 0,
        totalUsers: 0,
        days: 0,
      };
    }
    const s = momentSummary[f.moment_type];
    s.totalMoments += f.predicted_moments ?? 0;
    s.minMoments += f.predicted_moments_low ?? f.predicted_moments ?? 0;
    s.maxMoments += f.predicted_moments_high ?? f.predicted_moments ?? 0;
    s.totalUsers += f.predicted_eligible_users ?? 0;
    s.days++;
  }

  // Build floor price lookup
  const floorMap: Record<string, number> = {};
  for (const f of floors ?? []) {
    floorMap[f.moment_type] = f.floor_cents;
  }

  // Compute average floor across target moments for budget example
  const floorValues = targetMoments
    .map((m) => floorMap[m])
    .filter((v): v is number => v !== undefined);
  const avgFloor =
    floorValues.length > 0
      ? Math.round(floorValues.reduce((a, b) => a + b, 0) / floorValues.length)
      : 0;

  const totalProjectedMoments = Object.values(momentSummary).reduce(
    (sum, s) => sum + s.totalMoments,
    0
  );

  const cta = CATEGORY_CTA[category] ?? "Learn More";
  const note = CATEGORY_NOTE[category] ?? "";

  const hasForecastData = (forecasts ?? []).length > 0;

  // ─── Build one-pager markdown ──────────────────────────────────────────────

  const lines: string[] = [];
  const datestamp = today.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  lines.push(`# NORMA × ${advertiserName}`);
  lines.push(`**Personalized supply forecast** — generated ${datestamp}`);
  lines.push("");
  lines.push(
    "NORMA delivers sponsored push notifications to opted-in sports fans at precisely defined emotional moments. This is not a banner or feed placement — it is a message that arrives when a specific, measurable thing just happened in a game your user cares about."
  );
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("## Your Moment Types");
  lines.push("");

  if (hasForecastData) {
    lines.push(
      `Projected impressions over the next 7 days for **${advertiserName}**'s selected moments:\n`
    );
    lines.push("| Moment | Label | Proj. Moments (7d) | Floor CPM |");
    lines.push("|--------|-------|--------------------|-----------|");

    for (const moment of targetMoments) {
      const label = MOMENT_LABELS[moment] ?? moment;
      const summary = momentSummary[moment];
      const floor = floorMap[moment];

      const momentStr = summary
        ? summary.minMoments !== summary.maxMoments
          ? `${summary.minMoments.toLocaleString()}–${summary.maxMoments.toLocaleString()}`
          : summary.totalMoments.toLocaleString()
        : "*no upcoming games*";

      const cpmStr = floor !== undefined ? formatCpm(floor) : "N/A";

      lines.push(`| \`${moment}\` | ${label} | ${momentStr} | ${cpmStr} |`);
    }

    lines.push("");
    lines.push(
      `**Total projected moments (7 days):** ${totalProjectedMoments.toLocaleString()}`
    );
  } else {
    lines.push(
      "_No games are scheduled in the next 7 days for these moment types. Supply forecast will update as games are added to the schedule._"
    );
    lines.push("");
    lines.push("Floor CPM reference:");
    for (const moment of targetMoments) {
      const floor = floorMap[moment];
      lines.push(
        `- \`${moment}\` — ${floor !== undefined ? formatCpm(floor) : "N/A"} floor`
      );
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Budget Examples");
  lines.push("");

  if (avgFloor > 0) {
    const examples = [100, 250, 500, 1000];
    lines.push(
      `Based on an average floor CPM of ${formatCpm(avgFloor)} across selected moments:\n`
    );
    lines.push("| Budget | Projected Impressions | CTA |");
    lines.push("|--------|-----------------------|-----|");
    for (const budget of examples) {
      lines.push(
        `| $${budget} | ${formatBudgetExample(budget, avgFloor)} | ${cta} |`
      );
    }
    lines.push("");
    lines.push(
      "_Actual clearing prices may be higher if competitive bids are present. Budget is depleted by actual clearing prices, never floor prices alone._"
    );
  } else {
    lines.push(
      "_Floor price data unavailable for selected moments. Contact team for pricing._"
    );
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Attribution");
  lines.push("");
  lines.push(
    "NORMA reports inferred conversions: app-engagement signals (deep-link tap, app open after notification) measured within 24 hours of impression. These are **labeled as inferred** in all reports — not claimed as verified."
  );
  lines.push("");
  lines.push(
    "For verified conversion tracking: configure a postback webhook from your MMP (Adjust, AppsFlyer, Branch). Setup takes under 5 minutes. See `docs/partner-api/postback-webhook-spec.md`."
  );
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("## Category Note");
  lines.push("");
  lines.push(note);
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("## Get Started");
  lines.push("");
  lines.push("- **Self-serve**: [getnorma.app/advertise](https://getnorma.app/advertise) — $100 minimum");
  lines.push("- **Credit-matched pilot**: $250 spend + $250 match = $500 effective (founder-assisted)");
  lines.push("- **Questions**: Reply to this email or book a 15-min call");
  lines.push("");
  lines.push(
    "_This one-pager was generated from live NORMA supply data. Forecasts update as the game schedule is confirmed._"
  );

  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
