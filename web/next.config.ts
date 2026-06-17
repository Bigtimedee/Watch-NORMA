import type { NextConfig } from "next";

const adAgentHeaders = [
  { key: "Content-Type", value: "application/json" },
  { key: "Access-Control-Allow-Origin", value: "*" },
  { key: "Cache-Control", value: "public, max-age=3600" },
];

const nextConfig: NextConfig = {
  // Configured for Supabase SSR
  async headers() {
    return [
      { source: "/adagents.json", headers: adAgentHeaders },
      { source: "/.well-known/adagents.json", headers: adAgentHeaders },
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
