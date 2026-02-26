import { requireAdmin } from "@/lib/admin";
import { KpiCard } from "@/components/kpi-card";
import { formatCents, formatNumber, formatPercent } from "@/lib/utils";

const PIPELINE_STEPS = [
  {
    step: 1,
    title: "Moment Fires",
    description:
      "A scoreable moment occurs (game start, close game, lead change, final minutes, overtime, etc.). The alert engine identifies this as an ad-eligible event.",
  },
  {
    step: 2,
    title: "Fatigue Check",
    description:
      "Has this user received an ad in the last 30 minutes? If yes, skip. Prevents notification fatigue while preserving ad quality.",
  },
  {
    step: 3,
    title: "Frequency Caps",
    description:
      "Per-campaign cap: max 1 impression per user per campaign per 24h. Per-user cap: max 3 ad impressions per day across all campaigns.",
  },
  {
    step: 4,
    title: "Floor Price + Dynamic Premium",
    description:
      "Look up the base floor for this moment type, then apply dynamic premium multipliers based on context (tournament, weekend, game density, late-game/OT).",
  },
  {
    step: 5,
    title: "Eligible Bids",
    description:
      "Filter to bids where effective_bid >= floor_price. Campaigns with insufficient budget or exhausted daily caps are excluded.",
  },
  {
    step: 6,
    title: "Direct Deal Check",
    description:
      "If a direct deal (guaranteed-delivery contract) exists for this moment type and hasn't hit its cap, it wins automatically at the contracted rate.",
  },
  {
    step: 7,
    title: "Category Exclusivity",
    description:
      "Only one advertiser per category (e.g., one sportsbook, one beer brand) per notification. If two sportsbooks bid, only the higher bidder proceeds.",
  },
  {
    step: 8,
    title: "Budget Pacing",
    description:
      "Check each campaign's daily budget and hourly throttle. If a campaign has spent >110% of its hourly ideal pace, temporarily exclude it to spread delivery evenly.",
  },
  {
    step: 9,
    title: "Rank by Effective Bid Value",
    description:
      "Sort remaining bids by effective_bid_value = base_bid \u00d7 game_relevance_boost \u00d7 creative_performance_boost \u00d7 segment_match_boost.",
  },
  {
    step: 10,
    title: "Second-Price Clearing",
    description:
      "Winner pays $0.01 above the second-highest bid (Vickrey auction). This incentivizes truthful bidding — advertisers always bid their true value.",
  },
  {
    step: 11,
    title: "Creative Selection (Thompson Sampling)",
    description:
      "The winning campaign may have multiple creative variants. Thompson Sampling (multi-armed bandit) selects which variant to show, balancing exploration and exploitation.",
  },
];

const DYNAMIC_PREMIUMS = [
  {
    condition: "NCAA Tournament game",
    multiplier: "1.5x",
    rationale: "Peak audience engagement and attention",
  },
  {
    condition: "Weekend (Sat/Sun)",
    multiplier: "1.2x",
    rationale: "Higher concurrent viewership",
  },
  {
    condition: "10+ live games simultaneously",
    multiplier: "1.3x",
    rationale: "High-density moments are premium inventory",
  },
  {
    condition: "Late-game or OT (< 2 min, margin \u2264 6)",
    multiplier: "1.5x",
    rationale: "Maximum user attention and emotional engagement",
  },
];

const OPTIMIZER_MATRIX = [
  {
    clearingRatio: "High (>80%)",
    fillRate: "High (>70%)",
    trend: "Stable/Up",
    action: "+5% to +10%",
    rationale: "Demand exceeds supply — room to raise",
  },
  {
    clearingRatio: "High (>80%)",
    fillRate: "Low (<40%)",
    trend: "Down",
    action: "-5% to -10%",
    rationale: "Bids clear but inventory goes unfilled",
  },
  {
    clearingRatio: "Low (<50%)",
    fillRate: "High (>70%)",
    trend: "Stable",
    action: "No change",
    rationale: "Market is balanced",
  },
  {
    clearingRatio: "Low (<50%)",
    fillRate: "Low (<40%)",
    trend: "Down",
    action: "-10%",
    rationale: "Floors too high — suppressing demand",
  },
  {
    clearingRatio: "Medium",
    fillRate: "Medium",
    trend: "Up",
    action: "+5%",
    rationale: "Gradual increase while market grows",
  },
];

