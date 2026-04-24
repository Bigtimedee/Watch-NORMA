"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { ADVERTISER_CATEGORIES } from "@/lib/types";

export default function OnboardingPage() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [billingModel, setBillingModel] = useState("cpm");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    router.push("/auth");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from("advertisers").upsert(
      {
        auth_user_id: user.id,
        name,
        category: category || null,
        logo_url: logoUrl || null,
        website_url: websiteUrl || null,
        billing_model: billingModel,
        onboarding_complete: true,
      },
      { onConflict: "auth_user_id" }
    );

    if (insertError) {
      // If upsert doesn't work due to no unique constraint matching, try insert
      const { error: fallbackError } = await supabase.from("advertisers").insert({
        auth_user_id: user.id,
        name,
        category: category || null,
        logo_url: logoUrl || null,
        website_url: websiteUrl || null,
        billing_model: billingModel,
        onboarding_complete: true,
      });

      if (fallbackError) {
        setError(fallbackError.message);
        setLoading(false);
        return;
      }
    }

    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-lg space-y-8 rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <div className="flex flex-col items-center">
          <Link href="/">
            <img src="/logo.png" alt="NORMA" className="h-14 w-auto" />
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-white">Complete Your Profile</h1>
          <p className="mt-2 text-center text-sm text-slate-400">
            Your account is ready. Set up your advertiser profile to start reaching engaged sports fans.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Company Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none"
              placeholder="Your company name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none"
            >
              <option value="">Select category</option>
              {ADVERTISER_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">Logo URL</label>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none"
              placeholder="https://example.com/logo.png"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">Website</label>
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none"
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">
              Billing Model
            </label>
            <select
              value={billingModel}
              onChange={(e) => setBillingModel(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none"
            >
              <option value="cpm">Cost per Moment</option>
              <option value="cpwa">CPWA (Cost per Wager Action)</option>
              <option value="cpti">CPTI (Cost per Tuned-In)</option>
              <option value="flat_rate">Flat Rate</option>
            </select>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-orange-500 py-3 font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? "Setting up..." : "Complete Setup"}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500">
          Wrong account?{" "}
          <button
            onClick={handleSignOut}
            className="text-slate-400 hover:text-white underline"
          >
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}
