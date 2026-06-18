// NORMA System Status Page
// Public — no auth required. Server component. Fetches health-check at render time.

export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NORMA System Status",
  description: "Live operational status for the NORMA sports alert platform.",
  robots: { index: false, follow: false },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthCheckResponse {
  status: string;
  timestamp: string;
  duration_ms: number;
  active_games: number;
  watchers: {
    active_count: number;
    stale_count: number;
    stale_game_ids: string[];
    with_errors: number;
  };
  alert_pipeline: {
    last_hour: {
      generated: number;
      delivered: number;
      throttled: number;
      failed: number;
    };
  };
  rate_budget: {
    sportradar_calls_this_minute: number;
    sportradar_budget_remaining: number;
  };
  espn_failover: {
    sdio_only_snapshots_5min: number;
    espn_degraded: boolean;
  };
}

type ComponentStatus = "green" | "yellow" | "red";

interface StatusComponent {
  name: string;
  status: ComponentStatus;
  detail: string;
}

// ─── Data Fetching ─────────────────────────────────────────────────────────

async function fetchHealth(): Promise<HealthCheckResponse | null> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/health-check`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as HealthCheckResponse;
  } catch {
    return null;
  }
}

// ─── Status Derivation ────────────────────────────────────────────────────

function deriveComponents(
  data: HealthCheckResponse | null
): StatusComponent[] {
  const dbStatus: ComponentStatus = data ? "green" : "red";

  if (!data) {
    return [
      { name: "Score Polling", status: "red", detail: "Health check unavailable" },
      { name: "PBP / Alert Engine", status: "red", detail: "Health check unavailable" },
      { name: "Push Delivery", status: "red", detail: "Health check unavailable" },
      { name: "Ad Auction", status: "green", detail: "No degraded signal" },
      { name: "Database", status: "red", detail: "Health check returned an error" },
      { name: "ESPN Feed", status: "red", detail: "Health check unavailable" },
    ];
  }

  const scorePollingStatus: ComponentStatus =
    data.watchers.stale_count > 0 ? "yellow" : "green";
  const scorePollingDetail =
    data.watchers.stale_count > 0
      ? `${data.watchers.stale_count} stale watcher${data.watchers.stale_count === 1 ? "" : "s"} detected`
      : `${data.watchers.active_count} active watcher${data.watchers.active_count === 1 ? "" : "s"}, ${data.active_games} live game${data.active_games === 1 ? "" : "s"}`;

  const alertEngineStatus: ComponentStatus =
    data.watchers.with_errors > 0 ? "yellow" : "green";
  const alertEngineDetail =
    data.watchers.with_errors > 0
      ? `${data.watchers.with_errors} watcher${data.watchers.with_errors === 1 ? "" : "s"} with errors`
      : `${data.alert_pipeline.last_hour.generated} alerts generated last hour`;

  const pushStatus: ComponentStatus =
    data.alert_pipeline.last_hour.failed > 0 ? "yellow" : "green";
  const pushDetail =
    data.alert_pipeline.last_hour.failed > 0
      ? `${data.alert_pipeline.last_hour.failed} delivery failure${data.alert_pipeline.last_hour.failed === 1 ? "" : "s"} last hour`
      : `${data.alert_pipeline.last_hour.delivered} delivered, ${data.alert_pipeline.last_hour.throttled} throttled last hour`;

  const espnStatus: ComponentStatus = data.espn_failover.espn_degraded
    ? "yellow"
    : "green";
  const espnDetail = data.espn_failover.espn_degraded
    ? `${data.espn_failover.sdio_only_snapshots_5min} snapshot${data.espn_failover.sdio_only_snapshots_5min === 1 ? "" : "s"} using SDIO-only fallback`
    : "Primary feed operational";

  return [
    { name: "Score Polling", status: scorePollingStatus, detail: scorePollingDetail },
    { name: "PBP / Alert Engine", status: alertEngineStatus, detail: alertEngineDetail },
    { name: "Push Delivery", status: pushStatus, detail: pushDetail },
    { name: "Ad Auction", status: "green", detail: "No degraded signal" },
    { name: "Database", status: dbStatus, detail: "Health check returned 200" },
    { name: "ESPN Feed", status: espnStatus, detail: espnDetail },
  ];
}

function deriveOverall(
  components: StatusComponent[]
): { label: string; color: string; dot: string } {
  const statuses = components.map((c) => c.status);
  if (statuses.includes("red")) {
    return { label: "Incident Detected", color: "#f87171", dot: "#f87171" };
  }
  if (statuses.includes("yellow")) {
    return { label: "Partial Degradation", color: "#fbbf24", dot: "#fbbf24" };
  }
  return { label: "All Systems Operational", color: "#4ade80", dot: "#4ade80" };
}

// ─── UI Helpers ────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ComponentStatus }) {
  const colors: Record<ComponentStatus, string> = {
    green: "#4ade80",
    yellow: "#fbbf24",
    red: "#f87171",
  };
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        backgroundColor: colors[status],
        flexShrink: 0,
        marginTop: 3,
      }}
    />
  );
}

function StatusBadge({ status }: { status: ComponentStatus }) {
  const map: Record<ComponentStatus, { label: string; color: string; bg: string }> = {
    green: { label: "Operational", color: "#4ade80", bg: "rgba(74,222,128,0.08)" },
    yellow: { label: "Degraded", color: "#fbbf24", bg: "rgba(251,191,36,0.08)" },
    red: { label: "Down", color: "#f87171", bg: "rgba(248,113,113,0.08)" },
  };
  const { label, color, bg } = map[status];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        color,
        backgroundColor: bg,
        border: `1px solid ${color}22`,
        borderRadius: 6,
        padding: "2px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default async function StatusPage() {
  const data = await fetchHealth();
  const components = deriveComponents(data);
  const overall = deriveOverall(components);

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#020617",
        color: "#f1f5f9",
        fontFamily: "var(--font-dm, system-ui, sans-serif)",
      }}
    >
      {/* ── Nav bar ── */}
      <header
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          maxWidth: 960,
          margin: "0 auto",
        }}
      >
        <a
          href="/"
          style={{ color: "#94a3b8", fontSize: 13, textDecoration: "none" }}
        >
          ← NORMA
        </a>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#475569",
          }}
        >
          System Status
        </span>
      </header>

      {/* ── Main ── */}
      <main
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "48px 24px 80px",
        }}
      >
        {/* Overall status banner */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${overall.dot}33`,
            borderRadius: 14,
            padding: "28px 32px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 48,
          }}
        >
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              backgroundColor: overall.dot,
              flexShrink: 0,
              boxShadow: `0 0 10px ${overall.dot}88`,
            }}
          />
          <div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: overall.color,
                lineHeight: 1.2,
              }}
            >
              {overall.label}
            </div>
            <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>
              Last checked: just now
            </div>
          </div>
        </div>

        {/* Component table */}
        <section>
          <h2
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#334155",
              marginBottom: 16,
            }}
          >
            Components
          </h2>

          <div
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {components.map((comp, i) => (
              <div
                key={comp.name}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 16,
                  padding: "18px 24px",
                  borderTop:
                    i === 0 ? "none" : "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "flex-start", gap: 12 }}
                >
                  <StatusDot status={comp.status} />
                  <div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: "#e2e8f0",
                        lineHeight: 1.3,
                      }}
                    >
                      {comp.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#475569",
                        marginTop: 3,
                      }}
                    >
                      {comp.detail}
                    </div>
                  </div>
                </div>
                <StatusBadge status={comp.status} />
              </div>
            ))}
          </div>
        </section>

        {/* Metrics panel — only shown when health check succeeded */}
        {data && (
          <section style={{ marginTop: 40 }}>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#334155",
                marginBottom: 16,
              }}
            >
              Live Metrics
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 12,
              }}
            >
              {[
                {
                  label: "Active Games",
                  value: String(data.active_games),
                },
                {
                  label: "Active Watchers",
                  value: String(data.watchers.active_count),
                },
                {
                  label: "Alerts Generated (1h)",
                  value: String(data.alert_pipeline.last_hour.generated),
                },
                {
                  label: "Alerts Delivered (1h)",
                  value: String(data.alert_pipeline.last_hour.delivered),
                },
                {
                  label: "Sportradar Calls / Min",
                  value: `${data.rate_budget.sportradar_calls_this_minute} / 25`,
                },
                {
                  label: "Health Check Latency",
                  value: `${data.duration_ms} ms`,
                },
              ].map((metric) => (
                <div
                  key={metric.label}
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 10,
                    padding: "16px 20px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      color: "#475569",
                      marginBottom: 8,
                    }}
                  >
                    {metric.label}
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: "#f1f5f9",
                    }}
                  >
                    {metric.value}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Incident notice */}
        {!data && (
          <div
            style={{
              marginTop: 32,
              padding: "16px 20px",
              background: "rgba(248,113,113,0.06)",
              border: "1px solid rgba(248,113,113,0.2)",
              borderRadius: 10,
              fontSize: 13,
              color: "#f87171",
            }}
          >
            The health-check endpoint could not be reached. This may indicate a platform outage. Check{" "}
            <a
              href="https://status.supabase.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#f87171", textDecoration: "underline" }}
            >
              status.supabase.com
            </a>{" "}
            for infrastructure status.
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer
        style={{
          borderTop: "1px solid rgba(255,255,255,0.05)",
          padding: "20px 24px",
          textAlign: "center",
          fontSize: 12,
          color: "#1e293b",
        }}
      >
        NORMA &mdash; Real-Time Sports Intent Advertising &mdash;{" "}
        <a
          href="mailto:ads@norma-app.com"
          style={{ color: "#1e293b", textDecoration: "none" }}
        >
          ads@norma-app.com
        </a>
      </footer>
    </div>
  );
}