export default async function AuctionEnginePage() {
  const { supabase } = await requireAdmin();

  // Live KPI queries
  const [
    { count: totalAuctions },
    { data: impressionStats },
    { data: floorPrices },
    { data: engagementRates },
    { count: activeCampaigns },
  ] = await Promise.all([
    supabase
      .from("impressions")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("impressions")
      .select("clearing_price_cents"),
    supabase
      .from("floor_prices")
      .select("*")
      .order("moment_type"),
    supabase
      .from("learned_engagement_rates")
      .select("*")
      .order("moment_type"),
    supabase
      .from("campaigns")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
  ]);

  const impressions = impressionStats ?? [];
  const avgClearing =
    impressions.length > 0
      ? Math.round(
          impressions.reduce(
            (sum: number, i: any) => sum + (i.clearing_price_cents ?? 0),
            0
          ) / impressions.length
        )
      : 0;
  const totalRevenue = impressions.reduce(
    (sum: number, i: any) => sum + (i.clearing_price_cents ?? 0),
    0
  );

  return (
    <>
      <h1 className="text-2xl font-bold text-white">Auction Engine</h1>
      <p className="mt-1 text-sm text-slate-400">
        Real-time second-price ad auction with Thompson Sampling creative
        optimization
      </p>

      {/* ── Section 1: Auction Pipeline ── */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-white">
          Auction Pipeline
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Every ad-eligible moment runs through this 11-step pipeline in
          real time (&lt;50ms p99)
        </p>
        <div className="mt-4 space-y-3">
          {PIPELINE_STEPS.map((s) => (
            <div
              key={s.step}
              className="flex gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                {s.step}
              </div>
              <div>
                <h3 className="font-medium text-white">{s.title}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {s.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Section 2: Live Auction KPIs ── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-white">
          Live Auction KPIs
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Total Auctions Run"
            value={formatNumber(totalAuctions ?? 0)}
          />
          <KpiCard
            title="Avg Clearing Price"
            value={formatCents(avgClearing)}
          />
          <KpiCard
            title="Total Auction Revenue"
            value={formatCents(totalRevenue)}
          />
          <KpiCard
            title="Active Campaigns"
            value={formatNumber(activeCampaigns ?? 0)}
          />
        </div>
      </section>

      {/* ── Section 3: Current Floor Prices ── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-white">
          Current Floor Prices
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Base floors set per moment type, with dynamic premiums applied at
          auction time
        </p>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Moment Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Base Floor
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Premium Multiplier
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(floorPrices ?? []).map((fp: any) => (
                <tr key={fp.id} className="hover:bg-slate-900/50">
                  <td className="px-6 py-4 text-sm font-medium text-white">
                    {fp.moment_type}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-300">
                    {formatCents(fp.floor_cents)}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-300">
                    {fp.premium_multiplier}x
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {new Date(fp.updated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {(floorPrices ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    No floor prices configured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Dynamic Premium Rules */}
        <h3 className="mt-6 text-sm font-semibold text-white">
          Dynamic Premium Rules
        </h3>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Condition
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Multiplier
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Rationale
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {DYNAMIC_PREMIUMS.map((dp) => (
                <tr key={dp.condition} className="hover:bg-slate-900/50">
                  <td className="px-6 py-4 text-sm text-white">
                    {dp.condition}
                  </td>
                  <td className="px-6 py-4 text-sm font-mono text-blue-400">
                    {dp.multiplier}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {dp.rationale}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Worked example */}
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h4 className="text-sm font-semibold text-white">
            Worked Example: Floor Price Calculation
          </h4>
          <div className="mt-3 space-y-1 font-mono text-sm text-slate-300">
            <p>Moment type: &quot;close_game&quot; &rarr; base floor = $0.15</p>
            <p>Context: NCAA Tournament, Saturday, late-game</p>
            <p>
              Effective floor = $0.15 &times; 1.5 (tournament) &times; 1.2
              (weekend) &times; 1.5 (late-game)
            </p>
            <p className="font-semibold text-green-400">
              = $0.405 &rarr; rounded to $0.41
            </p>
          </div>
        </div>
      </section>

      {/* ── Section 4: Second-Price Clearing Math ── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-white">
          Second-Price Clearing (Vickrey Auction)
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          The winner pays $0.01 above the second-highest bid. This is
          incentive-compatible: advertisers always bid their true value
          because overbidding risks overpaying and underbidding risks
          losing.
        </p>

        {/* Bid value modifiers */}
        <h3 className="mt-6 text-sm font-semibold text-white">
          Effective Bid Value Modifiers
        </h3>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Modifier
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Boost
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              <tr className="hover:bg-slate-900/50">
                <td className="px-6 py-4 text-sm text-white">
                  Game-Specific Targeting
                </td>
                <td className="px-6 py-4 font-mono text-sm text-blue-400">
                  1.2x
                </td>
                <td className="px-6 py-4 text-sm text-slate-400">
                  Campaign targets this specific game or team
                </td>
              </tr>
              <tr className="hover:bg-slate-900/50">
                <td className="px-6 py-4 text-sm text-white">
                  Creative Performance
                </td>
                <td className="px-6 py-4 font-mono text-sm text-blue-400">
                  up to 1.1x
                </td>
                <td className="px-6 py-4 text-sm text-slate-400">
                  Based on historical CTR of the selected creative variant
                </td>
              </tr>
              <tr className="hover:bg-slate-900/50">
                <td className="px-6 py-4 text-sm text-white">
                  Segment Match
                </td>
                <td className="px-6 py-4 font-mono text-sm text-blue-400">
                  1.15x
                </td>
                <td className="px-6 py-4 text-sm text-slate-400">
                  User matches the campaign&apos;s target audience segment
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Worked example */}
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h4 className="text-sm font-semibold text-white">
            Worked Example: 4-Bidder Auction
          </h4>
          <div className="mt-3 space-y-2 text-sm text-slate-300">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="pb-2 pr-4 font-medium text-slate-400">
                      Bidder
                    </th>
                    <th className="pb-2 pr-4 font-medium text-slate-400">
                      Base Bid
                    </th>
                    <th className="pb-2 pr-4 font-medium text-slate-400">
                      Modifiers
                    </th>
                    <th className="pb-2 font-medium text-slate-400">
                      Effective Bid
                    </th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  <tr className="border-b border-slate-800">
                    <td className="py-2 pr-4 text-white">DraftKings</td>
                    <td className="py-2 pr-4">$0.35</td>
                    <td className="py-2 pr-4 text-blue-400">
                      1.2x game &times; 1.15x segment
                    </td>
                    <td className="py-2 font-semibold text-green-400">
                      $0.483
                    </td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-2 pr-4 text-white">FanDuel</td>
                    <td className="py-2 pr-4">$0.40</td>
                    <td className="py-2 pr-4 text-blue-400">
                      1.05x creative
                    </td>
                    <td className="py-2">$0.420</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="py-2 pr-4 text-white">BetMGM</td>
                    <td className="py-2 pr-4">$0.28</td>
                    <td className="py-2 pr-4 text-slate-500">none</td>
                    <td className="py-2">$0.280</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 text-white">ESPN Bet</td>
                    <td className="py-2 pr-4">$0.22</td>
                    <td className="py-2 pr-4 text-blue-400">
                      1.1x creative
                    </td>
                    <td className="py-2">$0.242</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-3 rounded-lg bg-slate-800 p-3">
              <p>
                <span className="font-semibold text-green-400">Winner:</span>{" "}
                DraftKings (highest effective bid: $0.483)
              </p>
              <p>
                <span className="font-semibold text-yellow-400">
                  Clearing price:
                </span>{" "}
                $0.421 (second-highest bid $0.420 + $0.01)
              </p>
              <p className="mt-1 text-slate-400">
                DraftKings bid $0.483 but only pays $0.421 &mdash; saving
                $0.062 per impression.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 5: Thompson Sampling ── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-white">
          Creative Optimization: Thompson Sampling
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Multi-armed bandit algorithm that balances exploring new creative
          variants with exploiting known winners.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h3 className="text-sm font-semibold text-blue-400">
              Exploration Phase
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              First 100 impressions per variant: each creative gets roughly
              equal traffic. We&apos;re gathering data to estimate true
              performance.
            </p>
            <div className="mt-3 font-mono text-xs text-slate-400">
              <p>Variant A: 34 impressions, 5 taps</p>
              <p>Variant B: 33 impressions, 8 taps</p>
              <p>Variant C: 33 impressions, 3 taps</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h3 className="text-sm font-semibold text-green-400">
              Exploitation Phase
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              After 100+ impressions per variant: traffic shifts toward the
              best performer, but never fully stops exploring (handles
              changing preferences).
            </p>
            <div className="mt-3 font-mono text-xs text-slate-400">
              <p>Variant A: 412 impressions, 61 taps (14.8%)</p>
              <p>Variant B: 1,847 impressions, 389 taps (21.1%)</p>
              <p>Variant C: 241 impressions, 22 taps (9.1%)</p>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h4 className="text-sm font-semibold text-white">
            Beta Distribution Sampling
          </h4>
          <p className="mt-2 text-sm text-slate-300">
            Each variant is modeled as a Beta distribution. At auction time,
            we draw a random sample from each variant&apos;s distribution and
            pick the highest.
          </p>
          <div className="mt-3 space-y-1 font-mono text-sm text-slate-300">
            <p>
              For each variant:{" "}
              <span className="text-blue-400">
                alpha = taps + 1, beta = (impressions - taps) + 1
              </span>
            </p>
            <p>Sample ~ Beta(alpha, beta)</p>
            <p className="mt-2">Example (Variant B above):</p>
            <p>
              alpha = 389 + 1 = 390, beta = (1847 - 389) + 1 = 1459
            </p>
            <p>
              Expected CTR = 390 / (390 + 1459) ={" "}
              <span className="text-green-400">21.1%</span>
            </p>
          </div>
        </div>

        {/* Learned Engagement Rates */}
        {(engagementRates ?? []).length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-white">
              Learned Engagement Rates by Moment Type
            </h3>
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-800">
              <table className="w-full">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                      Moment Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                      CTR
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                      Seen Rate
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                      Sample Size
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                      Confidence
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {(engagementRates ?? []).map((er: any) => (
                    <tr
                      key={er.moment_type}
                      className="hover:bg-slate-900/50"
                    >
                      <td className="px-6 py-4 text-sm font-medium text-white">
                        {er.moment_type}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-300">
                        {formatPercent(er.observed_ctr * 100)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-300">
                        {formatPercent(er.observed_seen_rate * 100)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-300">
                        {formatNumber(er.sample_size)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full bg-blue-500"
                              style={{
                                width: `${Math.round(er.confidence * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-slate-400">
                            {formatPercent(er.confidence * 100)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Section 6: Floor Price Optimizer ── */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-white">
          Floor Price Optimizer
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Daily feedback loop runs at 3:00 AM ET. Analyzes the previous
          day&apos;s auction data and adjusts floor prices to maximize revenue
          while maintaining fill rate.
        </p>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Clearing Ratio
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Fill Rate
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Trend
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Adjustment
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">
                  Rationale
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {OPTIMIZER_MATRIX.map((row, i) => (
                <tr key={i} className="hover:bg-slate-900/50">
                  <td className="px-4 py-4 text-sm text-white">
                    {row.clearingRatio}
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-300">
                    {row.fillRate}
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-300">
                    {row.trend}
                  </td>
                  <td className="px-4 py-4 font-mono text-sm text-blue-400">
                    {row.action}
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-400">
                    {row.rationale}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="text-sm font-semibold text-white">Guardrails</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            <li>
              Max single-day increase:{" "}
              <span className="font-mono text-yellow-400">+20%</span>
            </li>
            <li>
              Max single-day decrease:{" "}
              <span className="font-mono text-yellow-400">-10%</span>
            </li>
            <li>
              Absolute floor range:{" "}
              <span className="font-mono text-yellow-400">
                $0.05 &ndash; $2.00
              </span>
            </li>
            <li>
              Minimum sample size:{" "}
              <span className="font-mono text-yellow-400">
                50 auctions per moment type
              </span>{" "}
              before adjusting
            </li>
          </ul>
        </div>
      </section>

      {/* ── Section 7: Auto-Bidding ── */}
      <section className="mt-10 mb-12">
        <h2 className="text-lg font-semibold text-white">Auto-Bidding</h2>
        <p className="mt-1 text-sm text-slate-400">
          Advertisers can opt into auto-bidding strategies instead of
          setting manual bids.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h3 className="text-sm font-semibold text-blue-400">
              Target CPA Strategy
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              Advertiser sets a target cost-per-action (e.g., $2.50 per
              tap). The system adjusts bids based on observed vs target CPA.
            </p>
            <div className="mt-3 space-y-1 font-mono text-sm text-slate-300">
              <p>observed_cpa = spend / conversions</p>
              <p>
                if observed_cpa &gt; target_cpa:{" "}
                <span className="text-red-400">
                  bid &times;= 0.9 (lower by 10%)
                </span>
              </p>
              <p>
                if observed_cpa &lt; target_cpa:{" "}
                <span className="text-green-400">
                  bid &times;= 1.1 (raise by 10%)
                </span>
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h3 className="text-sm font-semibold text-green-400">
              Maximize Impressions Strategy
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              Bid at exactly the floor price to win as many auctions as
              possible at the lowest cost. Best for brand awareness
              campaigns.
            </p>
            <div className="mt-3 space-y-1 font-mono text-sm text-slate-300">
              <p>bid = floor_price + $0.01</p>
              <p className="text-slate-400">
                Always wins if no competition, pays minimum
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
