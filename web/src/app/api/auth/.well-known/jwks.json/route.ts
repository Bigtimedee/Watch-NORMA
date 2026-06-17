import { NextResponse } from "next/server";
import { getJwks } from "@/lib/oauth";

export async function GET() {
  try {
    const jwks = getJwks();
    return NextResponse.json(jwks, {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json({ error: "JWKS not configured" }, { status: 503 });
  }
}
