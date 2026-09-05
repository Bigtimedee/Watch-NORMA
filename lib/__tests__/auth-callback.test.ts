import {
  AUTH_CALLBACK_PATH,
  getAuthCallbackUrl,
  isAuthCallbackUrl,
  parseAuthCallbackUrl,
} from "../auth-callback";
import { APP_SCHEME } from "../constants";

describe("getAuthCallbackUrl", () => {
  it("uses the existing norma://auth-callback app scheme", () => {
    expect(getAuthCallbackUrl()).toBe("norma://auth-callback");
    expect(getAuthCallbackUrl()).toBe(`${APP_SCHEME}://${AUTH_CALLBACK_PATH}`);
  });
});

describe("isAuthCallbackUrl", () => {
  it("accepts the production custom-scheme callback", () => {
    expect(isAuthCallbackUrl("norma://auth-callback")).toBe(true);
    expect(
      isAuthCallbackUrl("norma://auth-callback#access_token=x&type=recovery")
    ).toBe(true);
  });

  it("rejects unrelated deep links", () => {
    expect(isAuthCallbackUrl("norma://games/abc")).toBe(false);
    expect(isAuthCallbackUrl("https://getnorma.app")).toBe(false);
  });
});

describe("parseAuthCallbackUrl", () => {
  it("reads implicit recovery tokens from the hash", () => {
    const parsed = parseAuthCallbackUrl(
      "norma://auth-callback#access_token=tok&refresh_token=ref&type=recovery"
    );
    expect(parsed.accessToken).toBe("tok");
    expect(parsed.refreshToken).toBe("ref");
    expect(parsed.type).toBe("recovery");
    expect(parsed.code).toBeNull();
  });

  it("reads a PKCE code from the query string", () => {
    const parsed = parseAuthCallbackUrl("norma://auth-callback?code=abc123");
    expect(parsed.code).toBe("abc123");
  });

  it("prefers hash params when both query and hash are present", () => {
    const parsed = parseAuthCallbackUrl(
      "norma://auth-callback?type=magiclink#access_token=h&refresh_token=r&type=recovery"
    );
    expect(parsed.type).toBe("recovery");
    expect(parsed.accessToken).toBe("h");
  });
});
