import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { appStoreUrl } from "@/lib/sports";
import { REF_CODE_RE, clientIp, hashPart } from "@/lib/referral";
import { RefCookie } from "./ref-cookie";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "You're invited to NORMA",
  description: "NORMA alerts you when the games you care about get close. Free.",
  robots: { index: false, follow: false },
};

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!REF_CODE_RE.test(code)) notFound();

  const admin = createSupabaseAdmin();
  const { data: rc } = await admin.from("referral_codes").select("user_id").eq("code", code).maybeSingle();
  if (!rc) notFound();

  const { data: prof } = await admin.from("profiles").select("display_name").eq("id", rc.user_id).maybeSingle();
  const name = (prof?.display_name ?? "").trim().split(/\s+/)[0] || null;

  const h = await headers();
  await Promise.all([
    admin.from("referral_clicks").insert({
      code,
      ip_hash: hashPart(clientIp(h)),
      ua_hash: hashPart(h.get("user-agent")),
    }),
    admin.from("web_events").insert({ event_name: "referral_link_open", properties: { code } }),
  ]);

  const store = appStoreUrl(`ref_${code}`);
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <meta name="apple-itunes-app" content={`app-id=6759508383, app-argument=norma://invite?ref=${code}`} />
      <RefCookie code={code} />
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-emerald-400">NORMA</p>
        <h1 className="mt-4 text-2xl font-bold">
          {name ? `${name} invited you to NORMA` : "You're invited to NORMA"}
        </h1>
        <p className="mt-3 text-slate-300">
          Get an alert when your game gets close, with the channel to watch it on. Free.
        </p>
        <a
          href={store}
          className="mt-6 inline-block rounded-xl bg-white px-6 py-3 font-semibold text-slate-950"
        >
          Get NORMA on the App Store
        </a>
        <p className="mt-4 text-xs text-slate-500">Invite code: {code}</p>
      </div>
    </main>
  );
}
