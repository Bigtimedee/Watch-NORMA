import * as fs from "fs";
import * as path from "path";
import {
  AUTH_EMAIL_MANIFEST_PATH,
  AUTH_EMAIL_TEMPLATES_DIR,
  CONFIRMATION_URL_VAR,
  hasConfirmationUrlAnchor,
  hasRawConfirmationUrlFallback,
  lintAllAuthEmailTemplates,
  lintAuthEmailTemplateHtml,
  loadAuthEmailManifest,
  mentionsLinkCta,
  readAuthEmailTemplateHtml,
} from "../auth-email-templates";

/** Exact copy Dave received (Gmail mobile, 2026-09-19) — heading + CTA, no href. */
const BROKEN_PRODUCTION_RECOVERY = `<h2>Reset Password</h2>
<p>Follow this link to reset the password for your user:</p>
<p>Reset Password</p>
`;

describe("auth email template lint", () => {
  it("flags the production recovery body that had no hyperlink", () => {
    expect(mentionsLinkCta(BROKEN_PRODUCTION_RECOVERY)).toBe(true);
    expect(hasConfirmationUrlAnchor(BROKEN_PRODUCTION_RECOVERY)).toBe(false);

    const issues = lintAuthEmailTemplateHtml(BROKEN_PRODUCTION_RECOVERY, {
      id: "recovery",
      requiresConfirmationUrl: true,
    });
    const codes = issues.map((issue) => issue.code);
    expect(codes).toContain("missing_confirmation_url_anchor");
    expect(codes).toContain("missing_raw_url_fallback");
  });

  it("accepts an anchor plus a raw URL fallback", () => {
    const html = `<p>Follow this link to reset:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
<p>{{ .ConfirmationURL }}</p>`;
    expect(
      lintAuthEmailTemplateHtml(html, {
        id: "recovery",
        requiresConfirmationUrl: true,
      })
    ).toEqual([]);
  });

  it("rejects wrong ConfirmationURL casing", () => {
    const html = `<p>Follow this link</p>
<p><a href="{{ .ConfirmationUrl }}">Reset</a></p>
<p>{{ .ConfirmationUrl }}</p>`;
    const codes = lintAuthEmailTemplateHtml(html, {
      id: "recovery",
      requiresConfirmationUrl: true,
    }).map((issue) => issue.code);
    expect(codes).toContain("wrong_confirmation_url_casing");
    expect(codes).toContain("missing_confirmation_url_anchor");
  });

  it("rejects query appended after ConfirmationURL", () => {
    const html = `<a href="{{ .ConfirmationURL }}&next=/admin">Reset</a>
<p>{{ .ConfirmationURL }}&next=/admin</p>`;
    const codes = lintAuthEmailTemplateHtml(html, {
      id: "recovery",
      requiresConfirmationUrl: true,
    }).map((issue) => issue.code);
    expect(codes).toContain("appended_to_confirmation_url");
  });

  it("does not treat href-only ConfirmationURL as a raw fallback", () => {
    const html = `<a href="{{ .ConfirmationURL }}">Reset Password</a>`;
    expect(hasRawConfirmationUrlFallback(html)).toBe(false);
  });
});

describe("checked-in Supabase Auth templates", () => {
  const manifest = loadAuthEmailManifest();

  it("manifest lists every required auth email type", () => {
    expect(fs.existsSync(AUTH_EMAIL_MANIFEST_PATH)).toBe(true);
    expect(manifest.projectRef).toBe("shijrazlzawjpobrpmnt");
    expect(manifest.templates.map((t) => t.id).sort()).toEqual(
      [
        "confirmation",
        "email_change",
        "invite",
        "magic_link",
        "reauthentication",
        "recovery",
      ].sort()
    );
  });

  it("every template file exists and config.toml points at it", () => {
    const config = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/config.toml"),
      "utf-8"
    );
    for (const spec of manifest.templates) {
      expect(fs.existsSync(path.join(AUTH_EMAIL_TEMPLATES_DIR, spec.file))).toBe(
        true
      );
      expect(config).toContain(`[auth.email.template.${spec.id}]`);
      expect(config).toContain(`./supabase/templates/${spec.file}`);
    }
  });

  it("every link-based template has <a href={{ .ConfirmationURL }}> and a raw URL line", () => {
    const results = lintAllAuthEmailTemplates(manifest);
    const failures = results
      .filter((row) => row.issues.length > 0)
      .map((row) => ({
        id: row.spec.id,
        issues: row.issues.map((issue) => issue.message),
      }));
    expect(failures).toEqual([]);
  });

  it("recovery keeps the Watch NORMA reset copy Dave already knows", () => {
    const recovery = manifest.templates.find((t) => t.id === "recovery");
    expect(recovery).toBeDefined();
    const html = readAuthEmailTemplateHtml(recovery!);
    expect(recovery!.subject).toBe("Reset Your Password");
    expect(html).toContain("Reset Password");
    expect(html).toMatch(/Follow this link to reset the password for your user/i);
    expect(html).toContain("Watch NORMA");
    expect(html).toContain(CONFIRMATION_URL_VAR);
    expect(hasConfirmationUrlAnchor(html)).toBe(true);
    expect(hasRawConfirmationUrlFallback(html)).toBe(true);
  });

  it("reauthentication is OTP-only (no fake follow-this-link CTA)", () => {
    const reauth = manifest.templates.find((t) => t.id === "reauthentication");
    expect(reauth).toBeDefined();
    const html = readAuthEmailTemplateHtml(reauth!);
    expect(reauth!.requiresConfirmationUrl).toBe(false);
    expect(html).toContain("{{ .Token }}");
    expect(html).not.toMatch(/follow this link/i);
    expect(html).toContain("Watch NORMA");
  });

  it("invite, magic link, confirm signup, and email change all say follow-this-link with an href", () => {
    const linkIds = ["invite", "magic_link", "confirmation", "email_change"] as const;
    for (const id of linkIds) {
      const spec = manifest.templates.find((t) => t.id === id);
      expect(spec).toBeDefined();
      const html = readAuthEmailTemplateHtml(spec!);
      expect(mentionsLinkCta(html)).toBe(true);
      expect(hasConfirmationUrlAnchor(html)).toBe(true);
      expect(hasRawConfirmationUrlFallback(html)).toBe(true);
    }
  });
});
