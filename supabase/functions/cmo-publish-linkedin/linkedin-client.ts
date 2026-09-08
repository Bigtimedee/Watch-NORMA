// =============================================================================
// LinkedIn organization (company page) publisher
//
// Uses the versioned Posts API (REST) as an organization author — never a
// member/person URN. Images go through the Images API initializeUpload + PUT.
//
// Docs:
//   POST https://api.linkedin.com/rest/posts
//   POST https://api.linkedin.com/rest/images?action=initializeUpload
// Required product/scope: Community Management API, w_organization_social
// =============================================================================

import { toOrganizationUrn } from "./logic.ts";

export const LINKEDIN_API_BASE = "https://api.linkedin.com/rest";
export const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const DEFAULT_LINKEDIN_API_VERSION = "202506";

export interface LinkedInConfig {
  accessToken: string;
  organizationUrn: string;
  apiVersion: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}

export type EnvMap = Record<string, string | undefined>;

export type LoadConfigResult =
  | { ok: true; config: LinkedInConfig }
  | { ok: false; missing: string[] };

/**
 * Read LinkedIn secrets from an env map (Deno.env or a test stub).
 * Required: LINKEDIN_ACCESS_TOKEN, LINKEDIN_ORGANIZATION_ID
 * Optional: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REFRESH_TOKEN,
 *           LINKEDIN_API_VERSION
 */
export function loadLinkedInConfig(env: EnvMap): LoadConfigResult {
  const missing: string[] = [];
  const accessToken = env.LINKEDIN_ACCESS_TOKEN?.trim();
  const orgRaw = env.LINKEDIN_ORGANIZATION_ID?.trim();
  if (!accessToken) missing.push("LINKEDIN_ACCESS_TOKEN");
  if (!orgRaw) missing.push("LINKEDIN_ORGANIZATION_ID");
  if (missing.length > 0) return { ok: false, missing };

  let organizationUrn: string;
  try {
    organizationUrn = toOrganizationUrn(orgRaw!);
  } catch (err) {
    return {
      ok: false,
      missing: [err instanceof Error ? err.message : String(err)],
    };
  }

  const clientId = env.LINKEDIN_CLIENT_ID?.trim() || undefined;
  const clientSecret = env.LINKEDIN_CLIENT_SECRET?.trim() || undefined;
  const refreshToken = env.LINKEDIN_REFRESH_TOKEN?.trim() || undefined;

  return {
    ok: true,
    config: {
      accessToken: accessToken!,
      organizationUrn,
      apiVersion: env.LINKEDIN_API_VERSION?.trim() || DEFAULT_LINKEDIN_API_VERSION,
      clientId,
      clientSecret,
      refreshToken,
    },
  };
}

