import { utf8ByteLength, validateStreamUrl, STREAM_URL_MAX_UTF8_BYTES } from "../url-validation";
import { validationMessage } from "../copy";

const OK = "https://cdn.example.com/live/clock.m3u8?x=1&y=a%2Fb";

describe("validateStreamUrl", () => {
  it("accepts a public https hls address and preserves its bytes", () => {
    const result = validateStreamUrl(OK);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toBe(OK);
  });

  it("preserves an already percent-encoded non-ascii sequence", () => {
    const url = "https://cdn.example.com/live/%C3%A9.m3u8?x=1";
    const result = validateStreamUrl(url);
    expect(result).toEqual({ ok: true, url });
  });

  it("rejects raw non-ascii instead of rewriting it", () => {
    const result = validateStreamUrl("https://cdn.example.com/live/é.m3u8");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("ambiguous_normalization");
  });

  it("enforces a 2000-byte cap, not a character cap", () => {
    const base = "https://cdn.example.com/live/";
    const suffix = ".m3u8";
    const room = STREAM_URL_MAX_UTF8_BYTES - utf8ByteLength(base) - utf8ByteLength(suffix);
    const accepted = `${base}${"a".repeat(room)}${suffix}`;
    expect(utf8ByteLength(accepted)).toBe(STREAM_URL_MAX_UTF8_BYTES);
    expect(validateStreamUrl(accepted).ok).toBe(true);
    expect(validateStreamUrl(`${accepted}a`).ok).toBe(false);
    const wide = "é".repeat(1001);
    expect(utf8ByteLength(wide)).toBe(2002);
    const wideResult = validateStreamUrl(wide);
    expect(wideResult.ok).toBe(false);
    if (!wideResult.ok) expect(wideResult.reason).toBe("too_long");
  });

  it.each([
    ["", "empty"],
    ["javascript:alert(1)", "not_https"],
    ["data:text/html,hi", "not_https"],
    ["file:///tmp/a.m3u8", "not_https"],
    ["http://cdn.example.com/a.m3u8", "not_https"],
    ["strymtv://player/https://cdn.example.com/a.m3u8", "not_https"],
    ["https://user:secret@cdn.example.com/a.m3u8", "userinfo"],
    ["https://cdn.example.com/a.m3u8?token=abc", "credential_query"],
    ["https://cdn.example.com/a.m3u8?access_token=abc", "credential_query"],
    ["https://cdn.example.com/a.m3u8?api_key=abc", "credential_query"],
    ["https://cdn.example.com/a.m3u8?signature=abc", "credential_query"],
    ["https://cdn.example.com/password/a.m3u8", "credential_path"],
    ["https://cdn.example.com/a.m3u8\n", "whitespace_or_control"],
    ["https://cdn.example.com/a.m3u8%00", "null_byte"],
    ["https://cdn.example.com/a.m3u8?x=%ZZ", "bad_percent_encoding"],
    ["https://cdn.example.com/a.m3u8?x=%2", "bad_percent_encoding"],
    ["https://cdn.example.com/https://evil.example/a.m3u8", "nested_scheme"],
    ["https://cdn.example.com/a.m3u8#frag", "fragment"],
    ["https://192.168.1.20/a.m3u8", "local_or_private_host"],
    ["https://10.0.0.5/a.m3u8", "local_or_private_host"],
    ["https://127.0.0.1/a.m3u8", "local_or_private_host"],
    ["https://localhost/a.m3u8", "local_or_private_host"],
    ["https://tuner.local/a.m3u8", "local_or_private_host"],
    ["https://cdn.example.com/a.m3u", "not_hls"],
    ["https://CDN.example.com/a.m3u8", "ambiguous_normalization"],
  ] as const)("rejects %s", (input, reason) => {
    const result = validateStreamUrl(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(reason);
      expect(JSON.stringify(result)).not.toContain("secret");
      expect(JSON.stringify(result)).not.toContain("evil.example");
      if (input.length > 0) expect(validationMessage(result.reason)).not.toContain(input);
    }
  });
});
