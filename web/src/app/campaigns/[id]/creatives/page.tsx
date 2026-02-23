"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Nav } from "@/components/nav";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import type { Creative } from "@/lib/types";
import Link from "next/link";

export default function CreativesPage() {
  const { id } = useParams<{ id: string }>();
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sponsorText, setSponsorText] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [variantLabel, setVariantLabel] = useState("");
  const router = useRouter();

  useEffect(() => {
    loadCreatives();
  }, [id]);

  async function loadCreatives() {
    const supabase = createSupabaseBrowser();
    const { data } = await supabase
      .from("creatives")
      .select("*")
      .eq("campaign_id", parseInt(id))
      .order("created_at");
    setCreatives((data as Creative[]) ?? []);
    setLoading(false);
  }

  async function addCreative() {
    const supabase = createSupabaseBrowser();
    await supabase.from("creatives").insert({
      campaign_id: parseInt(id),
      format: "notification_sponsor",
      sponsor_text: sponsorText,
      cta_text: ctaText || null,
      cta_url: ctaUrl || null,
      logo_url: logoUrl || null,
      variant_label: variantLabel || `variant_${String.fromCharCode(65 + creatives.length)}`,
      status: "pending",
    });
    setSponsorText("");
    setCtaText("");
    setCtaUrl("");
    setLogoUrl("");
    setVariantLabel("");
    setShowForm(false);
    loadCreatives();
  }

  const statusColors: Record<string, string> = {
    pending: "text-yellow-400 bg-yellow-900/30",
    approved: "text-green-400 bg-green-900/30",
    rejected: "text-red-400 bg-red-900/30",
  };

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Link href={`/campaigns/${id}`} className="text-sm text-slate-400 hover:text-white">
          &larr; Campaign
        </Link>
        <div className="mt-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Creatives & A/B Testing</h1>
          <button onClick={() => setShowForm(!showForm)}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
            Add Variant
          </button>
        </div>

        {showForm && (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300">Sponsor Text *</label>
              <input type="text" value={sponsorText} onChange={(e) => setSponsorText(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300">CTA Text</label>
                <input type="text" value={ctaText} onChange={(e) => setCtaText(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">CTA URL</label>
                <input type="url" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Variant Label</label>
                <input type="text" value={variantLabel} onChange={(e) => setVariantLabel(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none"
                  placeholder="Auto-generated" />
              </div>
            </div>
            <button onClick={addCreative} disabled={!sponsorText}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
              Save Variant
            </button>
          </div>
        )}

        <div className="mt-6 space-y-4">
          {creatives.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="rounded-lg bg-slate-700 px-3 py-1 text-sm font-bold text-white">
                    {c.variant_label ?? "Default"}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[c.status]}`}>
                    {c.status}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-400">Performance Score</p>
                  <p className="text-lg font-bold text-white">
                    {(c.performance_score * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
              <p className="mt-3 text-white">{c.sponsor_text}</p>
              {c.cta_text && (
                <p className="mt-1 text-sm text-orange-400">{c.cta_text} &rarr;</p>
              )}
              {c.review_notes && (
                <p className="mt-2 text-sm text-yellow-400">Review: {c.review_notes}</p>
              )}
            </div>
          ))}
          {!loading && creatives.length === 0 && (
            <p className="text-center text-slate-500 py-8">No creatives yet. Add your first variant above.</p>
          )}
        </div>
      </main>
    </div>
  );
}
