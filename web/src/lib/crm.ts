/**
 * Advertiser CRM helpers.
 *
 * Recipient addresses come only from a value an admin saved on the prospect.
 * Nothing in this module invents or pattern-guesses an email from a company name.
 * CTA links point at the public advertisers page. They are never a From address.
 */

export const ADVERTISER_CTA_URL = "https://getnorma.app/advertisers";

/** Verified Resend mailbox already used by advertiser performance reports. */
export const DEFAULT_OUTREACH_FROM = "NORMA <reports@getnorma.app>";

export const CRM_STAGES = ["prospect", "contacted", "qualified", "won", "lost"] as const;
export type CrmStage = (typeof CRM_STAGES)[number];

export type SocialHandle = { network: string; handle: string };

export type OutreachPlan =
  | { ok: false; error: string }
  | {
      ok: true;
      to: string;
      from: string;
      subject: string;
      text: string;
      html: string;
    };

export type ResendDelivery = { ok: true; id: string } | { ok: false; error: string };

const MAILBOX_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isMailbox(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 320) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;
  return MAILBOX_RE.test(trimmed);
}

/** Pull the mailbox out of `Name <email>` or a bare email. Rejects URLs. */
export function parseFromMailbox(from: string): string | null {
  const trimmed = from.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return null;
  const angle = trimmed.match(/^(.*?)<([^<>]+)>$/);
  const email = (angle ? angle[2] : trimmed).trim();
  if (!isMailbox(email)) return null;
  return email.toLowerCase();
}

export function parseProspectEmail(value: string | null | undefined): string | null | "invalid" {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (!isMailbox(trimmed)) return "invalid";
  return trimmed.toLowerCase();
}

export function parseStage(value: string | null | undefined): CrmStage | "invalid" {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "prospect";
  if ((CRM_STAGES as readonly string[]).includes(trimmed)) return trimmed as CrmStage;
  return "invalid";
}

/** Calendar date `YYYY-MM-DD`, or null when blank. Rejects impossible dates. */
export function parseDateOnly(value: string | null | undefined): string | null | "invalid" {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return "invalid";
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "invalid";
  if (parsed.toISOString().slice(0, 10) !== trimmed) return "invalid";
  return trimmed;
}

