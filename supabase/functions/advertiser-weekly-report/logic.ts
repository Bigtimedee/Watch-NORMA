// Pure functions for advertiser weekly report assembly.

export interface ImpressionRow {
  id: number;
  clearing_price_cents: number;
  tapped_at: string | null;
  moment_type: string | null;
  creative_id: number | null;
  variant_label: string | null;
}

export interface ConversionRow {
  impression_id: number;
  conversion_type: string;
}

export interface MomentStat {
  impressions: number;
  taps: number;
  spendCents: number;
}

export interface CreativeStat {
  impressions: number;
  taps: number;
  spendCents: number;
  variantLabel: string;
}

export interface WeeklyMetrics {
  impressions: number;
  taps: number;
  ctr: number;
  spendCents: number;
  avgClearingCents: number;
  // cta_tap + app_return = app-verified; sportsbook_open + stream_open + commerce_open + wager_placed = inferred
  verifiedConversions: number;
  inferredConversions: number;
  totalConversions: number;
  cpaCents: number;
  byMoment: Record<string, MomentStat>;
  byCreative: Record<string, CreativeStat>;
}

export interface MetricDeltas {
  impressionsDelta: number;
  impressionsPct: number;
  tapsDelta: number;
  tapsPct: number;
  spendDeltaCents: number;
  spendPct: number;
  ctrDeltaPp: number;
}

const VERIFIED_TYPES = new Set(["cta_tap", "app_return"]);
const INFERRED_TYPES = new Set(["sportsbook_open", "stream_open", "commerce_open", "wager_placed"]);

export function computeWeeklyMetrics(
  impressionRows: ImpressionRow[],
  conversionRows: ConversionRow[],
): WeeklyMetrics {
  const impressions = impressionRows.length;
  const taps = impressionRows.filter((i) => i.tapped_at != null).length;
  const ctr = impressions > 0 ? taps / impressions : 0;
  const spendCents = impressionRows.reduce((s, i) => s + i.clearing_price_cents, 0);
  const avgClearingCents = impressions > 0 ? Math.round(spendCents / impressions) : 0;

  const verifiedConversions = conversionRows.filter((c) => VERIFIED_TYPES.has(c.conversion_type)).length;
  const inferredConversions = conversionRows.filter((c) => INFERRED_TYPES.has(c.conversion_type)).length;
  const totalConversions = verifiedConversions + inferredConversions;
  const cpaCents = totalConversions > 0 ? Math.round(spendCents / totalConversions) : 0;

  const byMoment: Record<string, MomentStat> = {};
  const byCreative: Record<string, CreativeStat> = {};

  for (const imp of impressionRows) {
    const m = imp.moment_type ?? "unknown";
    if (!byMoment[m]) byMoment[m] = { impressions: 0, taps: 0, spendCents: 0 };
    byMoment[m].impressions++;
    if (imp.tapped_at) byMoment[m].taps++;
    byMoment[m].spendCents += imp.clearing_price_cents;

    const cid = String(imp.creative_id ?? "unknown");
    if (!byCreative[cid]) {
      byCreative[cid] = { impressions: 0, taps: 0, spendCents: 0, variantLabel: imp.variant_label ?? `creative ${cid}` };
    }
    byCreative[cid].impressions++;
    if (imp.tapped_at) byCreative[cid].taps++;
    byCreative[cid].spendCents += imp.clearing_price_cents;
  }

  return { impressions, taps, ctr, spendCents, avgClearingCents, verifiedConversions, inferredConversions, totalConversions, cpaCents, byMoment, byCreative };
}

