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
