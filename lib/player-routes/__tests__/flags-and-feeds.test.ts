import { evaluatePlayerRouteFlags, PLAYER_ROUTE_FLAG_FRESHNESS_MS, PLAYER_ROUTE_REMOTE_CONTROL, SHIPPED_PLAYER_ROUTE_FLAGS } from "../flags";
import { resolveCanonicalFeed, listMappableFeeds } from "../canonical-feeds";
import type { PlayerRouteFlagSnapshot } from "../flags";

const openRemote = (fetchedAtMs: number): PlayerRouteFlagSnapshot => ({
  source: "remote",
  fetchedAtMs,
  globalEnabled: true,
  strymtvEnabled: true,
  killSwitch: false,
  cohortAllowlist: ["beta-1"],
  cohortId: "beta-1",
});

describe("player route flags", () => {
  it("ships off and does not pretend a remote kill switch exists", () => {
    expect(PLAYER_ROUTE_REMOTE_CONTROL.wired).toBe(false);
    const decision = evaluatePlayerRouteFlags(SHIPPED_PLAYER_ROUTE_FLAGS, Date.now());
    expect(decision).toEqual({ allowed: false, reason: "global_disabled" });
  });

  it("fail-closes an unavailable or expired remote snapshot", () => {
    const now = 1_000_000;
    expect(evaluatePlayerRouteFlags({ ...openRemote(now), source: "unavailable" }, now).reason).toBe("config_unavailable");
    expect(evaluatePlayerRouteFlags(openRemote(now - PLAYER_ROUTE_FLAG_FRESHNESS_MS - 1), now).reason).toBe("config_expired");
    expect(evaluatePlayerRouteFlags(openRemote(now - PLAYER_ROUTE_FLAG_FRESHNESS_MS), now).reason).toBe("allowed");
  });

  it("requires the kill switch to be off, both enables, and a named cohort", () => {
    const now = 5_000;
    expect(evaluatePlayerRouteFlags({ ...openRemote(now), killSwitch: true }, now).reason).toBe("kill_switch");
    expect(evaluatePlayerRouteFlags({ ...openRemote(now), strymtvEnabled: false }, now).reason).toBe("player_disabled");
    expect(evaluatePlayerRouteFlags({ ...openRemote(now), cohortAllowlist: [] }, now).reason).toBe("cohort_not_admitted");
    expect(evaluatePlayerRouteFlags({ ...openRemote(now), cohortId: "other" }, now).reason).toBe("cohort_not_admitted");
    expect(evaluatePlayerRouteFlags(openRemote(now), now).allowed).toBe(true);
  });
});

describe("canonical feeds", () => {
  it("maps one exact national token and does not confuse ESPN with ESPN2 or ESPN+", () => {
    expect(resolveCanonicalFeed("ESPN")).toMatchObject({ status: "exact", feed: { id: "us.national.espn" } });
    expect(resolveCanonicalFeed("ESPN2")).toMatchObject({ status: "exact", feed: { id: "us.national.espn2" } });
    expect(resolveCanonicalFeed("ESPN+").status).toBe("exclusive");
    expect(resolveCanonicalFeed(" espn ").status).toBe("exact");
  });

  it("does not launch when the broadcast is mixed, unknown, regional, or empty", () => {
    expect(resolveCanonicalFeed("ESPN/ESPN2").status).toBe("ambiguous");
    expect(resolveCanonicalFeed("NBC, Peacock").status).toBe("ambiguous");
    expect(resolveCanonicalFeed("ESPN/Max").status).toBe("unresolved");
    expect(resolveCanonicalFeed("Sunday Night Football").status).toBe("unresolved");
    expect(resolveCanonicalFeed("Bally Sports Detroit").status).toBe("unresolved");
    expect(resolveCanonicalFeed(null).status).toBe("unresolved");
    expect(resolveCanonicalFeed("").status).toBe("unresolved");
  });

  it("keeps streaming exclusives out of the mapping list", () => {
    expect(listMappableFeeds().some((feed) => feed.kind !== "national_linear")).toBe(false);
    expect(listMappableFeeds().some((feed) => feed.id.includes("prime"))).toBe(false);
  });
});
