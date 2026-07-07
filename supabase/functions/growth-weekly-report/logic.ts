// Pure functions for growth-weekly-report — testable without DB or env.

export interface MomentBreakdownRow {
  moment_type: string;
  count: number;
  filled: number;
  avg_clearing_cents: number | null;
}

export interface GrowthMetrics {
  period_start: string;
  period_end: string;

  // User growth
  new_signups: number;
  new_signups_prior: number;
  avg_dau: number;
  avg_dau_prior: number;

  // Retention (from retention_cohorts view — latest completed week available)
  retention_cohort_week: string | null;
  retention_d1_pct: number | null;
  retention_d7_pct: number | null;

  // Engagement
  alerts_delivered: number;
  alerts_delivered_prior: number;
  watch_taps: number;
  watch_taps_prior: number;
  share_events_count: number;
  share_events_prior: number;
  referral_signups: number;
  referral_signups_prior: number;

  // App Store rating prompts
  rating_prompt_fires: number;
  rating_prompt_prior: number;

  // Ad marketplace
  intent_moments_total: number;
  intent_moments_prior: number;
  fill_rate_pct: number | null;
  fill_rate_prior_pct: number | null;
  avg_clearing_cents: number | null;
  revenue_cents: number;
  revenue_prior_cents: number;
  active_advertiser_count: number;

  // Moment breakdown
  moment_breakdown: MomentBreakdownRow[];
}

