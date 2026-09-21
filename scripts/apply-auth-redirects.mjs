#!/usr/bin/env node
/**
 * Apply supabase/auth-redirects.json to a hosted Supabase project's Auth config.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=shijrazlzawjpobrpmnt \
 *     node scripts/apply-auth-redirects.mjs
 *
 * Only PATCHes site_url and uri_allow_list. Does not touch mailer templates,
 * SMTP, or providers.
 *
 * HARD RULE: site_url must never be the marketing homepage (`https://getnorma.app`
 * or `https://www.getnorma.app`). Recovery must land on /auth/reset-password.
 * Mobile `norma://auth-callback` must remain allowlisted.
 *
 * Docs: docs/operations/auth-redirects.md
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = join(ROOT, "supabase/auth-redirects.json");
const DEFAULT_PROJECT_REF = "shijrazlzawjpobrpmnt";

const FORBIDDEN_SITE_URLS = new Set([
  "https://getnorma.app",
  "https://getnorma.app/",
  "https://www.getnorma.app",
  "https://www.getnorma.app/",
]);

const REQUIRED_ALLOWLIST = [
  "norma://auth-callback",
  "https://getnorma.app/auth/reset-password",
  "https://www.getnorma.app/auth/reset-password",
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function normalizeSiteUrl(value) {
  return String(value || "").trim();
}

function parseAllowList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function formatAllowList(urls) {
  return urls.join(",");
}

function lintRedirects(config) {
  const issues = [];
  const siteUrl = normalizeSiteUrl(config.site_url);
  if (!siteUrl) issues.push("site_url is empty");
  if (FORBIDDEN_SITE_URLS.has(siteUrl) || FORBIDDEN_SITE_URLS.has(`${siteUrl}/`)) {
    issues.push(
      `site_url must not be the marketing homepage (got ${JSON.stringify(siteUrl)})`
    );
  }
  if (!/\/auth\/reset-password\/?$/.test(siteUrl)) {
    issues.push(
      `site_url must be the set-password page /auth/reset-password (got ${JSON.stringify(siteUrl)})`
    );
  }
  const allow = parseAllowList(config.uri_allow_list);
  for (const required of REQUIRED_ALLOWLIST) {
    if (!allow.includes(required)) {
      issues.push(`uri_allow_list missing ${required}`);
    }
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
    json = { raw: text };
    json = JSON.parse(text);
  } catch {
    // keep raw
  }
  if (!res.ok) {
    fail(
      `${method} ${url} failed (${res.status}): ${typeof json === "object" ? JSON.stringify(json) : text}`
    );
  }
  return json;
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF || DEFAULT_PROJECT_REF;
  const dryRun = process.argv.includes("--dry-run");

  if (!token) {
    fail(
      "SUPABASE_ACCESS_TOKEN is required (Supabase personal access token with project write)."
    );
  }

  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  const lintIssues = lintRedirects(config);
  if (lintIssues.length) {
    fail(`Auth redirect lint failed:\n- ${lintIssues.join("\n- ")}`);
  }

  const siteUrl = normalizeSiteUrl(config.site_url);
  const uriAllowList = formatAllowList(parseAllowList(config.uri_allow_list));

  console.log(`Project: ${projectRef}`);
  console.log(`site_url (desired): ${siteUrl}`);
  console.log(`uri_allow_list entries: ${parseAllowList(config.uri_allow_list).length}`);

  const current = await managementRequest("GET", projectRef, token);
  console.log("\nBefore:");
  console.log(`  site_url: ${current.site_url ?? "(missing)"}`);
  console.log(
    `  uri_allow_list: ${typeof current.uri_allow_list === "string" ? current.uri_allow_list : JSON.stringify(current.uri_allow_list)}`
  );

  if (dryRun) {
    console.log("\n--dry-run: not PATCHing.");
    process.exit(0);
  }

  const payload = {
    site_url: siteUrl,
    uri_allow_list: uriAllowList,
  };

  const updated = await managementRequest("PATCH", projectRef, token, payload);

  console.log("\nAfter:");
  console.log(`  site_url: ${updated.site_url ?? "(missing)"}`);
  console.log(
    `  uri_allow_list: ${typeof updated.uri_allow_list === "string" ? updated.uri_allow_list : JSON.stringify(updated.uri_allow_list)}`
  );

  const verifyIssues = lintRedirects({
    site_url: updated.site_url,
    uri_allow_list: updated.uri_allow_list,
  });
  if (updated.site_url !== siteUrl) {
    verifyIssues.push(
      `live site_url mismatch: ${JSON.stringify(updated.site_url)}`
    );
  }
  const liveAllow = parseAllowList(updated.uri_allow_list);
  for (const required of REQUIRED_ALLOWLIST) {
    if (!liveAllow.includes(required)) {
      verifyIssues.push(`live uri_allow_list missing ${required}`);
    }
  }

  if (verifyIssues.length) {
    fail(`Apply verification failed:\n- ${verifyIssues.join("\n- ")}`);
  }

  console.log("\nAuth redirects applied.");
}

main().catch((err) => {
  fail(err instanceof Error ? err.stack || err.message : String(err));
});
