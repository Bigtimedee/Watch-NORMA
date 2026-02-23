import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase-server";
import { Nav } from "@/components/nav";
import { MOMENT_TYPES, USER_SEGMENTS } from "@/lib/types";
import Link from "next/link";

export default async function TargetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*, advertisers!inner(auth_user_id)")
    .eq("id", id)
    .eq("advertisers.auth_user_id", user.id)
    .single();

  if (!campaign) redirect("/campaigns");

  const rules = campaign.targeting_rules as Record<string, unknown>;
  const selectedMoments = (rules?.moment_types as string[]) ?? [];
  const selectedSegments = (rules?.user_segments as string[]) ?? [];
  const geoStates = (rules?.geo_states as string[]) ?? [];
  const minScore = (rules?.min_moment_score as number) ?? 40;

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Link href={`/campaigns/${id}`} className="text-sm text-slate-400 hover:text-white">
          &larr; Campaign
        </Link>
        <h1 className="mt-4 text-xl font-bold text-white">Targeting</h1>

        <div className="mt-6 space-y-8">
          {/* Moment Types */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-sm font-semibold text-slate-400">Moment Types</h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {MOMENT_TYPES.map((mt) => (
                <div
                  key={mt.key}
                  className={`rounded-lg border p-3 ${
                    selectedMoments.includes(mt.key)
                      ? "border-orange-500 bg-orange-500/10"
                      : "border-slate-700 bg-slate-800"
                  }`}
                >
                  <p className="text-sm font-medium text-white">{mt.label}</p>
                  <p className="text-xs text-slate-400">{mt.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* User Segments */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-sm font-semibold text-slate-400">User Segments</h3>
            <div className="mt-4 flex gap-3">
              {USER_SEGMENTS.map((seg) => (
                <div
                  key={seg.key}
                  className={`rounded-lg border px-4 py-2 text-sm ${
                    selectedSegments.includes(seg.key)
                      ? "border-orange-500 bg-orange-500/10 text-white"
                      : "border-slate-700 text-slate-400"
                  }`}
                >
                  {seg.label}
                </div>
              ))}
            </div>
          </div>

          {/* Other settings */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-sm font-semibold text-slate-400">Additional Settings</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-400">Minimum Moment Score</dt>
                <dd className="text-white">{minScore}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">League</dt>
                <dd className="text-white">{(rules?.league as string) ?? "NCAA Basketball"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Category Exclusivity</dt>
                <dd className="text-white">{campaign.category_exclusivity ? "Yes" : "No"}</dd>
              </div>
              {geoStates.length > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-400">Geo States</dt>
                  <dd className="text-white">{geoStates.join(", ")}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </main>
    </div>
  );
}