export function restHeaders(config: LinkedInConfig, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${config.accessToken}`,
    "Linkedin-Version": config.apiVersion,
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
    "User-Agent": "NORMA-CMO-Bot/1.0",
    ...extra,
  };
}

/**
 * Organization UGC / Posts API body. Author is always the company URN.
 */
export function buildOrganizationPostPayload(opts: {
  organizationUrn: string;
  commentary: string;
  imageUrn?: string;
}): Record<string, unknown> {
  if (!opts.organizationUrn.toLowerCase().startsWith("urn:li:organization:")) {
    throw new Error("LinkedIn author must be an organization URN, not a person/member URN");
  }

  const payload: Record<string, unknown> = {
    author: opts.organizationUrn,
    commentary: opts.commentary,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  if (opts.imageUrn) {
    payload.content = {
      media: { id: opts.imageUrn },
    };
  }

  return payload;
}

function restliId(response: Response, bodyText: string): string {
  const headerId =
    response.headers.get("x-restli-id") ??
    response.headers.get("X-RestLi-Id") ??
    response.headers.get("x-linkedin-id");
  if (headerId && headerId.trim()) return headerId.trim();

  try {
    const parsed = JSON.parse(bodyText) as { id?: string };
    if (parsed.id && typeof parsed.id === "string") return parsed.id;
  } catch {
    // ignore
  }

  throw new Error(
    `LinkedIn Posts API succeeded but returned no post id (status ${response.status}): ${bodyText.slice(0, 200)}`,
  );
}

async function parseErrorBody(status: number, bodyText: string): Promise<string> {
  try {
    const parsed = JSON.parse(bodyText) as {
      message?: string;
      error?: string;
      error_description?: string;
    };
    const msg = parsed.message ?? parsed.error_description ?? parsed.error;
    if (msg) return `LinkedIn API error ${status}: ${msg}`;
  } catch {
    // ignore
  }
  return `LinkedIn API error ${status}: ${bodyText.slice(0, 300)}`;
}

export interface FetchLike {
  (input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

export async function refreshAccessToken(
  config: LinkedInConfig,
  fetchImpl: FetchLike,
): Promise<string> {
  if (!config.refreshToken || !config.clientId || !config.clientSecret) {
    throw new Error(
      "LinkedIn access token rejected and refresh is not configured (set LINKEDIN_REFRESH_TOKEN, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET)",
    );
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetchImpl(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(await parseErrorBody(response.status, text));
  }

  let parsed: { access_token?: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("LinkedIn token refresh returned non-JSON");
  }
  if (!parsed.access_token) {
    throw new Error("LinkedIn token refresh succeeded but returned no access_token");
  }
  return parsed.access_token;
}

interface InitializeUploadResponse {
  value?: {
    uploadUrl?: string;
    image?: string;
  };
}

async function uploadImage(
  config: LinkedInConfig,
  imageUrl: string,
  fetchImpl: FetchLike,
): Promise<string | null> {
  const imageResponse = await fetchImpl(imageUrl);
  if (!imageResponse.ok) {
    console.warn(
      `[cmo-publish-linkedin] Failed to fetch image (status ${imageResponse.status}): ${imageUrl}`,
    );
    return null;
  }

  const contentType = (imageResponse.headers.get("content-type") ?? "image/jpeg")
    .split(";")[0]
    .trim();
  const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
  if (imageBytes.byteLength === 0) {
    console.warn("[cmo-publish-linkedin] Image fetch returned empty body; posting text-only");
    return null;
  }

  const initResponse = await fetchImpl(
    `${LINKEDIN_API_BASE}/images?action=initializeUpload`,
    {
      method: "POST",
      headers: restHeaders(config),
      body: JSON.stringify({
        initializeUploadRequest: { owner: config.organizationUrn },
      }),
    },
  );
  const initText = await initResponse.text();
  if (!initResponse.ok) {
    console.warn(
      `[cmo-publish-linkedin] Image initializeUpload failed: ${await parseErrorBody(initResponse.status, initText)}`,
    );
    return null;
  }

  let initData: InitializeUploadResponse;
  try {
    initData = JSON.parse(initText);
  } catch {
    console.warn("[cmo-publish-linkedin] Image initializeUpload returned non-JSON");
    return null;
  }

  const uploadUrl = initData.value?.uploadUrl;
  const imageUrn = initData.value?.image;
  if (!uploadUrl || !imageUrn) {
    console.warn("[cmo-publish-linkedin] Image initializeUpload missing uploadUrl or image URN");
    return null;
  }

  const putResponse = await fetchImpl(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": contentType,
    },
    body: imageBytes,
  });
  if (!putResponse.ok) {
    const putText = await putResponse.text();
    console.warn(
      `[cmo-publish-linkedin] Image binary upload failed (status ${putResponse.status}): ${putText.slice(0, 200)}`,
    );
    return null;
  }

  return imageUrn;
}

async function createPost(
  config: LinkedInConfig,
  commentary: string,
  imageUrn: string | undefined,
  fetchImpl: FetchLike,
): Promise<{ postId: string; status: number; bodyText: string }> {
  const payload = buildOrganizationPostPayload({
    organizationUrn: config.organizationUrn,
    commentary,
    imageUrn,
  });

  const response = await fetchImpl(`${LINKEDIN_API_BASE}/posts`, {
    method: "POST",
    headers: restHeaders(config),
    body: JSON.stringify(payload),
  });
  const bodyText = await response.text();
  return { postId: response.ok ? restliId(response, bodyText) : "", status: response.status, bodyText };
}

/**
 * Publish a text (and optional image) post as the NORMA company page.
 * Image failures degrade to text-only, matching cmo-publish's Twitter media path.
 */
export async function publishOrganizationPost(
  config: LinkedInConfig,
  input: { commentary: string; imageUrl?: string },
  fetchImpl: FetchLike = fetch,
): Promise<{ postId: string }> {
  const working: LinkedInConfig = { ...config };

  let imageUrn: string | undefined;
  if (input.imageUrl) {
    try {
      imageUrn = (await uploadImage(working, input.imageUrl, fetchImpl)) ?? undefined;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[cmo-publish-linkedin] Image upload threw; posting text-only: ${message}`);
    }
  }

  let result = await createPost(working, input.commentary, imageUrn, fetchImpl);

  if (result.status === 401) {
    const newToken = await refreshAccessToken(working, fetchImpl);
    working.accessToken = newToken;
    result = await createPost(working, input.commentary, imageUrn, fetchImpl);
  }

  if (result.status < 200 || result.status >= 300) {
    throw new Error(await parseErrorBody(result.status, result.bodyText));
  }

  if (!result.postId) {
    throw new Error("LinkedIn Posts API returned no platform post id");
  }

  return { postId: result.postId };
}
