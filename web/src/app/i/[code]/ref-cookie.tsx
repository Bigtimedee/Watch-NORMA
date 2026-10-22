"use client";
import { useEffect } from "react";

export function RefCookie({ code }: { code: string }) {
  useEffect(() => {
    document.cookie = `norma_ref=${encodeURIComponent(code)}; Max-Age=2592000; Path=/; SameSite=Lax; Secure`;
  }, [code]);
  return null;
}
