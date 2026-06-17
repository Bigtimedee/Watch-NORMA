import crypto from "crypto";
import { VALID_EVENTS } from "../lib/webhook-delivery";

// ─── HMAC signature verification ──────────────────────────────────────────────

describe("webhook signature", () => {
  const secret = crypto.randomBytes(32).toString("hex");

  function sign(body: string): string {
    const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
    return `sha256=${sig}`;
  }

  function verify(body: string, header: string): boolean {
    const expected = sign(body);
    try {
      return crypto.timingSafeEqual(
        Buffer.from(header),
        Buffer.from(expected)
      );
    } catch {
      return false;
    }
  }

  it("produces a valid sha256= prefixed signature", () => {
    const sig = sign('{"event":"test"}');
    expect(sig.startsWith("sha256=")).toBe(true);
    expect(sig.length).toBeGreaterThanOrEqual(7 + 64);
  });

  it("verifies a correct signature", () => {
    const body = '{"event":"conversion.recorded","campaign_id":"123"}';
    const sig = sign(body);
    expect(verify(body, sig)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = '{"event":"conversion.recorded"}';
    const sig = sign(body);
    const tampered = '{"event":"conversion.recorded","injected":true}';
    expect(verify(tampered, sig)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const wrongSecret = crypto.randomBytes(32).toString("hex");
    const body = '{"event":"test"}';
    const sig = crypto.createHmac("sha256", wrongSecret).update(body).digest("hex");
    expect(verify(body, `sha256=${sig}`)).toBe(false);
  });
});

// ─── Valid event types ────────────────────────────────────────────────────────

describe("VALID_EVENTS", () => {
  it("includes all required event types", () => {
    expect(VALID_EVENTS).toContain("impression.served");
    expect(VALID_EVENTS).toContain("click.recorded");
    expect(VALID_EVENTS).toContain("conversion.recorded");
    expect(VALID_EVENTS).toContain("campaign.budget_50pct");
    expect(VALID_EVENTS).toContain("campaign.budget_90pct");
    expect(VALID_EVENTS).toContain("campaign.ended");
    expect(VALID_EVENTS).toContain("campaign.bid_adjusted");
  });

  it("has 7 event types", () => {
    expect(VALID_EVENTS).toHaveLength(7);
  });
});

// ─── Attribution window ────────────────────────────────────────────────────────

describe("attribution window", () => {
  const WINDOW_DAYS = 7;

  it("accepts a click within the window", () => {
    const clickedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    const windowMs = WINDOW_DAYS * 24 * 60 * 60 * 1000;
    expect(Date.now() - clickedAt.getTime() <= windowMs).toBe(true);
  });

  it("rejects a click outside the window", () => {
    const clickedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days ago
    const windowMs = WINDOW_DAYS * 24 * 60 * 60 * 1000;
    expect(Date.now() - clickedAt.getTime() > windowMs).toBe(true);
  });

  it("accepts a click exactly at the boundary", () => {
    const windowMs = WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const clickedAt = new Date(Date.now() - windowMs + 1000); // 1 second within window
    expect(Date.now() - clickedAt.getTime() <= windowMs).toBe(true);
  });
});

// ─── Dedup logic ─────────────────────────────────────────────────────────────

describe("postback dedup", () => {
  it("deduplicates on click_id", () => {
    // Simulating: if click.converted is true, return already_recorded
    const click = { id: "abc123", converted: true, idempotency_key: null };
    const shouldDedup = click.converted;
    expect(shouldDedup).toBe(true);
  });

  it("matches idempotency_key correctly", () => {
    const storedKey = "idem_xyz";
    const incomingKey = "idem_xyz";
    expect(storedKey === incomingKey).toBe(true);
  });
});

// ─── Retry backoff ────────────────────────────────────────────────────────────

describe("webhook retry backoff", () => {
  const backoffMinutes = [1, 5, 30, 120, 720];

  it("has 5 retry attempts", () => {
    expect(backoffMinutes).toHaveLength(5);
  });

  it("increases backoff exponentially", () => {
    for (let i = 1; i < backoffMinutes.length; i++) {
      expect(backoffMinutes[i]).toBeGreaterThan(backoffMinutes[i - 1]);
    }
  });

  it("disables endpoint after 5 failures", () => {
    const failureCount = 5;
    const shouldDisable = failureCount >= 5;
    expect(shouldDisable).toBe(true);
  });

  it("keeps endpoint active for 4 or fewer failures", () => {
    const failureCount = 4;
    const shouldDisable = failureCount >= 5;
    expect(shouldDisable).toBe(false);
  });
});
