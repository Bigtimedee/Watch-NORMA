import { requireAdmin } from "@/lib/admin";
import { formatCents } from "@/lib/utils";

interface YieldRow {
  id: number;
  moment_type: string;
  sport: string;
  floor_cents: number;
  min_floor_cents: number;
  max_floor_cents: number;
  learned_floor_cents: number | null;
  total_impressions: number;
  filled_count: number;
  fill_rate_pct: number;
  avg_clearing_cents: number | null;
  clearing_ratio: number | null;
  updated_at: string;
}

function guardrailBadge(floor: number, min: number, max: number): string {
  if (floor <= min) return "At minimum";
  if (floor >= max) return "At maximum";
  return "Within range";
}

function guardrailColor(floor: number, min: number, max: number): string {
  if (floor <= min) return "text-red-400";
  if (floor >= max) return "text-yellow-400";
  return "text-green-400";
}

function fillColor(rate: number): string {
  if (rate >= 60) return "text-green-400";
  if (rate >= 30) return "text-yellow-400";
  return "text-red-400";
}

export default async function YieldPage() {
  const { supabase } = await requireAdmin();

  const { data: rows, error } = await supabase
    .from("floor_yield_stats")
    .select("*")
    .order("moment_type")
    .order("sport");

  const yieldRows: YieldRow[] = (rows ?? []) as YieldRow[];

  return (
    <>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Yield by Category</h1>
          <p className="mt-1 text-sm text-slate-400">
            Floor price vs. observed clearing price vs. fill rate — last 30 days.
            Guardrails prevent the optimizer from setting floors outside min/max bounds.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-blue-900 bg-blue-950/40 px-4 py-3 text-xs text-blue-300">
        <span className="font-semibold">How floors work: </span>
        The optimizer blends the learned clearing-price history (60%) with the base floor (40%), then
        clamps to guardrails. Clearing ratio &gt; 2.0 with fill rate &gt; 80% triggers a floor increase.
        Fill rate &lt; 30% with ratio &lt; 1.2 triggers a decrease. All changes are bounded and reversible.
      </div>

      {error && (
        <p className="mt-4 text-red-400 text-sm">Failed to load yield stats: {error.message}</p>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Moment Type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Sport</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-400">Floor</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-400">Learned</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-slate-400">Guardrails</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-400">Avg Clear</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-400">Clear Ratio</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-400">Impressions</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-400">Fill Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {yieldRows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-900/50">
                <td className="px-4 py-3 font-medium text-white">{r.moment_type.replace(/_/g, " ")}</td>
                <td className="px-4 py-3 text-slate-400">
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs">{r.sport}</span>
                </td>
                <td className="px-4 py-3 text-right text-white">{formatCents(r.floor_cents)}</td>
                <td className="px-4 py-3 text-right text-slate-400">
                  {r.learned_floor_cents != null ? formatCents(r.learned_floor_cents) : "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs ${guardrailColor(r.floor_cents, r.min_floor_cents, r.max_floor_cents)}`}>
                    {guardrailBadge(r.floor_cents, r.min_floor_cents, r.max_floor_cents)}
                  </span>
                  <p className="text-xs text-slate-600">
                    {formatCents(r.min_floor_cents)}–{formatCents(r.max_floor_cents)}
                  </p>
                </td>
                <td className="px-4 py-3 text-right text-slate-300">
                  {r.avg_clearing_cents != null ? formatCents(r.avg_clearing_cents) : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={r.clearing_ratio != null && r.clearing_ratio > 2.0 ? "text-green-400 font-medium" : "text-slate-400"}>
                    {r.clearing_ratio != null ? `${r.clearing_ratio}×` : "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-slate-400">{r.total_impressions.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  <span className={fillColor(r.fill_rate_pct)}>
                    {r.fill_rate_pct}%
                  </span>
                </td>
              </tr>
            ))}
            {yieldRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  No floor price data yet. Floors are seeded during migration.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
