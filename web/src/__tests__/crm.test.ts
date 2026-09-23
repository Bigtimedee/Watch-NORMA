import { readFileSync } from "fs";
import { join } from "path";
import {
  ADVERTISER_CTA_URL,
  DEFAULT_OUTREACH_FROM,
  asSocials,
  deliverOutreachViaResend,
  fieldsFromSocials,
  formatSocials,
  outreachDraftTemplate,
  parseDateOnly,
  parseFromMailbox,
  parseProspectEmail,
  planOutreachSend,
  prospectSearchFilter,
  snippetFromBody,
  socialsFromFields,
} from "../lib/crm";

const webRoot = join(__dirname, "../..");

describe("prospect email", () => {
  it("stores only a mailbox an admin typed", () => {
    expect(parseProspectEmail("  Jordan@Acme.com ")).toBe("jordan@acme.com");
    expect(parseProspectEmail("")).toBeNull();
    expect(parseProspectEmail("   ")).toBeNull();
  });

  it("rejects company-name guesses and page URLs", () => {
    expect(parseProspectEmail("acme")).toBe("invalid");
    expect(parseProspectEmail("info@acme")).toBe("invalid");
    expect(parseProspectEmail("https://getnorma.app/advertise")).toBe("invalid");
    expect(parseProspectEmail("https://getnorma.app/advertisers")).toBe("invalid");
    expect(planOutreachSend({
      storedEmail: null,
      subject: "Hello",
      body: "Body",
    }).ok).toBe(false);
  });
});

