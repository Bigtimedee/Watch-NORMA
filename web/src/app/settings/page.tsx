"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { ADVERTISER_CATEGORIES } from "@/lib/types";

interface OAuthClient {
  id: string;
  client_id: string;
  name: string;
  scopes: string[];
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

interface NewClientSecret {
  client_id: string;
  client_secret: string;
  name: string;
}

const ALL_SCOPES = ["campaigns:read", "campaigns:write", "reporting:read", "inventory:read"];

export default function SettingsPage() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // OAuth clients
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [newClientName, setNewClientName] = useState("");
  const [newClientScopes, setNewClientScopes] = useState<string[]>(ALL_SCOPES);
  const [creatingClient, setCreatingClient] = useState(false);
  const [newClientSecret, setNewClientSecret] = useState<NewClientSecret | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    loadAdvertiser();
    loadOAuthClients();
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

  async function loadOAuthClients() {
    const res = await fetch("/api/settings/oauth-clients");
    if (res.ok) {
      const data = await res.json() as { clients: OAuthClient[] };
      setClients(data.clients);
    }
  }

  async function handleCreateClient() {
    if (!newClientName.trim()) return;
    setCreatingClient(true);
    setNewClientSecret(null);
    const res = await fetch("/api/settings/oauth-clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newClientName, scopes: newClientScopes }),
    });
    const data = await res.json() as NewClientSecret & { warning?: string };
    setCreatingClient(false);
    if (res.ok) {
      setNewClientSecret(data);
      setNewClientName("");
      setNewClientScopes(ALL_SCOPES);
      await loadOAuthClients();
    }
  }

  async function handleRevokeClient(id: string) {
    setRevokingId(id);
    await fetch(`/api/settings/oauth-clients/${id}`, { method: "DELETE" });
    setRevokingId(null);
    await loadOAuthClients();
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

        {/* API Access — OAuth 2.0 Clients */}
        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-white">API Access</h2>
          <p className="mt-1 text-sm text-slate-400">
            Create OAuth 2.0 credentials for AI agents and programmatic buyers. Use the{" "}
            <code className="rounded bg-slate-800 px-1 text-orange-400">client_credentials</code> grant to authenticate.
          </p>

          {/* New client secret revealed once */}
          {newClientSecret && (
            <div className="mt-4 rounded-lg border border-orange-500/40 bg-orange-500/10 p-4">
              <p className="text-sm font-semibold text-orange-400">Save these credentials now — the secret will not be shown again.</p>
              <div className="mt-3 space-y-2 font-mono text-xs text-slate-300">
                <div><span className="text-slate-500">Client ID:</span> {newClientSecret.client_id}</div>
                <div><span className="text-slate-500">Client Secret:</span> {newClientSecret.client_secret}</div>
              </div>
              <button onClick={() => setNewClientSecret(null)} className="mt-3 text-xs text-slate-500 underline">
                I have saved these credentials
              </button>
            </div>
          )}

          {/* Existing clients */}
          {clients.filter((c) => c.is_active).length > 0 && (
            <div className="mt-5 space-y-3">
              {clients.filter((c) => c.is_active).map((client) => (
                <div key={client.id} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-white">{client.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-400">{client.client_id}</p>
                    <div className="mt-1 flex gap-1 flex-wrap">
                      {client.scopes.map((s) => (
                        <span key={s} className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">{s}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevokeClient(client.id)}
                    disabled={revokingId === client.id}
                    className="ml-4 shrink-0 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {revokingId === client.id ? "Revoking…" : "Revoke"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Create new client */}
          <div className="mt-5 space-y-3 border-t border-slate-800 pt-5">
            <p className="text-sm font-medium text-slate-300">New API Client</p>
            <input
              type="text"
              placeholder="Client name (e.g. Yahoo DSP Agent)"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none"
            />
            <div>
              <p className="mb-2 text-xs text-slate-500">Scopes</p>
              <div className="flex flex-wrap gap-2">
                {ALL_SCOPES.map((s) => (
                  <label key={s} className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={newClientScopes.includes(s)}
                      onChange={(e) =>
                        setNewClientScopes((prev) =>
                          e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)
                        )
                      }
                      className="accent-orange-500"
                    />
                    <span className="text-xs text-slate-300">{s}</span>
                  </label>
                ))}
              </div>
            </div>
            <button
              onClick={handleCreateClient}
              disabled={creatingClient || !newClientName.trim() || newClientScopes.length === 0}
              className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {creatingClient ? "Creating…" : "Create Client"}
            </button>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-sm font-semibold text-slate-400">Account</h3>
          <p className="mt-2 text-sm text-slate-300">
            Contact support@norma-app.com to manage team members.
          </p>
        </div>
      </main>
    </div>
  );
}
