import type { MetadataRoute } from "next";

// Web app manifest (served at /manifest.webmanifest). Icons live in public/.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NORMA: Sports Alerts",
    short_name: "NORMA",
    description: "NORMA tells you when to tune in: channels, kickoff times and alerts when your game gets good.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