function pctChange(cur: number, prev: number): number {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

export function computeDeltas(current: WeeklyMetrics, prior: WeeklyMetrics): MetricDeltas {
  return {
    impressionsDelta: current.impressions - prior.impressions,
    impressionsPct: pctChange(current.impressions, prior.impressions),
    tapsDelta: current.taps - prior.taps,
    tapsPct: pctChange(current.taps, prior.taps),
    spendDeltaCents: current.spendCents - prior.spendCents,
    spendPct: pctChange(current.spendCents, prior.spendCents),
    // expressed as percentage-point difference, rounded to 2 decimal places
    ctrDeltaPp: Math.round((current.ctr - prior.ctr) * 10000) / 100,
  };
}

export function generateInsight(metrics: WeeklyMetrics, maxBidCents: number): string {
  if (metrics.impressions === 0) {
    return "No impressions were delivered this week. This usually means no matching game moments fired during your flight window, or your bid is below the floor for your selected moment types. Check your active campaigns at getnorma.app/advertise.";
  }

  // Rule 1: clearing well below max bid — budget headroom available
  if (maxBidCents > 0) {
    const ratio = metrics.avgClearingCents / maxBidCents;
    if (ratio < 0.8) {
      const belowPct = Math.round((1 - ratio) * 100);
      const topMoment = Object.entries(metrics.byMoment)
        .sort((a, b) => b[1].impressions - a[1].impressions)[0]?.[0] ?? "your top moment type";
      return `Your impressions cleared ${belowPct}% below your max bid this week — you have unused budget headroom. Adding complementary moment types alongside ${topMoment} can increase volume at the same CPM ceiling.`;
    }
  }

  // Rule 2: solid impressions, zero conversions — CTA or deep-link issue
  if (metrics.impressions >= 10 && metrics.totalConversions === 0) {
    return `You received ${metrics.impressions.toLocaleString()} impressions this week with no recorded conversions. Consider testing a more direct CTA (such as "Bet Now" or "Watch Live") or confirming your deep-link URL opens correctly on iOS.`;
  }

  // Rule 3: high CTR but all conversions are inferred — encourage verified tracking
  if (metrics.ctr > 0.05 && metrics.verifiedConversions === 0 && metrics.inferredConversions > 0) {
    return `Your CTR is ${(metrics.ctr * 100).toFixed(1)}% — solid engagement. All ${metrics.inferredConversions} conversions are currently inferred (external app opened; downstream action unconfirmed). Configure a postback webhook from your MMP to unlock app-verified attribution and improve future bid optimization.`;
  }

  // Default: surface best moment type by CTR
  const topByCtr = Object.entries(metrics.byMoment)
    .filter(([, s]) => s.impressions > 0)
    .sort((a, b) => b[1].taps / b[1].impressions - a[1].taps / a[1].impressions)[0];
  if (topByCtr) {
    const [name, stat] = topByCtr;
    const ctr = (stat.taps / stat.impressions * 100).toFixed(1);
    return `Your best moment type this week was ${name} with a ${ctr}% CTR. Increasing your bid cap for this moment type may capture more of that high-intent audience.`;
  }

  return "Your campaign ran this week. Review your full dashboard at getnorma.app/advertise.";
}

function fmtDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtArrow(n: number): string {
  if (n > 0) return "&#9650;";
  if (n < 0) return "&#9660;";
  return "&mdash;";
}

function fmtPctDelta(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}%`;
}

export interface BuildEmailParams {
  advertiserName: string;
  periodStart: string;
  periodEnd: string;
  current: WeeklyMetrics;
  prior: WeeklyMetrics;
  deltas: MetricDeltas;
  insight: string;
  billingUrl: string;
}

export function buildHtmlEmail(p: BuildEmailParams): string {
  const { advertiserName, periodStart, periodEnd, current, prior, deltas, insight, billingUrl } = p;
  const hasPrior = prior.impressions > 0;

  const momentRows = Object.entries(current.byMoment)
    .sort((a, b) => b[1].impressions - a[1].impressions)
    .slice(0, 6);

  const creativeRows = Object.entries(current.byCreative)
    .sort((a, b) => {
      const cA = a[1].impressions > 0 ? a[1].taps / a[1].impressions : 0;
      const cB = b[1].impressions > 0 ? b[1].taps / b[1].impressions : 0;
      return cB - cA;
    })
    .slice(0, 4);

  const deltaClass = (n: number) => n > 0 ? "delta-up" : n < 0 ? "delta-down" : "delta-flat";

  const metricDeltaHtml = (delta: number, pct: number) =>
    hasPrior
      ? `<div class="metric-delta ${deltaClass(delta)}">${fmtArrow(delta)} ${fmtPctDelta(pct)} vs prior week</div>`
      : `<div class="metric-delta delta-flat">First week</div>`;

  const ctrDeltaHtml = hasPrior
    ? `<div class="metric-delta ${deltaClass(deltas.ctrDeltaPp)}">${fmtArrow(deltas.ctrDeltaPp)} ${deltas.ctrDeltaPp > 0 ? "+" : ""}${deltas.ctrDeltaPp}pp vs prior</div>`
    : `<div class="metric-delta delta-flat">First week</div>`;

  const momentTableHtml = momentRows.length > 0 ? `
    <div class="section-title">Performance by Moment Type</div>
    <table>
      <thead><tr><th>Moment</th><th>Impressions</th><th>Taps</th><th>CTR</th><th>Spend</th></tr></thead>
      <tbody>
        ${momentRows.map(([m, s]) => `<tr>
          <td><code>${m}</code></td>
          <td>${s.impressions.toLocaleString()}</td>
          <td>${s.taps}</td>
          <td>${s.impressions > 0 ? (s.taps / s.impressions * 100).toFixed(1) : "0.0"}%</td>
          <td>${fmtDollars(s.spendCents)}</td>
        </tr>`).join("")}
      </tbody>
    </table>` : "";

  const creativeTableHtml = creativeRows.length > 0 ? `
    <div class="section-title">Performance by Creative</div>
    <table>
      <thead><tr><th>Variant</th><th>Impressions</th><th>Taps</th><th>CTR</th></tr></thead>
      <tbody>
        ${creativeRows.map(([, s]) => `<tr>
          <td>${s.variantLabel}</td>
          <td>${s.impressions.toLocaleString()}</td>
          <td>${s.taps}</td>
          <td>${s.impressions > 0 ? (s.taps / s.impressions * 100).toFixed(1) : "0.0"}%</td>
        </tr>`).join("")}
      </tbody>
    </table>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NORMA Weekly Report — ${advertiserName}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;margin:0;padding:24px;color:#111}
.container{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden}
.header{background:#0f172a;color:#fff;padding:28px 32px}
.header h1{margin:0 0 4px;font-size:20px;font-weight:700}
.header p{margin:0;font-size:13px;color:#94a3b8}
.body{padding:28px 32px}
.metrics-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:28px}
.metric{background:#f8fafc;border-radius:8px;padding:14px 16px}
.metric-label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin-bottom:4px}
.metric-value{font-size:22px;font-weight:700;color:#0f172a}
.metric-delta{font-size:12px;margin-top:2px}
.delta-up{color:#16a34a}.delta-down{color:#dc2626}.delta-flat{color:#64748b}
.section-title{font-size:13px;font-weight:600;color:#0f172a;text-transform:uppercase;letter-spacing:.05em;margin:24px 0 12px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:8px 12px;background:#f8fafc;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
td{padding:10px 12px;border-top:1px solid #f1f5f9}
code{font-family:monospace;background:#f1f5f9;padding:2px 5px;border-radius:3px;font-size:12px}
.attribution-note{background:#fef9c3;border-left:3px solid #eab308;border-radius:4px;padding:12px 16px;font-size:12px;color:#713f12;margin-bottom:20px}
.insight-box{background:#eff6ff;border-left:3px solid #3b82f6;border-radius:4px;padding:14px 16px;font-size:13px;color:#1e40af;margin-bottom:24px}
.insight-box strong{display:block;margin-bottom:6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#3b82f6}
.cta-section{text-align:center;margin:28px 0 8px}
.cta-btn{display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600}
.footer{padding:20px 32px;background:#f8fafc;font-size:11px;color:#94a3b8;border-top:1px solid #f1f5f9}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>NORMA Weekly Report</h1>
    <p>${advertiserName} &bull; ${periodStart} to ${periodEnd}</p>
  </div>
  <div class="body">
    <div class="metrics-grid">
      <div class="metric">
        <div class="metric-label">Impressions</div>
        <div class="metric-value">${current.impressions.toLocaleString()}</div>
        ${metricDeltaHtml(deltas.impressionsDelta, deltas.impressionsPct)}
      </div>
      <div class="metric">
        <div class="metric-label">CTR</div>
        <div class="metric-value">${(current.ctr * 100).toFixed(1)}%</div>
        ${ctrDeltaHtml}
      </div>
      <div class="metric">
        <div class="metric-label">Spend</div>
        <div class="metric-value">${fmtDollars(current.spendCents)}</div>
        ${metricDeltaHtml(deltas.spendDeltaCents, deltas.spendPct)}
      </div>
      <div class="metric">
        <div class="metric-label">Avg CPM</div>
        <div class="metric-value">${fmtDollars(current.avgClearingCents)}</div>
        <div class="metric-delta delta-flat">clearing price</div>
      </div>
      <div class="metric">
        <div class="metric-label">Conversions</div>
        <div class="metric-value">${current.totalConversions}</div>
        <div class="metric-delta delta-flat">${current.verifiedConversions} verified &middot; ${current.inferredConversions} inferred</div>
      </div>
      <div class="metric">
        <div class="metric-label">CPA</div>
        <div class="metric-value">${current.totalConversions > 0 ? fmtDollars(current.cpaCents) : "&mdash;"}</div>
        <div class="metric-delta delta-flat">cost per attributed</div>
      </div>
    </div>

    <div class="attribution-note">
      <strong>Attribution note:</strong> Conversions labeled <em>verified</em> are app-confirmed (CTA tap or app return within NORMA). Conversions labeled <em>inferred</em> indicate an external app or site was opened after an impression — the downstream action (wager placed, subscription started, purchase completed) was not confirmed. To upgrade inferred to verified, configure a postback webhook from your MMP (Adjust, AppsFlyer, or Branch).
    </div>

    <div class="section-title">This week&rsquo;s insight</div>
    <div class="insight-box">
      <strong>Automated insight</strong>
      ${insight}
    </div>

    ${momentTableHtml}
    ${creativeTableHtml}

    <div class="cta-section">
      <a href="${billingUrl}" class="cta-btn">Deposit / Raise Budget</a>
    </div>
  </div>
  <div class="footer">
    This report is sent automatically every Monday morning. Conversions labeled <em>inferred</em> are not confirmed revenue outcomes &mdash; they represent an external app or site opened within the attribution window. Reply to this email or visit getnorma.app/advertise with questions.
  </div>
</div>
</body>
</html>`;
}
