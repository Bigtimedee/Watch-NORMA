import { getApiKey } from "./auth.js";
import { internalError } from "./errors.js";

const DEFAULT_BASE_URL = "https://getnorma.app/api/ads";

export function getBaseUrl(): string {
  return process.env.NORMA_API_BASE_URL ?? DEFAULT_BASE_URL;
}

async function request<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const key = getApiKey();

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = "";
    try {
      const err = await res.json() as { error?: string };
      detail = err.error ?? res.statusText;
    } catch {
      detail = res.statusText;
    }
    if (res.status === 401 || res.status === 403) {
      throw internalError(`Authentication failed: ${detail}`);
    }
    throw internalError(`API error ${res.status}: ${detail}`);
  }

  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
};
