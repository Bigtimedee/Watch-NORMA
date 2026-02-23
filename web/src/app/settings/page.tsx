"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { ADVERTISER_CATEGORIES } from "@/lib/types";

export default function SettingsPage() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadAdvertiser();
  }, []);

  async function loadAdvertiser() {
    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("advertisers")
      .select("*")
      .eq("auth_user_id", user.id)
      .single();

    if (data) {
      setName(data.name ?? "");
      setCategory(data.category ?? "");
      setLogoUrl(data.logo_url ?? "");
      setWebsiteUrl(data.website_url ?? "");
    }
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("advertisers")
      .update({
        name,
        category: category || null,
        logo_url: logoUrl || null,
        website_url: websiteUrl || null,
        updated_at: new Date().toISOString(),
      })
      .eq("auth_user_id", user.id);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>

        <div className="mt-6 space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div>
            <label className="block text-sm font-medium text-slate-300">Company Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none">
              <option value="">Select category</option>
              {ADVERTISER_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">Logo URL</label>
            <input type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">Website</label>
            <input type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white focus:border-orange-500 focus:outline-none" />
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={saving}
              className="rounded-lg bg-orange-500 px-6 py-2.5 font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
              {saving ? "Saving..." : "Save Changes"}
            </button>
            {saved && <span className="text-sm text-green-400">Saved!</span>}
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-sm font-semibold text-slate-400">Account</h3>
          <p className="mt-2 text-sm text-slate-300">
            Contact support@norma-app.com to manage team members or API keys.
          </p>
        </div>
      </main>
    </div>
  );
}
