"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { formatNumber } from "@/lib/utils";
import type { SupplyForecast } from "@/lib/types";

export default function InventoryPage() {
  const [forecasts, setForecasts] = useState<SupplyForecast[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const supabase = createSupabaseBrowser();
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("supply_forecasts")
      .select("*")
      .gte("forecast_date", today)
      .order("forecast_date")
      .order("moment_type");

    setForecasts((data as SupplyForecast[]) ?? []);
    setLoading(false);
  }

  // Group by date
  const byDate = forecasts.reduce<Record<string, SupplyForecast[]>>((acc, f) => {
    if (!acc[f.forecast_date]) acc[f.forecast_date] = [];
    acc[f.forecast_date].push(f);
    return acc;
  }, {});

  // Get unique moment types
  const momentTypes = [...new Set(forecasts.map((f) => f.moment_type))].sort();

  function availabilityLevel(moments: number): { label: string; color: string } {
    if (moments >= 20) return { label: "High", color: "text-green-400" };
    if (moments >= 5) return { label: "Medium", color: "text-yellow-400" };
    return { label: "Low", color: "text-red-400" };
  }

  // Render a confidence band string e.g. "12–18"
  function bandLabel(f: SupplyForecast): string | null {
    if (f.predicted_moments_low == null || f.predicted_moments_high == null) return null;
    return `${f.predicted_moments_low}–${f.predicted_moments_high}`;
  }

  function isInsufficientHistory(f: SupplyForecast): boolean {
    return f.basis_note?.includes("insufficient history") ?? false;
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-2xl font-bold text-white">Inventory Forecast</h1>
        <p className="mt-1 text-sm text-slate-400">
          Estimated available moments for the next 7 days
        </p>

        {/* Methodology note */}
        <div className="mt-4 rounded-lg border border-blue-900 bg-blue-950/40 px-4 py-3 text-xs text-blue-300">
          <span className="font-semibold">How projections work: </span>
          Forecasts use observed moment rates from recent games (80% confidence interval).
          Sports with fewer than 10 comparable games show a wider statistical range and are
          labeled <span className="text-yellow-400 font-medium">Projection</span> rather than
          a data-based estimate. All numbers are estimates — actual inventory depends on
          game outcomes and user engagement.
        </div>

        {loading ? (
          <p className="mt-8 text-slate-400">Loading forecasts...</p>
        ) : forecasts.length === 0 ? (
          <p className="mt-8 text-center text-slate-500">
            No forecast data available. Forecasts are generated daily at 2 AM.
          </p>
        ) : (
          <>
            {/* Summary cards by date */}
            <div className="mt-6 grid grid-cols-7 gap-2">
              {Object.entries(byDate).slice(0, 7).map(([date, dayForecasts]) => {
                const totalMoments = dayForecasts.reduce((s, f) => s + f.predicted_moments, 0);
                const totalUsers = dayForecasts.reduce((s, f) => s + f.predicted_eligible_users, 0);
                const gamesScheduled = dayForecasts[0]?.games_scheduled ?? 0;
                const d = new Date(date + "T12:00:00Z");
                const hasProjection = dayForecasts.some(isInsufficientHistory);

                return (
                  <div key={date} className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-center">
                    <p className="text-xs font-semibold text-slate-400">
                      {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                    <p className="mt-2 text-2xl font-bold text-white">{totalMoments}</p>
                    <p className="text-xs text-slate-500">moments</p>
                    <p className="mt-1 text-xs text-slate-500">{gamesScheduled} games</p>
                    <p className="text-xs text-slate-500">{formatNumber(totalUsers)} users</p>
                    {hasProjection && (
                      <p className="mt-1 text-xs text-yellow-500">incl. projections</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Detailed breakdown table */}
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-white">Detailed Breakdown</h2>
              <p className="mt-1 text-xs text-slate-500">
                Band = 80% confidence interval. Hover a cell to see the data basis.
              </p>
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full">
                  <thead className="bg-slate-900">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Moment Type</th>
                      {Object.keys(byDate).slice(0, 7).map((date) => {
                        const d = new Date(date + "T12:00:00Z");
                        return (
                          <th key={date} className="px-4 py-3 text-center text-xs font-semibold uppercase text-slate-400">
                            {d.toLocaleDateString("en-US", { weekday: "short" })}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {momentTypes.map((mt) => (
                      <tr key={mt} className="hover:bg-slate-900/50">
                        <td className="px-4 py-3 text-sm font-medium text-white">{mt.replace(/_/g, " ")}</td>
                        {Object.entries(byDate).slice(0, 7).map(([date, dayForecasts]) => {
                          const forecast = dayForecasts.find((f) => f.moment_type === mt);
                          const moments = forecast?.predicted_moments ?? 0;
                          const level = availabilityLevel(moments);
                          const band = forecast ? bandLabel(forecast) : null;
                          const insufficient = forecast ? isInsufficientHistory(forecast) : false;
                          const title = forecast?.basis_note ?? undefined;

                          return (
                            <td key={date} className="px-4 py-3 text-center" title={title}>
                              <p className="text-sm font-medium text-white">{moments}</p>
                              {band && (
                                <p className={`text-xs ${insufficient ? "text-yellow-500" : "text-slate-500"}`}>
                                  {band}
                                </p>
                              )}
                              <p className={`text-xs ${level.color}`}>
                                {insufficient ? "Projection" : level.label}
                              </p>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Per-sport basis legend */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-400">Data Basis</h3>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from(
                  new Map(
                    forecasts
                      .filter((f) => f.basis_note)
                      .map((f) => [f.league, f.basis_note])
                  ).entries()
                ).map(([league, note]) => (
                  <div key={league} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                    <p className="text-xs font-semibold uppercase text-slate-400">{league}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{note}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
