// cmo-generate theme rotation — consumer auto-post pool.
// sportsbooks / wager_tracking are excluded from this pool (marketing 2026-09-05).

import { isExcludedConsumerAutoPostTheme } from "../_shared/social-media-select.ts";

export const CONTENT_THEMES = [
  "user_benefit_never_miss",
  "user_benefit_bet_resolved",
  "advertiser_highest_intent",
  "advertiser_viewability",
  "tech_vickrey_auction",
  "tech_thompson_sampling",
  "cultural_sports_moment",
  "app_launch_hype",
  "referral_growth",
  "moment_types_showcase",
  "social_proof_engagement",
  // Football ad moment themes (Football M1) — weighted higher on Sat/Sun
  "football_kickoff_moment",
  "football_red_zone_moment",
  "football_two_minute_warning",
  "football_overtime_moment",
  "football_fourth_quarter_comeback",
  // SM-02 additions — generated separately, not via Claude theme rotation
  "alert_called_it",
  "norma_in_numbers",
] as const;

export type ContentTheme = typeof CONTENT_THEMES[number];

/**
 * Weighted theme pick for the consumer / brand auto-post cron.
 * Never returns sportsbooks or wager_tracking.
 */
export function selectThemes(now: Date, count: number): ContentTheme[] {
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 6=Sat
  const hourUTC = now.getUTCHours();

  let weights: Partial<Record<ContentTheme, number>> = {};

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    // Weekend: heavy user and cultural content + football ad moments
    weights = {
      cultural_sports_moment: 5,
      user_benefit_never_miss: 4,
      user_benefit_bet_resolved: 4,
      football_kickoff_moment: dayOfWeek === 6 ? 5 : 4,
      football_red_zone_moment: 5,
      football_fourth_quarter_comeback: 4,
      football_two_minute_warning: 3,
      football_overtime_moment: 3,
      moment_types_showcase: 3,
      app_launch_hype: 3,
      social_proof_engagement: 3,
      referral_growth: 2,
      advertiser_highest_intent: 1,
      advertiser_viewability: 1,
      tech_vickrey_auction: 1,
      tech_thompson_sampling: 1,
    };
  } else if (hourUTC >= 12 && hourUTC <= 16) {
    weights = {
      advertiser_highest_intent: 5,
      advertiser_viewability: 4,
      tech_vickrey_auction: 4,
      tech_thompson_sampling: 3,
      football_kickoff_moment: 3,
      football_red_zone_moment: 3,
      football_two_minute_warning: 2,
      app_launch_hype: 2,
      user_benefit_never_miss: 2,
      moment_types_showcase: 2,
      cultural_sports_moment: 1,
      referral_growth: 1,
      user_benefit_bet_resolved: 1,
      social_proof_engagement: 1,
      football_fourth_quarter_comeback: 1,
      football_overtime_moment: 1,
    };
  } else {
    weights = {
      user_benefit_never_miss: 4,
      user_benefit_bet_resolved: 4,
      moment_types_showcase: 3,
      app_launch_hype: 3,
      cultural_sports_moment: 3,
      football_kickoff_moment: (dayOfWeek === 4 || dayOfWeek === 1) ? 4 : 2,
      football_fourth_quarter_comeback: (dayOfWeek === 4 || dayOfWeek === 1) ? 3 : 1,
      football_two_minute_warning: (dayOfWeek === 4 || dayOfWeek === 1) ? 3 : 1,
      football_red_zone_moment: 3,
      football_overtime_moment: 2,
      referral_growth: 2,
      social_proof_engagement: 2,
      advertiser_highest_intent: 2,
      tech_vickrey_auction: 2,
      advertiser_viewability: 1,
      tech_thompson_sampling: 1,
    };
  }

  // Hard-zero excluded consumer themes even if a future edit reintroduces them.
  for (const theme of Object.keys(weights)) {
    if (isExcludedConsumerAutoPostTheme(theme)) {
      delete weights[theme as ContentTheme];
    }
  }

  const pool: ContentTheme[] = [];
  for (const [theme, weight] of Object.entries(weights)) {
    for (let i = 0; i < (weight as number); i++) {
      pool.push(theme as ContentTheme);
    }
  }

  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const selected: ContentTheme[] = [];
  const seen = new Set<ContentTheme>();
  for (const theme of shuffled) {
    if (isExcludedConsumerAutoPostTheme(theme)) continue;
    if (!seen.has(theme)) {
      selected.push(theme);
      seen.add(theme);
    }
    if (selected.length >= count) break;
  }

  for (const theme of CONTENT_THEMES) {
    if (selected.length >= count) break;
    if (isExcludedConsumerAutoPostTheme(theme)) continue;
    if (!seen.has(theme)) {
      selected.push(theme);
      seen.add(theme);
    }
  }

  return selected;
}
