import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Configured for Supabase SSR
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
