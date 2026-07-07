import { getReferralCode } from "../referral-utils";

jest.mock("expo-linking", () => ({
  parse: jest.fn((url: string) => {
    try {
      const urlObj = new URL(url);
      const params: Record<string, string | string[]> = {};
      urlObj.searchParams.forEach((v, k) => {
        const existing = params[k];
        if (existing === undefined) {
          params[k] = v;
        } else if (Array.isArray(existing)) {
          existing.push(v);
        } else {
          params[k] = [existing, v];
        }
      });
      return { queryParams: params };
    } catch {
      return { queryParams: {} };
    }
  }),
}));

describe("getReferralCode", () => {
  it("extracts ref from a norma-app.com join URL", () => {
    expect(getReferralCode("https://norma-app.com/join?ref=abc123")).toBe("abc123");
  });

  it("returns null for URLs without a ref param", () => {
    expect(getReferralCode("https://norma-app.com/join")).toBe(null);
  });

  it("returns null when ref param is empty string", () => {
    expect(getReferralCode("https://norma-app.com/join?ref=")).toBe(null);
  });

  it("returns the first value when ref is an array", () => {
    expect(getReferralCode("https://norma-app.com/join?ref=first&ref=second")).toBe("first");
  });

  it("returns null for a URL with no query string at all", () => {
    expect(getReferralCode("https://example.com/foo")).toBe(null);
  });

  it("handles deep link scheme format", () => {
    expect(getReferralCode("norma://join?ref=xyz789")).toBe("xyz789");
  });
});
