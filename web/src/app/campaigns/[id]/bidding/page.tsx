"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Nav } from "@/components/nav";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import type { Bid, FloorPrice } from "@/lib/types";
import { formatCents } from "@/lib/utils";
import Link from "next/link";

export default function BiddingPage() {
  const { id } = useParams<{ id: string }>();
  const [bids, setBids] = useState<Bid[]>([]);
  const [floors, setFloors] = useState<FloorPrice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    const supabase = createSupabaseBrowser();
    const [{ data: bidsData }, { data: floorsData }] = await Promise.all([
      supabase.from("bids").select("*").eq("campaign_id", parseInt(id)).order("moment_type"),
      supabase.from("floor_prices").select("*").order("floor_cents", { ascending: false }),
    ]);
    setBids((bidsData as Bid[]) ?? []);
    setFloors((floorsData as FloorPrice[]) ?? []);
    setLoading(false);
  }

  async function updateBid(bidId: number, newCents: number) {
    const supabase = createSupabaseBrowser();
    await supabase.from("bids").update({ bid_cents: newCents }).eq("id", bidId);
    loadData();
  }

  async function toggleBid(bidId: number, currentStatus: string) {
    const supabase = createSupabaseBrowser();
    const newStatus = currentStatus === "active" ? "paused" : "active";
    await supabase.from("bids").update({ status: newStatus }).eq("id", bidId);
    loadData();
  }

  const floorMap = new Map(floors.map((f) => [f.moment_type, f]));

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Link href={`/campaigns/${id}`} className="text-sm text-slate-400 hover:text-white">
          &larr; Campaign
        </Link>
        <h1 className="mt-4 text-xl font-bold text-white">Bidding</h1>

        {/* Floor prices reference */}
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="text-sm font-semibold text-slate-400">Floor Prices</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {floors.map((f) => (
              <span key={f.moment_type}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300">
                {f.moment_type}: <strong className="text-white">{formatCents(f.floor_cents)}</strong>
                {f.premium_multiplier > 1 && (
                  <span className="ml-1 text-orange-400">({f.premium_multiplier}x)</span>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Active bids */}
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-400">Moment Type</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">Floor</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">Your Bid</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-slate-400">Impressions</th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase text-slate-400">Status</th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {bids.map((bid) => {
                const floor = floorMap.get(bid.moment_type);
                const belowFloor = floor && bid.bid_cents < floor.floor_cents;
                return (
                  <tr key={bid.id} className="hover:bg-slate-900/50">
                    <td className="px-6 py-4 text-white">{bid.moment_type}</td>
                    <td className="px-6 py-4 text-right text-slate-400">
                      {floor ? formatCents(floor.floor_cents) : "-"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={bid.bid_cents}
                        onChange={(e) => updateBid(bid.id, parseInt(e.target.value) || 0)}
                        className={`w-20 rounded border bg-slate-800 px-2 py-1 text-right text-white ${
                          belowFloor ? "border-red-500" : "border-slate-700"
                        }`}
                      />
                      {belowFloor && (
                        <p className="text-xs text-red-400">Below floor</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-300">
                      {bid.impressions_delivered}
                      {bid.daily_impressions_cap && (
                        <span className="text-slate-500">/{bid.daily_impressions_cap}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        bid.status === "active" ? "bg-green-900/30 text-green-400" :
                        bid.status === "exhausted" ? "bg-red-900/30 text-red-400" :
                        "bg-slate-700 text-slate-400"
                      }`}>
                        {bid.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => toggleBid(bid.id, bid.status)}
                        className="text-sm text-slate-400 hover:text-white"
                      >
                        {bid.status === "active" ? "Pause" : "Resume"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && bids.length === 0 && (
            <p className="px-6 py-8 text-center text-slate-500">No bids configured.</p>
          )}
        </div>
      </main>
    </div>
  );
}
