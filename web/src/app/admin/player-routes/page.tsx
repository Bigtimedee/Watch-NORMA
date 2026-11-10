import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { clearPlayerRouteKill, disablePlayerRoute } from "./actions";

export const dynamic = "force-dynamic";

export default async function PlayerRouteControlPage() {
  await requireAdmin();
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("player_route_control")
    .select("killed,strymtv_enabled,cohort_allowlist,ttl_seconds,updated_at,schema_version")
    .eq("id", 1)
    .maybeSingle();

  const killed = data?.killed !== false;
  const playbackEnabled = data?.strymtv_enabled === true;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-white">StrymTV control</h1>
      <p className="mt-2 text-sm text-slate-400">
        This switch disables the optional StrymTV action. It does not change YouTube TV.
        Clearing the kill flag does not enable playback. Playback stays off while
        strymtv_enabled is false, the cohort list is empty, and the app encoding gate is blocked.
      </p>
      <dl className="mt-6 space-y-2 text-sm text-slate-200">
        <div>Kill flag: {killed ? "on (StrymTV disabled)" : "off"}</div>
        <div>Playback enable: {playbackEnabled ? "on" : "off"}</div>
        <div>Cohort tokens: {Array.isArray(data?.cohort_allowlist) ? data.cohort_allowlist.length : 0}</div>
        <div>Server TTL seconds: {data?.ttl_seconds ?? "unavailable"}</div>
        <div>Updated: {data?.updated_at ?? "no row"}</div>
      </dl>
      <div className="mt-6 flex gap-3">
        <form action={disablePlayerRoute}>
          <button className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white" type="submit">
            Disable StrymTV
          </button>
        </form>
        <form action={clearPlayerRouteKill}>
          <button className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200" type="submit">
            Clear kill flag only
          </button>
        </form>
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Clients refresh on foreground, every 60 seconds in the foreground, and again immediately before a handoff.
        An offline phone cannot open StrymTV. A phone that is not refreshing can keep a previous allow for at most 60 seconds, and only until it tries to open.
      </p>
    </div>
  );
}
