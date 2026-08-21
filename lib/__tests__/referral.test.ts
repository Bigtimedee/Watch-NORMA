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
  it("extracts ref from a getnorma.app invite URL", () => {
    expect(getReferralCode("https://getnorma.app?ref=abc123")).toBe("abc123");
  });

  it("returns null for URLs without a ref param", () => {
    expect(getReferralCode("https://getnorma.app")).toBe(null);
  });

  it("returns null when ref param is empty string", () => {
    expect(getReferralCode("https://getnorma.app?ref=")).toBe(null);
  });

  it("returns the first value when ref is an array", () => {
    expect(getReferralCode("https://getnorma.app?ref=first&ref=second")).toBe("first");
  });

  it("returns null for a URL with no query string at all", () => {
    expect(getReferralCode("https://example.com/foo")).toBe(null);
  });

  it("handles deep link scheme format", () => {
    expect(getReferralCode("norma://join?ref=xyz789")).toBe("xyz789");
  });
});