export function snippetFromBody(body: string, max = 180): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max - 1).trimEnd()}…`;
}

export function socialsFromFields(fields: {
  x?: string | null;
  linkedin?: string | null;
  instagram?: string | null;
  other?: string | null;
}): SocialHandle[] {
  const out: SocialHandle[] = [];
  const push = (network: string, handle: string | null | undefined) => {
    const cleanedNetwork = network.trim().toLowerCase();
    const cleanedHandle = handle?.trim() ?? "";
    if (!cleanedNetwork || !cleanedHandle) return;
    const normalized = cleanedNetwork === "twitter" ? "x" : cleanedNetwork;
    out.push({ network: normalized.slice(0, 40), handle: cleanedHandle.slice(0, 200) });
  };

  push("x", fields.x);
  push("linkedin", fields.linkedin);
  push("instagram", fields.instagram);

  for (const line of (fields.other ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx > 0) {
      const network = trimmed.slice(0, idx).trim();
      const handle = trimmed.slice(idx + 1).trim();
      if (network && handle) push(network, handle);
    } else {
      push("other", trimmed);
    }
  }

  return out;
}

export function fieldsFromSocials(socials: SocialHandle[] | null | undefined): {
  x: string;
  linkedin: string;
  instagram: string;
  other: string;
} {
  const known = { x: "", linkedin: "", instagram: "" };
  const otherLines: string[] = [];

  for (const entry of socials ?? []) {
    const network = entry.network?.toLowerCase() ?? "";
    const handle = entry.handle ?? "";
    if (!handle) continue;
    if ((network === "x" || network === "twitter") && !known.x) {
      known.x = handle;
    } else if (network === "linkedin" && !known.linkedin) {
      known.linkedin = handle;
    } else if (network === "instagram" && !known.instagram) {
      known.instagram = handle;
    } else if (network === "other") {
      otherLines.push(handle);
    } else {
      otherLines.push(`${entry.network}: ${handle}`);
    }
  }

  return { ...known, other: otherLines.join("\n") };
}

export function asSocials(value: unknown): SocialHandle[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as { network?: unknown; handle?: unknown };
    if (typeof record.network !== "string" || typeof record.handle !== "string") return [];
    if (!record.network.trim() || !record.handle.trim()) return [];
    return [{ network: record.network, handle: record.handle }];
  });
}

export function formatSocials(socials: SocialHandle[] | null | undefined): string {
  if (!socials?.length) return "";
  return socials
    .map((entry) => {
      const network = entry.network.toLowerCase() === "x" ? "X" : entry.network;
      const label = network.charAt(0).toUpperCase() + network.slice(1);
      return `${label} ${entry.handle}`;
    })
    .join(" · ");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Prefill for a draft the admin still has to save. Uses the stored name and
 * company only — no email address is written into the body.
 */
export function outreachDraftTemplate(input: {
  companyName: string;
  contactName: string;
}): { subject: string; body: string } {
  const contact = input.contactName.trim() || "there";
  const company = input.companyName.trim() || "your team";
  return {
    subject: `Advertising on NORMA — ${company}`,
    body: [
      `Hi ${contact},`,
      "",
      "NORMA tells sports fans when to tune in, and brands can advertise inside those moments.",
      "",
      `If ${company} wants to reach fans at the point of attention, the overview is here:`,
      ADVERTISER_CTA_URL,
      "",
      "Happy to walk through how a campaign would work.",
    ].join("\n"),
  };
}

/**
 * Build a send payload for one stored recipient. `storedEmail` must already
 * be the prospect row's email. There is no company-domain fallback.
 */
export function planOutreachSend(input: {
  storedEmail: string | null | undefined;
  subject: string;
  body: string;
  from?: string | null;
}): OutreachPlan {
  const stored = input.storedEmail?.trim() ?? "";
  if (!stored || !isMailbox(stored)) {
    return {
      ok: false,
      error:
        "This prospect has no email on file. Enter the address the contact gave you before sending.",
    };
  }

  const fromRaw = (input.from?.trim() || DEFAULT_OUTREACH_FROM).trim();
  if (!parseFromMailbox(fromRaw)) {
    return {
      ok: false,
      error: "Outreach From must be a mailbox such as reports@getnorma.app, never a page URL.",
    };
  }

  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) {
    return { ok: false, error: "Subject and body are required." };
  }
  if (subject.length > 200) {
    return { ok: false, error: "Subject must be 200 characters or fewer." };
  }
  if (body.length > 20000) {
    return { ok: false, error: "Body must be 20,000 characters or fewer." };
  }

  const text = `${body}\n\nAdvertise with NORMA: ${ADVERTISER_CTA_URL}\n`;
  const html = [
    `<div style="font-family:sans-serif;white-space:pre-wrap">${escapeHtml(body)}</div>`,
    `<p><a href="${ADVERTISER_CTA_URL}">Advertise with NORMA</a></p>`,
  ].join("\n");

  return {
    ok: true,
    to: stored.toLowerCase(),
    from: fromRaw,
    subject,
    text,
    html,
  };
}

/**
 * Admin-triggered Resend delivery. Callers must pass `fetchImpl`.
 * An empty API key returns an error and does not call fetch.
 */
export async function deliverOutreachViaResend(
  plan: Extract<OutreachPlan, { ok: true }>,
  options: { apiKey: string | undefined; fetchImpl: typeof fetch }
): Promise<ResendDelivery> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error:
        "Live send is not configured. Set RESEND_API_KEY on the web app (same Resend account as advertiser reports; From defaults to NORMA <reports@getnorma.app>). Until then, send the draft from your mailbox and use Mark sent.",
    };
  }

  let response: Response;
  try {
    response = await options.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: plan.from,
        to: [plan.to],
        subject: plan.subject,
        html: plan.html,
        text: plan.text,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return { ok: false, error: `Resend request failed: ${message.slice(0, 200)}` };
  }

  const raw = await response.text();
  if (!response.ok) {
    return { ok: false, error: `Resend ${response.status}: ${raw.slice(0, 200)}` };
  }

  let id = "";
  try {
    const parsed = JSON.parse(raw) as { id?: unknown };
    if (typeof parsed.id === "string") id = parsed.id;
  } catch {
    id = "";
  }
  if (!id) {
    return { ok: false, error: "Resend accepted the email but did not return a message id." };
  }
  return { ok: true, id };
}

export function latestByDraftedAt<T extends { drafted_at: string }>(rows: T[] | null | undefined): T | null {
  if (!rows?.length) return null;
  return [...rows].sort((a, b) => (a.drafted_at < b.drafted_at ? 1 : -1))[0] ?? null;
}

export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year}`;
}

export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * PostgREST `or` filter. User text is quoted so `.` and `@` stay inside the
 * pattern and cannot add extra operators.
 */
export function prospectSearchFilter(query: string): string | null {
  const safe = query.replace(/[%_,\\]/g, "").replace(/"/g, "").trim();
  if (!safe) return null;
  const quoted = `"%${safe}%"`;
  return [
    `company_name.ilike.${quoted}`,
    `contact_name.ilike.${quoted}`,
    `email.ilike.${quoted}`,
  ].join(",");
}
