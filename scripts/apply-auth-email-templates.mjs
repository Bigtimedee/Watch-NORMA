#!/usr/bin/env node
/**
 * Apply supabase/templates/*.html to a hosted Supabase project's Auth mailer.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=shijrazlzawjpobrpmnt \
 *     node scripts/apply-auth-email-templates.mjs
 *
 * Only PATCHes mailer subject/content fields. Does not touch site_url,
 * redirect allowlist, SMTP, or providers.
 *
 * Docs: docs/operations/auth-email-templates.md
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(ROOT, "supabase/templates/manifest.json");
const TEMPLATES_DIR = join(ROOT, "supabase/templates");
const DEFAULT_PROJECT_REF = "shijrazlzawjpobrpmnt";

const ANCHOR_HREF_CONFIRMATION_URL =
  /<a\b[^>]*\bhref\s*=\s*(["'])\s*\{\{\s*\.ConfirmationURL\s*\}\}\s*\1[^>]*>/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function lintHtml(spec, html) {
  const issues = [];
  if (spec.requiresConfirmationUrl) {
    if (!ANCHOR_HREF_CONFIRMATION_URL.test(html)) {
      issues.push(`${spec.id}: missing <a href="{{ .ConfirmationURL }}">`);
    }
    const withoutHref = html.replace(/\bhref\s*=\s*(["'])[\s\S]*?\1/gi, "href");
    if (!/\{\{\s*\.ConfirmationURL\s*\}\}/.test(withoutHref)) {
      issues.push(`${spec.id}: missing raw {{ .ConfirmationURL }} fallback`);
    }
  }
  if (spec.requiresToken && !/\{\{\s*\.Token\s*\}\}/.test(html)) {
    issues.push(`${spec.id}: missing {{ .Token }}`);
  }
  return issues;
}

async function managementRequest(method, projectRef, token, body) {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: token,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    fail(
      `${method} ${url} failed (${res.status}): ${typeof json === "object" ? JSON.stringify(json) : text}`
    );
  }
  return json;
}

function summarizeTemplate(value) {
  if (typeof value !== "string") return "(missing)";
  const collapsed = value.replace(/\s+/g, " ").trim();
  const preview = collapsed.slice(0, 160);
  const hasAnchor = ANCHOR_HREF_CONFIRMATION_URL.test(value);
  return `${hasAnchor ? "has <a href>" : "NO <a href>"} · ${preview}${collapsed.length > 160 ? "…" : ""}`;
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef =
    process.env.SUPABASE_PROJECT_REF || DEFAULT_PROJECT_REF;
  const dryRun = process.argv.includes("--dry-run");

  if (!token) {
    fail(
      "SUPABASE_ACCESS_TOKEN is required (Supabase personal access token with project write)."
    );
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
  const payload = {};
  const lintIssues = [];

  for (const spec of manifest.templates) {
    const html = readFileSync(join(TEMPLATES_DIR, spec.file), "utf-8");
    lintIssues.push(...lintHtml(spec, html));
    payload[spec.mailerSubjectKey] = spec.subject;
    payload[spec.mailerContentKey] = html;
  }

  if (lintIssues.length) {
    fail(`Template lint failed:\n- ${lintIssues.join("\n- ")}`);
  }

  console.log(`Project: ${projectRef}`);
  console.log(`Templates: ${manifest.templates.map((t) => t.id).join(", ")}`);

  const current = await managementRequest("GET", projectRef, token);
  console.log("\nBefore:");
  for (const spec of manifest.templates) {
    console.log(
      `  ${spec.id}: ${summarizeTemplate(current[spec.mailerContentKey])}`
    );
  }

  if (dryRun) {
    console.log("\n--dry-run: not PATCHing.");
    process.exit(0);
  }

  const updated = await managementRequest("PATCH", projectRef, token, payload);

  console.log("\nAfter:");
  const verifyIssues = [];
  for (const spec of manifest.templates) {
    const content = updated[spec.mailerContentKey];
    console.log(`  ${spec.id}: ${summarizeTemplate(content)}`);
    if (spec.requiresConfirmationUrl && !ANCHOR_HREF_CONFIRMATION_URL.test(content ?? "")) {
      verifyIssues.push(`${spec.id} still missing <a href="{{ .ConfirmationURL }}"> on the live project`);
    }
    if (updated[spec.mailerSubjectKey] !== spec.subject) {
      verifyIssues.push(
        `${spec.id} subject mismatch: live=${JSON.stringify(updated[spec.mailerSubjectKey])}`
      );
    }
  }

  if (verifyIssues.length) {
    fail(`Apply verification failed:\n- ${verifyIssues.join("\n- ")}`);
  }

  console.log("\nAuth email templates applied.");
}

main().catch((err) => {
  fail(err instanceof Error ? err.stack || err.message : String(err));
});