describe("planOutreachSend", () => {
  it("sends only to the stored email and links the advertisers page", () => {
    const plan = planOutreachSend({
      storedEmail: "Jordan@Acme.com",
      subject: "Advertising on NORMA",
      body: "Hi Jordan,\nSee the overview.",
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.to).toBe("jordan@acme.com");
    expect(plan.from).toBe(DEFAULT_OUTREACH_FROM);
    expect(plan.text).toContain(ADVERTISER_CTA_URL);
    expect(plan.html).toContain(`href="${ADVERTISER_CTA_URL}"`);
    expect(plan.from).not.toContain("http");
    expect(plan.to).not.toBe(ADVERTISER_CTA_URL);
  });

  it("refuses a From address that is a URL", () => {
    const plan = planOutreachSend({
      storedEmail: "jordan@acme.com",
      subject: "Hello",
      body: "Body",
      from: "https://getnorma.app/advertise",
    });
    expect(plan).toEqual({
      ok: false,
      error: "Outreach From must be a mailbox such as reports@getnorma.app, never a page URL.",
    });
    expect(parseFromMailbox("NORMA <reports@getnorma.app>")).toBe("reports@getnorma.app");
    expect(parseFromMailbox("https://getnorma.app/advertisers")).toBeNull();
  });

  it("escapes HTML in the admin-written body", () => {
    const plan = planOutreachSend({
      storedEmail: "jordan@acme.com",
      subject: "Hello",
      body: `<script>alert("x")</script>`,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.html).not.toContain("<script>");
    expect(plan.html).toContain("&lt;script&gt;");
  });
});

describe("deliverOutreachViaResend", () => {
  it("does not call fetch when the API key is missing", async () => {
    const plan = planOutreachSend({
      storedEmail: "jordan@acme.com",
      subject: "Hello",
      body: "Body",
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    let called = false;
    const fetchImpl: typeof fetch = async () => {
      called = true;
      return new Response("unused", { status: 500 });
    };
    const result = await deliverOutreachViaResend(plan, { apiKey: "  ", fetchImpl });
    expect(result.ok).toBe(false);
    expect(called).toBe(false);
  });

  it("posts only the planned recipient and returns the provider id", async () => {
    const plan = planOutreachSend({
      storedEmail: "jordan@acme.com",
      subject: "Hello",
      body: "Body",
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ id: "re_msg_123" }), { status: 200 });
    };
    const result = await deliverOutreachViaResend(plan, {
      apiKey: "re_test_key",
      fetchImpl,
    });

    expect(result).toEqual({ ok: true, id: "re_msg_123" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.to).toEqual(["jordan@acme.com"]);
    expect(body.from).toBe(DEFAULT_OUTREACH_FROM);
    expect(body.from).not.toContain("/advertise");
    expect(JSON.stringify(body)).not.toContain("re_test_key");
  });
});

describe("socials and drafts", () => {
  it("stores named networks plus freeform handles", () => {
    const socials = socialsFromFields({
      x: " @acme ",
      linkedin: "https://www.linkedin.com/in/jordan",
      instagram: "",
      other: "tiktok: @acme\nyoutube.com/acme",
    });
    expect(socials).toEqual([
      { network: "x", handle: "@acme" },
      { network: "linkedin", handle: "https://www.linkedin.com/in/jordan" },
      { network: "tiktok", handle: "@acme" },
      { network: "other", handle: "youtube.com/acme" },
    ]);
    expect(fieldsFromSocials(socials).x).toBe("@acme");
    expect(formatSocials(asSocials(socials))).toContain("X @acme");
  });

  it("normalizes twitter to x", () => {
    expect(socialsFromFields({ other: "twitter: @acme" })).toEqual([
      { network: "x", handle: "@acme" },
    ]);
  });

  it("builds a draft template without inventing an email", () => {
    const draft = outreachDraftTemplate({
      companyName: "Acme Sports",
      contactName: "Jordan",
    });
    expect(draft.body).toContain("Jordan");
    expect(draft.body).toContain("Acme Sports");
    expect(draft.body).toContain(ADVERTISER_CTA_URL);
    expect(draft.body).not.toMatch(/@/);
    expect(draft.subject).not.toMatch(/@/);
  });

  it("collapses the snippet", () => {
    expect(snippetFromBody("Hello   there\nfriend")).toBe("Hello there friend");
  });

  it("rejects impossible last-contact dates", () => {
    expect(parseDateOnly("")).toBeNull();
    expect(parseDateOnly("2026-09-23")).toBe("2026-09-23");
    expect(parseDateOnly("2026-02-31")).toBe("invalid");
  });

  it("quotes search text so it cannot add filter operators", () => {
    expect(prospectSearchFilter(`a.b@c.com",id.eq.1`)).toBe(
      [
        `company_name.ilike."%a.b@c.comid.eq.1%"`,
        `contact_name.ilike."%a.b@c.comid.eq.1%"`,
        `email.ilike."%a.b@c.comid.eq.1%"`,
      ].join(",")
    );
    expect(prospectSearchFilter(" , ")).toBeNull();
  });
});

describe("admin gate", () => {
  const read = (path: string) => readFileSync(join(webRoot, path), "utf8");

  it("keeps CRM pages and actions behind requireAdmin before the service role client", () => {
    for (const path of [
      "src/app/admin/crm/page.tsx",
      "src/app/admin/crm/[id]/page.tsx",
      "src/app/admin/crm/actions.ts",
    ]) {
      const source = read(path);
      const adminAt = source.indexOf("requireAdmin(");
      const serviceAt = source.indexOf("createSupabaseAdmin(");
      expect(adminAt).toBeGreaterThan(-1);
      expect(serviceAt).toBeGreaterThan(adminAt);
    }
  });

  it("sends mail from the explicit send action only", () => {
    const actions = read("src/app/admin/crm/actions.ts");
    const list = read("src/app/admin/crm/page.tsx");
    const detail = read("src/app/admin/crm/[id]/page.tsx");
    expect(actions.match(/deliverOutreachViaResend\(/g)).toHaveLength(1);
    expect(list).not.toContain("deliverOutreachViaResend");
    expect(detail).not.toContain("deliverOutreachViaResend");
    expect(actions).toContain("export async function sendOutreachEmail");
  });

  it("puts CRM in the admin nav and denies public table access in SQL", () => {
    const nav = read("src/components/admin-nav.tsx");
    expect(nav).toContain('{ href: "/admin/crm", label: "CRM" }');

    const sql = readFileSync(
      join(webRoot, "../supabase/migrations/20260923210000_advertiser_crm.sql"),
      "utf8"
    );
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON TABLE public.crm_prospects FROM anon, authenticated");
    expect(sql).toContain(
      "REVOKE ALL ON TABLE public.crm_outreach_emails FROM anon, authenticated"
    );
    expect(sql).not.toContain("CREATE POLICY");
    expect(sql).not.toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).not.toMatch(/INSERT INTO public\.crm_prospects/i);
  });
});
