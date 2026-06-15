import { requireAdmin } from "@/lib/admin";
import { LiveAuctionDashboard } from "@/components/live-auction-dashboard";

export const metadata = { title: "Live Auction Monitor — NORMA Admin" };

export default async function LiveAuctionPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Live Auction Monitor</h1>
        <p className="mt-1 text-sm text-slate-400">
          Real-time intent moments, fill rate, and clearing prices. Updates as
          auctions occur. Aggregate only — no user identity.
        </p>
      </div>
      <LiveAuctionDashboard />
    </div>
  );
}
