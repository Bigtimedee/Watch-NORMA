/**
 * Lint + load helpers for Supabase Auth email templates.
 *
 * Hosted GoTrue interpolates `{{ .ConfirmationURL }}` into the verify URL.
 * A bare-text CTA ("Reset Password" with no <a href>) is what Dave received
 * from production — Gmail then shows non-clickable text and no URL.
 *
 * Wrong casing (`{{ .ConfirmationUrl }}`) renders empty. Do not append
 * query/path after ConfirmationURL — Auth overwrites the query string.
 */

import * as fs from "fs";
import * as path from "path";

export const AUTH_EMAIL_TEMPLATES_DIR = path.resolve(
  __dirname,
  "../supabase/templates"
);

export const AUTH_EMAIL_MANIFEST_PATH = path.join(
  AUTH_EMAIL_TEMPLATES_DIR,
  "manifest.json"
);

export const CONFIRMATION_URL_VAR = "{{ .ConfirmationURL }}";
export const TOKEN_VAR = "{{ .Token }}";

/** CTA / body language that must never ship without a real HTML anchor. */
export const LINK_CTA_PATTERNS: RegExp[] = [
  /follow this link/i,
  /follow the link/i,
  /\breset\b/i,
  /\brecovery\b/i,
  /confirm (your |this )?(email|signup|sign up)/i,
  /accept (the |your )?invitation/i,
  /sign in/i,
  /magic link/i,
];

const ANCHOR_HREF_CONFIRMATION_URL =
  /<a\b[^>]*\bhref\s*=\s*(["'])\s*\{\{\s*\.ConfirmationURL\s*\}\}\s*\1[^>]*>/;

const WRONG_CONFIRMATION_URL_CASING = /\{\{\s*\.ConfirmationUrl\s*\}\}/;

const APPENDED_AFTER_CONFIRMATION_URL =
  /\{\{\s*\.ConfirmationURL\s*\}\}[^"'\s<]+/;

export type AuthEmailTemplateId =
  | "recovery"
  | "confirmation"
  | "invite"
  | "magic_link"
  | "email_change"
  | "reauthentication";

export interface AuthEmailTemplateSpec {
  id: AuthEmailTemplateId;
  label: string;
  subject: string;
  file: string;
  requiresConfirmationUrl: boolean;
  requiresToken?: boolean;
  mailerSubjectKey: string;
  mailerContentKey: string;
}

export interface AuthEmailManifest {
  description: string;
  projectRef: string;
  templates: AuthEmailTemplateSpec[];
}

export interface AuthEmailLintIssue {
  code:
    | "missing_confirmation_url_anchor"
    | "missing_raw_url_fallback"
    | "wrong_confirmation_url_casing"
    | "appended_to_confirmation_url"
    | "missing_token"
    | "link_language_without_anchor";
  message: string;
}

export function loadAuthEmailManifest(
  manifestPath = AUTH_EMAIL_MANIFEST_PATH
): AuthEmailManifest {
  return JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as AuthEmailManifest;
}

export function readAuthEmailTemplateHtml(
  spec: AuthEmailTemplateSpec,
  templatesDir = AUTH_EMAIL_TEMPLATES_DIR
): string {
  return fs.readFileSync(path.join(templatesDir, spec.file), "utf-8");
}

export function hasConfirmationUrlAnchor(html: string): boolean {
  return ANCHOR_HREF_CONFIRMATION_URL.test(html);
}

/**
 * Visible raw URL: ConfirmationURL appears as text, not only inside href="...".
 * Strip href attribute values first, then look for the variable.
 */
export function hasRawConfirmationUrlFallback(html: string): boolean {
  const withoutHrefValues = html.replace(
    /\bhref\s*=\s*(["'])[\s\S]*?\1/gi,
    "href"
  );
  return /\{\{\s*\.ConfirmationURL\s*\}\}/.test(withoutHrefValues);
}

export function mentionsLinkCta(html: string): boolean {
  return LINK_CTA_PATTERNS.some((pattern) => pattern.test(html));
}

export function lintAuthEmailTemplateHtml(
  html: string,
  spec: Pick<
    AuthEmailTemplateSpec,
    "id" | "requiresConfirmationUrl" | "requiresToken"
  >
): AuthEmailLintIssue[] {
  const issues: AuthEmailLintIssue[] = [];

  if (WRONG_CONFIRMATION_URL_CASING.test(html)) {
    issues.push({
      code: "wrong_confirmation_url_casing",
      message:
        "Use {{ .ConfirmationURL }} (capital URL). {{ .ConfirmationUrl }} renders empty.",
    });
  }

  if (APPENDED_AFTER_CONFIRMATION_URL.test(html)) {
    issues.push({
      code: "appended_to_confirmation_url",
      message:
        "Do not append path or query after {{ .ConfirmationURL }}; Auth overwrites the query string.",
    });
  }

  if (spec.requiresToken && !/\{\{\s*\.Token\s*\}\}/.test(html)) {
    issues.push({
      code: "missing_token",
      message: `${spec.id} must include {{ .Token }} (OTP, no recovery URL).`,
    });
  }

  const needsLink =
    spec.requiresConfirmationUrl || mentionsLinkCta(html);

  if (needsLink && !hasConfirmationUrlAnchor(html)) {
    issues.push({
      code: "missing_confirmation_url_anchor",
      message: `${spec.id} must contain <a href="{{ .ConfirmationURL }}"> so the CTA is a real hyperlink.`,
    });
  }

  if (spec.requiresConfirmationUrl && !hasRawConfirmationUrlFallback(html)) {
    issues.push({
      code: "missing_raw_url_fallback",
      message: `${spec.id} must also print {{ .ConfirmationURL }} as visible text for clients that strip HTML.`,
    });
  }

  if (
    !spec.requiresConfirmationUrl &&
    mentionsLinkCta(html) &&
    !hasConfirmationUrlAnchor(html)
  ) {
    issues.push({
      code: "link_language_without_anchor",
      message: `${spec.id} says to follow a link / reset but has no <a href="{{ .ConfirmationURL }}">.`,
    });
  }

  return issues;
}

export function lintAllAuthEmailTemplates(
  manifest = loadAuthEmailManifest(),
  templatesDir = AUTH_EMAIL_TEMPLATES_DIR
): Array<{ spec: AuthEmailTemplateSpec; html: string; issues: AuthEmailLintIssue[] }> {
  return manifest.templates.map((spec) => {
    const html = readAuthEmailTemplateHtml(spec, templatesDir);
    return {
      spec,
      html,
      issues: lintAuthEmailTemplateHtml(html, spec),
    };
  });
}
