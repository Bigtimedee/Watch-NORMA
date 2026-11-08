"use client";
// First-party page-view analytics. Sends one anonymous `page_view` event per
// route change to /api/web-events (stored in public.web_events). Sends the path
// only (never the query string or hash, which can carry auth codes) and the
// referrer's host. No cookies, no user id, no third-party script.
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function pageViewPayload(path: string, referrer: string): string {
  let referrerHost = "";
  try {
    referrerHost = referrer ? new URL(referrer).host : "";
  } catch {
    referrerHost = "";
  }
  return JSON.stringify({
    event_name: "page_view",
    properties: { path: path.slice(0, 200), referrer_host: referrerHost },
  });
}

export function PageViewTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || navigator.webdriver) return;
    const body = pageViewPayload(pathname, document.referrer);
    try {
      if (navigator.sendBeacon) navigator.sendBeacon("/api/web-events", new Blob([body], { type: "application/json" }));
      else void fetch("/api/web-events", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
    } catch {
      /* analytics must never break the page */
    }
  }, [pathname]);
  return null;
}