function delta(current: number, prior: number): string {
  if (prior === 0) return current > 0 ? "new" : "—";
  const pct = Math.round(((current - prior) / prior) * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

function fmtCents(cents: number | null): string {
  if (cents === null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return `${n.toFixed(1)}%`;
}

function metricRow(label: string, current: number, prior: number): string {
  return `
    <tr>
      <td style="padding:8px 12px;color:#94a3b8;font-size:13px;">${label}</td>
      <td style="padding:8px 12px;color:#f1f5f9;font-size:13px;font-weight:600;">${current.toLocaleString()}</td>
      <td style="padding:8px 12px;color:#94a3b8;font-size:13px;">${prior.toLocaleString()}</td>
      <td style="padding:8px 12px;font-size:13px;font-weight:600;color:${current >= prior ? "#34d399" : "#f87171"};">${delta(current, prior)}</td>
    </tr>`;
}

export function buildHtmlEmail(m: GrowthMetrics, adminUrl: string): string {
  const breakdownRows = m.moment_breakdown
    .map(
      (row) => `
        <tr>
          <td style="padding:6px 12px;color:#94a3b8;font-size:12px;font-family:monospace;">${row.moment_type}</td>
          <td style="padding:6px 12px;color:#f1f5f9;font-size:12px;">${row.count.toLocaleString()}</td>
          <td style="padding:6px 12px;color:#f1f5f9;font-size:12px;">${row.filled.toLocaleString()}</td>
          <td style="padding:6px 12px;color:#f1f5f9;font-size:12px;">${row.count > 0 ? Math.round((row.filled / row.count) * 100) + "%" : "—"}</td>
          <td style="padding:6px 12px;color:#f1f5f9;font-size:12px;">${fmtCents(row.avg_clearing_cents)}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="background:#0f172a;margin:0;padding:32px;font-family:system-ui,sans-serif;">
  <div style="max-width:620px;margin:0 auto;">
    <div style="margin-bottom:24px;">
      <span style="color:#f97316;font-size:20px;font-weight:700;">Watch NORMA</span>
      <span style="color:#475569;font-size:14px;margin-left:12px;">Weekly Growth Report</span>
    </div>
    <p style="color:#64748b;font-size:13px;margin:0 0 24px;">${m.period_start} to ${m.period_end}</p>

    <!-- User growth + engagement -->
    <h2 style="color:#f1f5f9;font-size:15px;font-weight:600;margin:0 0 12px;">Users &amp; Engagement</h2>
    <table style="width:100%;border-collapse:collapse;background:#1e293b;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#0f172a;">
          <th style="padding:8px 12px;text-align:left;color:#475569;font-size:11px;text-transform:uppercase;">Metric</th>
          <th style="padding:8px 12px;text-align:left;color:#475569;font-size:11px;text-transform:uppercase;">This week</th>
          <th style="padding:8px 12px;text-align:left;color:#475569;font-size:11px;text-transform:uppercase;">Prior week</th>
          <th style="padding:8px 12px;text-align:left;color:#475569;font-size:11px;text-transform:uppercase;">Change</th>
        </tr>
      </thead>
      <tbody>
        ${metricRow("New signups", m.new_signups, m.new_signups_prior)}
        ${metricRow("Avg DAU", m.avg_dau, m.avg_dau_prior)}
        ${metricRow("Alerts delivered", m.alerts_delivered, m.alerts_delivered_prior)}
        ${metricRow("Watch taps", m.watch_taps, m.watch_taps_prior)}
        ${metricRow("Share events", m.share_events_count, m.share_events_prior)}
        ${metricRow("Referral signups", m.referral_signups, m.referral_signups_prior)}
        ${metricRow("Rating prompt fires", m.rating_prompt_fires, m.rating_prompt_prior)}
      </tbody>
    </table>

    <!-- Retention -->
    ${
      m.retention_cohort_week
        ? `<div style="margin-top:16px;background:#1e293b;border-radius:8px;padding:12px 16px;">
        <p style="color:#64748b;font-size:12px;margin:0 0 6px;">Retention — cohort week ${m.retention_cohort_week}</p>
        <p style="color:#f1f5f9;font-size:14px;margin:0;">D1: <strong>${fmtPct(m.retention_d1_pct)}</strong> &nbsp; D7: <strong>${fmtPct(m.retention_d7_pct)}</strong></p>
      </div>`
        : ""
    }

    <!-- Ad marketplace -->
    <h2 style="color:#f1f5f9;font-size:15px;font-weight:600;margin:24px 0 12px;">Ad Marketplace</h2>
    <table style="width:100%;border-collapse:collapse;background:#1e293b;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#0f172a;">
          <th style="padding:8px 12px;text-align:left;color:#475569;font-size:11px;text-transform:uppercase;">Metric</th>
          <th style="padding:8px 12px;text-align:left;color:#475569;font-size:11px;text-transform:uppercase;">This week</th>
          <th style="padding:8px 12px;text-align:left;color:#475569;font-size:11px;text-transform:uppercase;">Prior week</th>
          <th style="padding:8px 12px;text-align:left;color:#475569;font-size:11px;text-transform:uppercase;">Change</th>
        </tr>
      </thead>
      <tbody>
        ${metricRow("Intent moments fired", m.intent_moments_total, m.intent_moments_prior)}
        <tr>
          <td style="padding:8px 12px;color:#94a3b8;font-size:13px;">Fill rate</td>
          <td style="padding:8px 12px;color:#f1f5f9;font-size:13px;font-weight:600;">${fmtPct(m.fill_rate_pct)}</td>
          <td style="padding:8px 12px;color:#94a3b8;font-size:13px;">${fmtPct(m.fill_rate_prior_pct)}</td>
          <td style="padding:8px 12px;color:#94a3b8;font-size:13px;">—</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;color:#94a3b8;font-size:13px;">Avg clearing CPM</td>
          <td style="padding:8px 12px;color:#f1f5f9;font-size:13px;font-weight:600;">${fmtCents(m.avg_clearing_cents)}</td>
          <td style="padding:8px 12px;color:#94a3b8;font-size:13px;">—</td>
          <td style="padding:8px 12px;color:#94a3b8;font-size:13px;">—</td>
        </tr>
        ${metricRow("Gross revenue (cents)", m.revenue_cents, m.revenue_prior_cents)}
        <tr>
          <td style="padding:8px 12px;color:#94a3b8;font-size:13px;">Active advertisers</td>
          <td style="padding:8px 12px;color:#f1f5f9;font-size:13px;font-weight:600;">${m.active_advertiser_count}</td>
          <td style="padding:8px 12px;color:#94a3b8;font-size:13px;">—</td>
          <td style="padding:8px 12px;color:#94a3b8;font-size:13px;">—</td>
        </tr>
      </tbody>
    </table>

    <!-- Moment breakdown -->
    ${
      m.moment_breakdown.length > 0
        ? `<h2 style="color:#f1f5f9;font-size:15px;font-weight:600;margin:24px 0 12px;">Moment Breakdown (this week)</h2>
      <table style="width:100%;border-collapse:collapse;background:#1e293b;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#0f172a;">
            <th style="padding:6px 12px;text-align:left;color:#475569;font-size:11px;text-transform:uppercase;">Type</th>
            <th style="padding:6px 12px;text-align:left;color:#475569;font-size:11px;text-transform:uppercase;">Fired</th>
            <th style="padding:6px 12px;text-align:left;color:#475569;font-size:11px;text-transform:uppercase;">Filled</th>
            <th style="padding:6px 12px;text-align:left;color:#475569;font-size:11px;text-transform:uppercase;">Fill %</th>
            <th style="padding:6px 12px;text-align:left;color:#475569;font-size:11px;text-transform:uppercase;">Avg CPM</th>
          </tr>
        </thead>
        <tbody>${breakdownRows}</tbody>
      </table>`
        : ""
    }

    <!-- CTA -->
    <div style="margin-top:32px;text-align:center;">
      <a href="${adminUrl}/admin/growth" style="display:inline-block;background:#f97316;color:#fff;font-size:13px;font-weight:600;padding:10px 24px;border-radius:6px;text-decoration:none;">View Full Dashboard</a>
    </div>

    <p style="color:#334155;font-size:11px;margin-top:32px;text-align:center;">
      Watch NORMA internal report &mdash; ${m.period_start} to ${m.period_end}
    </p>
  </div>
</body>
</html>`;
}
