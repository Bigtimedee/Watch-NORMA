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

  // Availability level
  function availabilityLevel(moments: number): { label: string; color: string } {
    if (moments >= 20) return { label: "High", color: "text-green-400" };
    if (moments >= 5) return { label: "Medium", color: "text-yellow-400" };
    return { label: "Low", color: "text-red-400" };
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-2xl font-bold text-white">Inventory Forecast</h1>
        <p className="mt-1 text-sm text-slate-400">
          Estimated available moments for the next 7 days
        </p>

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

                return (
                  <div key={date} className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-center">
                    <p className="text-xs font-semibold text-slate-400">
                      {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                    <p className="mt-2 text-2xl font-bold text-white">{totalMoments}</p>
                    <p className="text-xs text-slate-500">moments</p>
                    <p className="mt-1 text-xs text-slate-500">{gamesScheduled} games</p>
                    <p className="text-xs text-slate-500">{formatNumber(totalUsers)} users</p>
                  </div>
                );
              })}
            </div>

            {/* Detailed breakdown table */}
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-white">Detailed Breakdown</h2>
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
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
                        <td className="px-4 py-3 text-sm font-medium text-white">{mt}</td>
                        {Object.entries(byDate).slice(0, 7).map(([date, dayForecasts]) => {
                          const forecast = dayForecasts.find((f) => f.moment_type === mt);
                          const moments = forecast?.predicted_moments ?? 0;
                          const level = availabilityLevel(moments);
                          return (
                            <td key={date} className="px-4 py-3 text-center">
                              <p className="text-sm font-medium text-white">{moments}</p>
                              <p className={`text-xs ${level.color}`}>{level.label}</p>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
