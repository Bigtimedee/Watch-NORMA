import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

let spec: Record<string, unknown> | null = null;

function getSpec(): Record<string, unknown> {
  if (!spec) {
    const yamlPath = join(process.cwd(), "..", "docs", "openapi", "norma-ads-api.yaml");
    try {
      const content = readFileSync(yamlPath, "utf8");
      // Use Node's built-in JSON fallback: the static JSON copy is served directly
      // This route reads the pre-converted JSON copy from public/.well-known/
      const jsonPath = join(process.cwd(), "public", ".well-known", "openapi.json");
      spec = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown>;
      void content;
    } catch {
      const jsonPath = join(process.cwd(), "public", ".well-known", "openapi.json");
      spec = JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, unknown>;
    }
  }
  return spec;
}

export async function GET() {
  const openApiSpec = getSpec();
  return NextResponse.json(openApiSpec, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
    },
  });
}
