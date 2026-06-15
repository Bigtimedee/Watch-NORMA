"use client";

import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import { KpiCard } from "@/components/kpi-card";
import { formatCents, formatPercent } from "@/lib/utils";

type Window = 5 | 15 | 60;

interface IntentMomentRow {
  id: number;
  moment_type: string;
  auction_outcome: "filled" | "unfilled" | "ineligible";
  clearing_price_cents: number | null;
  fired_at: string;
  intent_score: number;
  eligible_user_count: number;
}

function windowMs(w: Window) {
  return w * 60 * 1000;
}

function isWithinWindow(firedAt: string, windowMinutes: Window) {
  return Date.now() - new Date(firedAt).getTime() <= windowMs(windowMinutes);
}

export function LiveAuctionDashboard() {
  const [window, setWindow] = useState<Window>(15);
  const [moments, setMoments] = useState<IntentMomentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const supabase = createSupabaseBrowser();

  const fetchInitial = useCallback(
    async (w: Window) => {
      setLoading(true);
      const cutoff = new Date(Date.now() - windowMs(w)).toISOString();
      const { data } = await supabase
        .from("intent_moments")
        .select(
          "id, moment_type, auction_outcome, clearing_price_cents, fired_at, intent_score, eligible_user_count"
        )
        .gte("fired_at", cutoff)
        .order("fired_at", { ascending: false })
        .limit(500);
      setMoments((data as IntentMomentRow[]) ?? []);
      setLastUpdate(new Date());
      setLoading(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    fetchInitial(window);
  }, [window, fetchInitial]);

  // Supabase Realtime — subscribe to new intent_moments
  useEffect(() => {
    const channel = supabase
      .channel("live-intent-moments")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "intent_moments" },
        (payload) => {
          const row = payload.new as IntentMomentRow;
          setMoments((prev) => {
            const updated = [row, ...prev];
            // Keep only rows within the 60-min window (max window)
            const cutoff = Date.now() - 60 * 60 * 1000;
            return updated.filter(
              (m) => new Date(m.fired_at).getTime() > cutoff
            );
          });
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter moments to selected window
  const visible = moments.filter((m) => isWithinWindow(m.fired_at, window));

  // KPIs
  const total = visible.length;
  const filled = visible.filter((m) => m.auction_outcome === "filled").length;
  const unfilled = visible.filter((m) => m.auction_outcome === "unfilled").length;
  const ineligible = visible.filter(
    (m) => m.auction_outcome === "ineligible"
  ).length;
  const fillRate = total > 0 ? (filled / total) * 100 : 0;
  const filledMoments = visible.filter(
    (m) => m.clearing_price_cents != null
  );
  const avgClearing =
    filledMoments.length > 0
      ? filledMoments.reduce((s, m) => s + (m.clearing_price_cents ?? 0), 0) /
        filledMoments.length
      : 0;
  const avgIntentScore =
    visible.length > 0
      ? visible.reduce((s, m) => s + m.intent_score, 0) / visible.length
      : 0;

  // Moment type breakdown
  const typeMap = new Map<string, { filled: number; unfilled: number; ineligible: number }>();
  for (const m of visible) {
    const entry = typeMap.get(m.moment_type) ?? { filled: 0, unfilled: 0, ineligible: 0 };
    entry[m.auction_outcome]++;
    typeMap.set(m.moment_type, entry);
  }
  const typeData = Array.from(typeMap.entries())
    .map(([name, v]) => ({
      name: name.replace(/_/g, " "),
      Filled: v.filled,
      Unfilled: v.unfilled,
      Ineligible: v.ineligible,
    }))
    .sort((a, b) => b.Filled + b.Unfilled + b.Ineligible - (a.Filled + a.Unfilled + a.Ineligible));

  // Clearing price over time (filled moments, newest last)
  const clearingHistory = visible
    .filter((m) => m.clearing_price_cents != null)
    .slice(0, 30)
    .reverse()
    .map((m, i) => ({
      i: i + 1,
      cents: m.clearing_price_cents ?? 0,
      label: m.moment_type.replace(/_/g, " "),
    }));

  return (
    <div className="space-y-8">
      {/* Header + window selector */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">
            Last updated: {lastUpdate.toLocaleTimeString()} ·{" "}
            {loading ? (
              <span className="text-yellow-400">Loading…</span>
            ) : (
              <span className="text-green-400">Live</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {([5, 15, 60] as Window[]).map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                window === w
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {w}m
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          title="Moments Fired"
          value={String(total)}
          subtitle={`last ${window} min`}
        />
        <KpiCard
          title="Fill Rate"
          value={formatPercent(fillRate)}
          subtitle={`${filled} filled of ${total}`}
          trend={fillRate >= 50 ? "up" : fillRate >= 25 ? "neutral" : "down"}
        />
        <KpiCard
          title="Avg Clearing Price"
          value={avgClearing > 0 ? formatCents(avgClearing) : "—"}
          subtitle={`${filledMoments.length} filled auctions`}
          trend="neutral"
        />
        <KpiCard
          title="Avg Intent Score"
          value={avgIntentScore > 0 ? avgIntentScore.toFixed(3) : "—"}
          subtitle="0–1 scale"
          trend="neutral"
        />
      </div>

      {/* No-fill breakdown */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6">
        <h3 className="mb-4 text-sm font-semibold text-slate-300">
          Auction Outcome Breakdown
        </h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-green-400">{filled}</p>
            <p className="mt-1 text-xs text-slate-500">
              Filled ({total > 0 ? formatPercent((filled / total) * 100) : "—"})
            </p>
          </div>
          <div>
            <p className="text-2xl font-bold text-yellow-400">{unfilled}</p>
            <p className="mt-1 text-xs text-slate-500">
              Unfilled — no bids (
              {total > 0 ? formatPercent((unfilled / total) * 100) : "—"})
            </p>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-400">{ineligible}</p>
            <p className="mt-1 text-xs text-slate-500">
              Ineligible — no eligible demand (
              {total > 0 ? formatPercent((ineligible / total) * 100) : "—"})
            </p>
          </div>
        </div>
      </div>

      {/* Moment type chart */}
      {typeData.length > 0 && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6">
          <h3 className="mb-4 text-sm font-semibold text-slate-300">
            Moments by Type
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={typeData} margin={{ left: 0, right: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="name"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                angle={-35}
                textAnchor="end"
              />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
              <Bar dataKey="Filled" stackId="a" fill="#22c55e" />
              <Bar dataKey="Unfilled" stackId="a" fill="#eab308" />
              <Bar dataKey="Ineligible" stackId="a" fill="#475569" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Clearing price over time */}
      {clearingHistory.length > 0 && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6">
          <h3 className="mb-4 text-sm font-semibold text-slate-300">
            Clearing Price — Last {clearingHistory.length} Fills
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={clearingHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="i" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                tickFormatter={(v) => `$${(v / 100).toFixed(2)}`}
              />
              <Tooltip
                formatter={(v: number) => formatCents(v)}
                contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Line
                type="monotone"
                dataKey="cents"
                stroke="#3b82f6"
                dot={{ fill: "#3b82f6", r: 3 }}
                name="Clearing price"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {total === 0 && !loading && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-12 text-center text-slate-500">
          No intent moments in the last {window} minutes. Data appears here as
          live games trigger alerts.
        </div>
      )}
    </div>
  );
}
