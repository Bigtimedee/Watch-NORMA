import { unauthorized } from "./errors.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

let cachedApiKey: string | null = null;

function getConfiguredKey(): string | null {
  if (cachedApiKey !== null) return cachedApiKey;
  cachedApiKey = process.env.NORMA_API_KEY ?? null;
  return cachedApiKey;
}

export function validateApiKey(headerValue?: string | null): void | never {
  const configured = getConfiguredKey();

  // If no key is configured server-side, reject all requests
  if (!configured) {
    throw unauthorized("Server is not configured with a NORMA_API_KEY");
  }

  // Accept key from Authorization: Bearer <key> header
  if (headerValue) {
    const token = headerValue.startsWith("Bearer ")
      ? headerValue.slice(7)
      : headerValue;
    if (token === configured) return;
    throw unauthorized();
  }

  // When called from stdio (no header context), env key presence is sufficient
  // The server process itself is authenticated via the env var
}

export function getApiKey(): string {
  const key = getConfiguredKey();
  if (!key) throw unauthorized("NORMA_API_KEY environment variable is not set");
  return key;
}
