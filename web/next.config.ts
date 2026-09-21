import type { NextConfig } from "next";

const adAgentHeaders = [
  { key: "Content-Type", value: "application/json" },
  { key: "Access-Control-Allow-Origin", value: "*" },
  { key: "Cache-Control", value: "public, max-age=3600" },
];

const openApiHeaders = [
  { key: "Content-Type", value: "application/json" },
  { key: "Access-Control-Allow-Origin", value: "*" },
  { key: "Cache-Control", value: "public, max-age=300" },
];

const nextConfig: NextConfig = {
  // Configured for Supabase SSR
  async headers() {
    return [
      { source: "/adagents.json", headers: adAgentHeaders },
      { source: "/.well-known/adagents.json", headers: adAgentHeaders },
      { source: "/.well-known/openapi.json", headers: openApiHeaders },
      { source: "/sellers.json", headers: openApiHeaders },
      { source: "/aamp-seller-profile.json", headers: openApiHeaders },
    ];
  },
  async redirects() {
    return [
      // Public marketing CTA getnorma.app/advertise must keep working.
      // Portal page stays at /advertisers; do not rename that route.
      // permanent: true is a 308 in Next.js (method-preserving 301 equivalent).
      { source: "/advertise", destination: "/advertisers", permanent: true },
      { source: "/advertise/", destination: "/advertisers", permanent: true },
      // HARD RULE: GoTrue error/PKCE dumps on marketing `/` must reach the
      // set-password page. Do not 301 — auth query strings must not be cached.
      {
        source: "/",
        has: [{ type: "query", key: "error" }],
        destination: "/auth/reset-password",
        permanent: false,
      },
      {
        source: "/",
        has: [{ type: "query", key: "error_code" }],
        destination: "/auth/reset-password",
        permanent: false,
      },
      { source: "/api-docs", destination: "/api-docs/index.html", permanent: false },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/terms-of-service",
        destination:
          "https://d10dave.github.io/norma/terms-of-service.html",
      },
      {
        source: "/privacy-policy",
        destination:
          "https://d10dave.github.io/norma/privacy-policy.html",
      },
    ];
  },
};

export default nextConfig;
