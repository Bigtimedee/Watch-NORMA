import * as fs from "fs";
import * as path from "path";
import {
  EXPIRED_RESET_COPY,
  FORBIDDEN_SITE_URLS,
  MOBILE_RECOVERY_REDIRECTS,
  PRODUCTION_SITE_URL,
  REQUIRED_WEB_RECOVERY_REDIRECTS,
  WEB_RECOVERY_PATH,
  getWebRecoveryRedirectTo,
  isExpiredRecoveryError,
  isForbiddenSiteUrl,
  parseRecoveryParams,
  postResetDestination,
  rewriteAuthDumpToResetPath,
  shouldRouteToResetPassword,
} from "../auth-recovery-landing";

const INCIDENT_HOME =
  "https://getnorma.app/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired#access_token=stale";

describe("admin recovery landing helpers", () => {
  it("classifies the 2026-09-19 marketing-home dump as an expired recovery", () => {
    const params = parseRecoveryParams(INCIDENT_HOME);
    expect(params.error).toBe("access_denied");
    expect(params.errorCode).toBe("otp_expired");
    expect(isExpiredRecoveryError(params)).toBe(true);
    expect(shouldRouteToResetPassword(INCIDENT_HOME, "/")).toBe(true);
  });

  it("rewrites marketing / dumps onto /auth/reset-password and keeps query+hash", () => {
    const next = rewriteAuthDumpToResetPath(INCIDENT_HOME);
    expect(next.startsWith("https://getnorma.app/auth/reset-password?")).toBe(
      true
    );
    expect(next).toContain("error_code=otp_expired");
    expect(next).toContain("#access_token=stale");
    expect(next).not.toMatch(/^https:\/\/getnorma\.app\/\?/);
  });

  it("routes long PKCE codes on marketing / but ignores short UTM codes", () => {
    const pkce =
      "https://getnorma.app/?code=abcdefghijklmnopqrstuvwxyz012345";
    expect(shouldRouteToResetPassword(pkce, "/")).toBe(true);
    expect(
      shouldRouteToResetPassword("https://getnorma.app/?code=SAVE20", "/")
    ).toBe(false);
  });

  it("does not hijack the set-password page itself", () => {
    expect(
      shouldRouteToResetPassword(
        "https://getnorma.app/auth/reset-password?error_code=otp_expired",
        WEB_RECOVERY_PATH
      )
    ).toBe(false);
  });

  it("builds same-origin redirectTo without a query string", () => {
    expect(getWebRecoveryRedirectTo("https://www.getnorma.app")).toBe(
      "https://www.getnorma.app/auth/reset-password"
    );
    expect(getWebRecoveryRedirectTo("https://getnorma.app/")).toBe(
      "https://getnorma.app/auth/reset-password"
    );
    expect(getWebRecoveryRedirectTo("https://www.getnorma.app")).not.toContain(
      "?"
    );
  });

  it("forbids bare marketing site_url values", () => {
    for (const url of FORBIDDEN_SITE_URLS) {
      expect(isForbiddenSiteUrl(url)).toBe(true);
    }
    expect(isForbiddenSiteUrl(PRODUCTION_SITE_URL)).toBe(false);
    expect(PRODUCTION_SITE_URL).toBe(
      "https://getnorma.app/auth/reset-password"
    );
  });

  it("sends admins to /admin after a successful reset", () => {
    expect(postResetDestination(true)).toBe("/admin");
    expect(postResetDestination(false)).toBe("/dashboard");
  });

  it("uses the required expired-link copy", () => {
    expect(EXPIRED_RESET_COPY).toMatch(/expired or was already used/i);
    expect(EXPIRED_RESET_COPY).toMatch(/request a new one/i);
  });
});

