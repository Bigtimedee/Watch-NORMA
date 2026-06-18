"use client";

import { useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { Nav } from "@/components/nav";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { MOMENT_TYPES, USER_SEGMENTS } from "@/lib/types";

type Step = "basics" | "targeting" | "bidding" | "creatives" | "review";

const STEPS: { key: Step; label: string }[] = [
  { key: "basics", label: "Basics" },
  { key: "targeting", label: "Targeting" },
  { key: "bidding", label: "Bidding" },
  { key: "creatives", label: "Creatives" },
  { key: "review", label: "Review" },
];

function NewCampaignPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const track = searchParams.get("track");
  const isFastTrack = track === "sportsbook";
  const isStreamingTrack = track === "streaming";

  const [step, setStep] = useState<Step>("basics");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Basics
  const [name, setName] = useState("");
  const [demandType, setDemandType] = useState<"sportsbook" | "streaming" | "commerce" | "direct_deal">(
    isStreamingTrack ? "streaming" : "sportsbook"
  );
  const [monthlyImpressionGuarantee, setMonthlyImpressionGuarantee] = useState("");
  const [budgetDollars, setBudgetDollars] = useState("");
  const [dailyBudgetDollars, setDailyBudgetDollars] = useState("");
  const [flightStart, setFlightStart] = useState("");
  const [flightEnd, setFlightEnd] = useState("");

  // Targeting
  const [momentTypes, setMomentTypes] = useState<string[]>(
    isFastTrack
      ? ["spread_alert", "moneyline_alert", "close_game", "bet_resolved", "overtime", "prop_alert"]
      : isStreamingTrack
      ? ["close_game", "overtime", "game_resolved", "mlb_close_game", "mlb_walk_off"]
      : []
  );
  const [userSegments, setUserSegments] = useState<string[]>([]);
  const [minScore, setMinScore] = useState(40);

  // Bidding
  const [bidCents, setBidCents] = useState(isFastTrack ? 35 : isStreamingTrack ? 25 : 30);
  const [autoBidEnabled, setAutoBidEnabled] = useState(false);
  const [targetCPA, setTargetCPA] = useState("");

  // Creative
  const [sponsorText, setSponsorText] = useState("");
  const [ctaText, setCtaText] = useState(isFastTrack ? "Bet Now" : isStreamingTrack ? "Watch Now" : "");
  const [ctaUrl, setCtaUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const handleSubmit = async () => {
    setLoading(true);
    setError("");

    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated"); setLoading(false); return; }

    const { data: advertiser } = await supabase
      .from("advertisers")
      .select("id")
      .eq("auth_user_id", user.id)
      .single();

    if (!advertiser) { setError("Advertiser not found"); setLoading(false); return; }

    const budgetCents = Math.round(parseFloat(budgetDollars) * 100);
    const dailyBudget = dailyBudgetDollars ? Math.round(parseFloat(dailyBudgetDollars) * 100) : null;

    // Create campaign
    const { data: campaign, error: campErr } = await supabase
      .from("campaigns")
      .insert({
        advertiser_id: advertiser.id,
        name,
        demand_type: demandType === "direct_deal" ? "sportsbook" : demandType,
        priority_tier: demandType === "direct_deal" ? 1 : 0,
        monthly_impression_guarantee: demandType === "direct_deal" && monthlyImpressionGuarantee
          ? parseInt(monthlyImpressionGuarantee, 10)
          : null,
        budget_cents: budgetCents,
        daily_budget_cents: dailyBudget,
        flight_start: flightStart || null,
        flight_end: flightEnd || null,
        targeting_rules: {
          league: "ncaa_basketball",
          moment_types: momentTypes,
          user_segments: userSegments,
          min_moment_score: minScore,
          auto_bid: autoBidEnabled ? {
            enabled: true,
            target_cpa_cents: targetCPA ? Math.round(parseFloat(targetCPA) * 100) : 100,
            max_bid_cents: bidCents,
            strategy: "target_cpa" as const,
          } : undefined,
        },
        status: "draft",
      })
      .select("id")
      .single();

    if (campErr || !campaign) {
      setError(campErr?.message ?? "Failed to create campaign");
      setLoading(false);
      return;
    }

    // Create creative
    if (sponsorText) {
      const { error: creativeErr } = await supabase.from("creatives").insert({
        campaign_id: campaign.id,
        format: "notification_sponsor",
        sponsor_text: sponsorText,
        cta_text: ctaText || null,
        cta_url: ctaUrl || null,
        logo_url: logoUrl || null,
        variant_label: "A",
        status: "pending",
      });

      if (creativeErr) {
        setError(creativeErr.message);
        setLoading(false);
        return;
      }
    }

    // Create bids for each moment type
    const { data: creative } = await supabase
      .from("creatives")
      .select("id")
      .eq("campaign_id", campaign.id)
      .limit(1)
      .single();

    if (creative) {
      const bids = momentTypes.map((mt) => ({
        campaign_id: campaign.id,
        creative_id: creative.id,
        moment_type: mt,
        bid_cents: bidCents,
      }));

      if (bids.length > 0) {
        await supabase.from("bids").insert(bids);
      }
    }

    router.push(`/campaigns/${campaign.id}`);
  };

  const toggleMomentType = (key: string) => {
    setMomentTypes((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleSegment = (key: string) => {
    setUserSegments((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-2xl font-bold text-white">Create Campaign</h1>

        {isFastTrack && (
          <div className="mt-3 rounded-lg bg-orange-500/20 border border-orange-500/40 px-4 py-2.5 text-sm font-medium text-orange-400">
            ⚡ Sportsbook Fast Track — pre-configured for sportsbook campaigns
          </div>
        )}
        {isStreamingTrack && (
          <div className="mt-3 rounded-lg bg-blue-500/20 border border-blue-500/40 px-4 py-2.5 text-sm font-medium text-blue-400">
            ⚡ Streaming Service Fast Track — pre-configured for subscriber acquisition campaigns
          </div>
        )}

        {/* Step indicator */}
        <div className="mt-6 flex gap-2">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => i <= stepIndex && setStep(s.key)}
              className={`flex-1 rounded-lg py-2 text-center text-sm font-medium transition-colors ${
                s.key === step
                  ? "bg-orange-500 text-white"
                  : i < stepIndex
                  ? "bg-slate-800 text-slate-300"
                  : "bg-slate-900 text-slate-500"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          {/* Step: Basics */}
          {step === "basics" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300">Campaign Name *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none"
                  placeholder="March Madness Push" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300">Total Budget ($) *</label>
                  <input type="number" min="1" step="0.01" value={budgetDollars} onChange={(e) => setBudgetDollars(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none"
                    placeholder="1500.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300">Daily Budget ($)</label>
                  <input type="number" min="0" step="0.01" value={dailyBudgetDollars} onChange={(e) => setDailyBudgetDollars(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none"
                    placeholder="Optional" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300">Flight Start</label>
                  <input type="date" value={flightStart} onChange={(e) => setFlightStart(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300">Flight End</label>
                  <input type="date" value={flightEnd} onChange={(e) => setFlightEnd(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Demand Category *</label>
                <p className="mt-0.5 text-xs text-slate-500">
                  Controls the CTA shown on the alert card. Geo-filter applies to sportsbook only.
                </p>
                <div className="mt-2 grid grid-cols-3 gap-3">
                  {([
                    { key: "sportsbook", label: "Sportsbook", cta: "Bet Now", desc: "Sportsbook offers — geo-restricted to legal betting states", note: null },
                    { key: "streaming", label: "Streaming", cta: "Watch Now", desc: "Streaming services (YouTube TV, ESPN+, Peacock, Prime)", note: "Pending brand review before going live" },
                    { key: "commerce", label: "Commerce", cta: "Shop Now", desc: "Merchandise, ticketing (Fanatics, etc.)", note: "Pending brand review before going live" },
                    { key: "direct_deal", label: "Direct Deal", cta: "Custom", desc: "Guaranteed impressions — bypasses auction", note: null },
                  ] as const).map((opt) => (
                    <button key={opt.key} type="button" onClick={() => setDemandType(opt.key)}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        demandType === opt.key
                          ? "border-orange-500 bg-orange-500/10"
                          : "border-slate-700 bg-slate-800 hover:border-slate-600"
                      }`}>
                      <p className="text-sm font-semibold text-white">{opt.label}</p>
                      <p className="mt-0.5 text-xs text-orange-400 font-medium">{opt.cta}</p>
                      <p className="mt-1 text-xs text-slate-400">{opt.desc}</p>
                      {opt.note && (
                        <p className="mt-1 text-xs text-blue-400">{opt.note}</p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => setStep("targeting")} disabled={!name || !budgetDollars}
                className="mt-4 rounded-lg bg-orange-500 px-6 py-2.5 font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                Next: Targeting
              </button>
            </div>
          )}

          {/* Step: Targeting */}
          {step === "targeting" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-white">Moment Types</h3>
                <p className="text-xs text-slate-400">Select which moments trigger your ads</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {MOMENT_TYPES.map((mt) => (
                    <button key={mt.key} onClick={() => toggleMomentType(mt.key)}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        momentTypes.includes(mt.key)
                          ? "border-orange-500 bg-orange-500/10"
                          : "border-slate-700 bg-slate-800 hover:border-slate-600"
                      }`}>
                      <p className="text-sm font-medium text-white">{mt.label}</p>
                      <p className="text-xs text-slate-400">{mt.description}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">User Segments</h3>
                <div className="mt-3 flex gap-2">
                  {USER_SEGMENTS.map((seg) => (
                    <button key={seg.key} onClick={() => toggleSegment(seg.key)}
                      className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                        userSegments.includes(seg.key)
                          ? "border-orange-500 bg-orange-500/10 text-white"
                          : "border-slate-700 text-slate-400 hover:border-slate-600"
                      }`}>
                      {seg.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep("basics")} className="rounded-lg border border-slate-700 px-6 py-2.5 text-sm text-slate-300 hover:bg-slate-800">
                  Back
                </button>
                <button onClick={() => setStep("bidding")} disabled={momentTypes.length === 0}
                  className="rounded-lg bg-orange-500 px-6 py-2.5 font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                  Next: Bidding
                </button>
              </div>
            </div>
          )}

          {/* Step: Bidding */}
          {step === "bidding" && (
            <div className="space-y-6">
              {demandType === "direct_deal" ? (
                <>
                  <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-4">
                    <p className="text-sm font-medium text-orange-400">Direct Deal — Guaranteed Delivery</p>
                    <p className="mt-1 text-xs text-slate-400">
                      This campaign bypasses the auction (priority_tier = 1). Set the guaranteed monthly impression volume instead of a per-impression bid.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300">
                      Monthly Impression Guarantee
                    </label>
                    <input
                      type="number"
                      min="1000"
                      step="1000"
                      value={monthlyImpressionGuarantee}
                      onChange={(e) => setMonthlyImpressionGuarantee(e.target.value)}
                      className="mt-1 w-48 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none"
                      placeholder="50000"
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      Impressions committed per 30-day period. NORMA credits any shortfall.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-300">
                      Bid per impression (cents)
                    </label>
                    <input type="number" min="1" max="500" value={bidCents} onChange={(e) => setBidCents(parseInt(e.target.value) || 0)}
                      className="mt-1 w-32 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none" />
                    <p className="mt-1 text-xs text-slate-400">
                      ${(bidCents / 100).toFixed(2)} per impression. Max $5.00.
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-700 p-4">
                    <label className="flex items-center gap-3">
                      <input type="checkbox" checked={autoBidEnabled} onChange={(e) => setAutoBidEnabled(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-600 accent-orange-500" />
                      <span className="text-sm font-medium text-white">Enable Auto-Bid</span>
                    </label>
                    {autoBidEnabled && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-slate-300">Target CPA ($)</label>
                        <input type="number" min="0.01" step="0.01" value={targetCPA} onChange={(e) => setTargetCPA(e.target.value)}
                          className="mt-1 w-32 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none"
                          placeholder="1.00" />
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep("targeting")} className="rounded-lg border border-slate-700 px-6 py-2.5 text-sm text-slate-300 hover:bg-slate-800">
                  Back
                </button>
                <button
                  onClick={() => setStep("creatives")}
                  disabled={demandType === "direct_deal" && !monthlyImpressionGuarantee}
                  className="rounded-lg bg-orange-500 px-6 py-2.5 font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                  Next: Creatives
                </button>
              </div>
            </div>
          )}

          {/* Step: Creatives */}
          {step === "creatives" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300">Sponsor Text *</label>
                <input type="text" value={sponsorText} onChange={(e) => setSponsorText(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none"
                  placeholder="Presented by DraftKings" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300">CTA Text</label>
                  <input type="text" value={ctaText} onChange={(e) => setCtaText(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none"
                    placeholder={demandType === "streaming" ? "Watch Now" : demandType === "commerce" ? "Shop Now" : "Bet Now"} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300">CTA URL</label>
                  <input type="url" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none"
                    placeholder="https://sportsbook.draftkings.com" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Logo URL</label>
                <input type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none"
                  placeholder="https://example.com/logo.png" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep("bidding")} className="rounded-lg border border-slate-700 px-6 py-2.5 text-sm text-slate-300 hover:bg-slate-800">
                  Back
                </button>
                <button onClick={() => setStep("review")} disabled={!sponsorText}
                  className="rounded-lg bg-orange-500 px-6 py-2.5 font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                  Next: Review
                </button>
              </div>
            </div>
          )}

          {/* Step: Review */}
          {step === "review" && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-white">Campaign Summary</h3>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-slate-400">Name</dt><dd className="text-white">{name}</dd></div>
                <div><dt className="text-slate-400">Category</dt><dd className="capitalize text-white">{demandType}</dd></div>
                <div><dt className="text-slate-400">Budget</dt><dd className="text-white">${budgetDollars}</dd></div>
                <div><dt className="text-slate-400">Daily Budget</dt><dd className="text-white">{dailyBudgetDollars ? `$${dailyBudgetDollars}` : "No cap"}</dd></div>
                <div><dt className="text-slate-400">Flight</dt><dd className="text-white">{flightStart && flightEnd ? `${flightStart} - ${flightEnd}` : "No dates"}</dd></div>
                <div><dt className="text-slate-400">Moment Types</dt><dd className="text-white">{momentTypes.join(", ") || "None"}</dd></div>
                <div><dt className="text-slate-400">Bid</dt><dd className="text-white">${(bidCents / 100).toFixed(2)}/impression</dd></div>
                <div><dt className="text-slate-400">Sponsor Text</dt><dd className="text-white">{sponsorText}</dd></div>
                <div><dt className="text-slate-400">Auto-Bid</dt><dd className="text-white">{autoBidEnabled ? `Target CPA $${targetCPA}` : "Manual"}</dd></div>
              </dl>

              {(demandType === "streaming" || demandType === "commerce") && (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 text-sm text-blue-300">
                  <p className="font-medium">Brand review required</p>
                  <p className="mt-1 text-xs text-blue-400">
                    Streaming and commerce campaigns start in <strong>pending</strong> review. Your campaign will enter the auction after NORMA's brand safety team approves it — typically within 24 hours. You'll receive an email when it's approved.
                  </p>
                </div>
              )}

              {error && <p className="text-sm text-red-400">{error}</p>}

              <div className="flex gap-3">
                <button onClick={() => setStep("creatives")} className="rounded-lg border border-slate-700 px-6 py-2.5 text-sm text-slate-300 hover:bg-slate-800">
                  Back
                </button>
                <button onClick={handleSubmit} disabled={loading}
                  className="rounded-lg bg-orange-500 px-6 py-2.5 font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                  {loading ? "Creating..." : "Create Campaign"}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function NewCampaignPage() {
  return (
    <Suspense>
      <NewCampaignPageInner />
    </Suspense>
  );
}
