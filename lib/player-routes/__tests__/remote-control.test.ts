import { readFileSync } from "fs";
import { join } from "path";
import { createPlayerRouteControl, parseRemoteControlPayload } from "../remote-control";
import { attemptStrymTvHandoff } from "../handoff";
import type { EncodingGate } from "../encoding-gate";

const NOW = Date.parse("2026-11-10T04:00:00.000Z");

function row(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    killed: true,
    strymtv_enabled: false,
    cohort_allowlist: [] as string[],
    ttl_seconds: 60,
    updated_at: "2026-11-10T04:00:00.000Z",
    ...overrides,
  };
}

describe("remote kill switch", () => {
  it("rejects malformed, secret-shaped, and future payloads", () => {
    expect(parseRemoteControlPayload(null, NOW).ok).toBe(false);
    expect(parseRemoteControlPayload({ ...row(), stream_url: "https://cdn.example.com/a.m3u8" }, NOW).ok).toBe(false);
    expect(parseRemoteControlPayload(row({ updated_at: "2026-11-10T04:05:00.000Z" }), NOW).ok).toBe(false);
    expect(parseRemoteControlPayload(row({ ttl_seconds: 901 }), NOW).ok).toBe(false);
    expect(parseRemoteControlPayload(row({ cohort_allowlist: ["user@example.com"] }), NOW).ok).toBe(false);
    expect(parseRemoteControlPayload(row(), NOW).ok).toBe(true);
  });

  it("lets a server kill beat a stale allow, another account's cohort, and a failed refresh", async () => {
    let payload: unknown = row({
      killed: false,
      strymtv_enabled: true,
      cohort_allowlist: ["beta-1"],
      updated_at: "2026-11-10T03:59:00.000Z",
    });
    let nowMs = NOW;
    const control = createPlayerRouteControl({
      fetchPayload: async () => payload,
      now: () => nowMs,
      cohortId: () => "someone-else",
    });
    expect((await control.refresh()).reason).toBe("cohort_not_admitted");

    const admitted = createPlayerRouteControl({
      fetchPayload: async () => payload,
      now: () => nowMs,
      cohortId: () => "beta-1",
    });
    expect((await admitted.refresh()).allowed).toBe(true);

    payload = row({
      killed: true,
      strymtv_enabled: true,
      cohort_allowlist: ["beta-1"],
      updated_at: "2026-11-10T04:00:30.000Z",
    });
    expect((await admitted.beforeHandoff()).reason).toBe("kill_switch");
    expect(admitted.isKilled()).toBe(true);

    payload = row({
      killed: false,
      strymtv_enabled: true,
      cohort_allowlist: ["beta-1"],
      updated_at: "2026-11-10T03:00:00.000Z",
    });
    expect((await admitted.beforeHandoff()).reason).toBe("kill_switch");

    const failing = createPlayerRouteControl({
      fetchPayload: async () => {
        throw new Error("network");
      },
      now: () => nowMs,
    });
    expect((await failing.refresh()).reason).toBe("config_unavailable");
  });

  it("drops a cached allow when refresh fails and ignores a late allow after a kill", async () => {
    let releaseAllow: (value: unknown) => void = () => undefined;
    let releaseKill: (value: unknown) => void = () => undefined;
    const allow = new Promise((resolve) => {
      releaseAllow = resolve;
    });
    const kill = new Promise((resolve) => {
      releaseKill = resolve;
    });
    const requests: Array<"allow" | "kill"> = [];
    const control = createPlayerRouteControl({
      fetchPayload: () => {
        const kind = requests.length === 0 ? "allow" : "kill";
        requests.push(kind);
        return kind === "allow" ? allow : kill;
      },
      now: () => NOW,
      cohortId: () => "beta-1",
    });
    const first = control.refresh();
    const second = control.beforeHandoff();
    releaseKill(row({
      killed: true,
      strymtv_enabled: true,
      cohort_allowlist: ["beta-1"],
      updated_at: "2026-11-10T04:00:30.000Z",
    }));
    releaseAllow(row({
      killed: false,
      strymtv_enabled: true,
      cohort_allowlist: ["beta-1"],
      updated_at: "2026-11-10T03:59:00.000Z",
    }));
    expect((await second).reason).toBe("kill_switch");
    expect((await first).reason).toBe("kill_switch");
    expect((await control.beforeHandoff()).reason).toBe("kill_switch");
  });

  it("does not open when the fresh remote decision is disabled", async () => {
    const open = jest.fn(async () => true);
    const gate: EncodingGate = {
      status: "open",
      verified: true,
      contractId: "unit-only",
      blockedReason: "test double",
    };
    const result = await attemptStrymTvHandoff("https://cdn.example.com/live/clock.m3u8?x=1", {
      gate,
      contract: { id: "unit-only", embed: "percent-encoded", deviceVerified: true },
      platform: "ios",
      open,
      confirmAllowed: async () => false,
    });
    expect(result.handoffAccepted).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});

describe("player_route_control migration", () => {
  const sql = readFileSync(join(__dirname, "../../../supabase/migrations/20261110040000_player_route_control.sql"), "utf8");
  const action = readFileSync(join(__dirname, "../../../web/src/app/admin/player-routes/actions.ts"), "utf8");

  it("defaults off, locks writes to the service role, and stores no stream data", () => {
    expect(sql).toMatch(/killed BOOLEAN NOT NULL DEFAULT true/);
    expect(sql).toMatch(/strymtv_enabled BOOLEAN NOT NULL DEFAULT false/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.player_route_control TO authenticated/);
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.player_route_control TO service_role/);
    expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE)[^;]*TO authenticated/i);
    expect(sql.toLowerCase()).not.toContain("stream_url");
    expect(sql).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
  });

  it("admin writes require the admin role and only change the kill flag", () => {
    expect(action).toContain("requireAdmin()");
    expect(action).toContain("createSupabaseAdmin()");
    expect(action).toContain('user.app_metadata?.role !== "admin"');
    expect(action).toContain("killed, updated_at");
    expect(action).not.toContain("strymtv_enabled:");
  });
});