describe("hosted Auth redirect config (never marketing /)", () => {
  const configPath = path.resolve(
    __dirname,
    "../../supabase/auth-redirects.json"
  );
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
    projectRef: string;
    site_url: string;
    uri_allow_list: string[];
  };

  it("points production site_url at the set-password page", () => {
    expect(config.projectRef).toBe("shijrazlzawjpobrpmnt");
    expect(config.site_url).toBe(PRODUCTION_SITE_URL);
    expect(isForbiddenSiteUrl(config.site_url)).toBe(false);
    expect(config.site_url).not.toBe("https://getnorma.app");
    expect(config.site_url).not.toBe("https://www.getnorma.app");
  });

  it("allowlists mobile recovery and both apex/www reset paths", () => {
    for (const url of MOBILE_RECOVERY_REDIRECTS) {
      expect(config.uri_allow_list).toContain(url);
    }
    for (const url of REQUIRED_WEB_RECOVERY_REDIRECTS) {
      expect(config.uri_allow_list).toContain(url);
    }
  });
});

describe("web recovery sources never target marketing /", () => {
  const repoRoot = path.resolve(__dirname, "../..");
  const read = (rel: string) =>
    fs.readFileSync(path.join(repoRoot, rel), "utf-8");

  it("forgot-password uses getWebRecoveryRedirectTo, not /auth/callback?next=", () => {
    const src = read("web/src/app/auth/forgot-password/page.tsx");
    expect(src).toContain("getWebRecoveryRedirectTo");
    expect(src).not.toContain("/auth/callback?next=");
    expect(src).toContain("never");
  });

  it("root layout mounts the marketing-home recovery guard", () => {
    const src = read("web/src/app/layout.tsx");
    expect(src).toContain("AuthRecoveryLandingGuard");
  });

  it("reset-password shows expired UX and links back to forgot-password", () => {
    const src = read("web/src/app/auth/reset-password/page.tsx");
    expect(src).toContain("EXPIRED_RESET_COPY");
    expect(src).toContain("WEB_FORGOT_PASSWORD_PATH");
    expect(src).toContain("exchangeCodeForSession");
    expect(src).toContain("postResetDestination");
  });

  it("auth callback routes errors to /auth/reset-password, not login or /", () => {
    const src = read("web/src/app/auth/callback/route.ts");
    expect(src).toContain("WEB_RECOVERY_PATH");
    expect(src).not.toContain("/auth/login?error=auth_failed");
  });

  it("Next.js and Vercel send /?error to /auth/reset-password (not a 301)", () => {
    const nextSrc = read("web/next.config.ts");
    expect(nextSrc).toContain('source: "/"');
    expect(nextSrc).toContain('destination: "/auth/reset-password"');
    expect(nextSrc).toContain('key: "error"');
    expect(nextSrc).toContain('key: "error_code"');
    expect(nextSrc).toContain("permanent: false");

    const vercel = JSON.parse(read("web/vercel.json")) as {
      redirects: Array<{
        source: string;
        destination: string;
        statusCode: number;
        has?: Array<{ key: string }>;
      }>;
    };
    const keys = vercel.redirects
      .filter((r) => r.source === "/" && r.destination === "/auth/reset-password")
      .flatMap((r) => (r.has ?? []).map((h) => h.key));
    expect(keys).toEqual(expect.arrayContaining(["error", "error_code"]));
    expect(
      vercel.redirects.some(
        (r) =>
          r.source === "/" &&
          r.destination === "/auth/reset-password" &&
          r.statusCode === 301
      )
    ).toBe(false);
  });

  it("apply-auth-redirects script refuses a homepage site_url", () => {
    const src = read("scripts/apply-auth-redirects.mjs");
    expect(src).toContain("site_url");
    expect(src).toContain("uri_allow_list");
    expect(src).toContain("https://getnorma.app/auth/reset-password");
    expect(src).toContain("norma://auth-callback");
    expect(src).toMatch(/must not be the marketing homepage/);
  });

  it("local config.toml documents that hosted site_url must not be marketing /", () => {
    const src = read("supabase/config.toml");
    expect(src).toContain("norma://auth-callback");
    expect(src).toContain("https://getnorma.app/auth/reset-password");
    expect(src).toContain("never marketing");
  });
});
