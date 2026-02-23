import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  className?: string;
}

export function KpiCard({ title, value, subtitle, trend, className }: KpiCardProps) {
  return (
    <div className={cn("rounded-2xl bg-slate-900 border border-slate-800 p-6", className)}>
      <p className="text-sm font-medium text-slate-400">{title}</p>
      <p className="mt-2 text-3xl font-bold text-white">{value}</p>
      {subtitle && (
        <p
          className={cn(
            "mt-1 text-sm",
            trend === "up" && "text-green-400",
            trend === "down" && "text-red-400",
            (!trend || trend === "neutral") && "text-slate-500"
          )}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
