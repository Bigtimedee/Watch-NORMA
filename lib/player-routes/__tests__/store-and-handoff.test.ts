import { createPlayerRouteRepository, type PlayerRouteSecureStorage } from "../store";
import { STRYMTV_ENCODING_GATE, productionHandoffPermitted, type EncodingGate, type VerifiedEncodingContract } from "../encoding-gate";
import { attemptStrymTvHandoff } from "../handoff";
import { buildEncodingCandidates } from "../encoding-harness";

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";
const STREAM = "https://cdn.example.com/live/clock.m3u8?x=1&y=a%2Fb";

function memory() {
  const secureMap = new Map<string, string>();
  const markerMap = { value: null as string | null };
  let n = 0;
  const secure: PlayerRouteSecureStorage = {
    get: async (key) => secureMap.get(key) ?? null,
    set: async (key, value) => {
      secureMap.set(key, value);
    },
    remove: async (key) => {
      secureMap.delete(key);
    },
  };
  const repo = (gate: EncodingGate, contract: VerifiedEncodingContract | null, open = jest.fn(async () => true)) =>
    createPlayerRouteRepository({
      secure,
      marker: {
        get: async () => markerMap.value,
        set: async (value) => {
          markerMap.value = value;
        },
        remove: async () => {
          markerMap.value = null;
        },
      },
      gate,
      contract,
      now: () => "2026-11-09T18:00:00.000Z",
      newId: () => {
        n += 1;
        return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      },
      platform: () => "ios",
      open,
    });
  return { secureMap, markerMap, repo };
}

function leaks(map: Map<string, string>, secret: string): string[] {
  const found: string[] = [];
  for (const [key, value] of map) {
    if (key.startsWith("pr.url.")) continue;
    if (value.includes(secret) || value.includes("cdn.example.com") || value.includes("strymtv:")) found.push(key);
  }
  return found;
}

describe("player route store", () => {
  it("scopes routes by account, wipes on sign-out, and keeps the address out of the index", async () => {
    const { secureMap, repo } = memory();
    const store = repo(STRYMTV_ENCODING_GATE, null);
    expect((await store.setOptIn(ACCOUNT_A, true, false)).reason).toBe("feature_unavailable");
    expect((await store.saveRoute(ACCOUNT_A, { feedId: "us.national.espn", label: "East", streamUrl: STREAM }, false)).reason).toBe("feature_unavailable");

    await store.setOptIn(ACCOUNT_A, true, true);
    const saved = await store.saveRoute(ACCOUNT_A, { feedId: "us.national.espn", label: "Home", streamUrl: STREAM }, true);
    expect(saved.ok).toBe(true);
    expect(leaks(secureMap, STREAM)).toEqual([]);
    expect((await store.load(ACCOUNT_B)).routes).toEqual([]);
    const loaded = await store.load(ACCOUNT_A);
    expect(loaded.routes).toHaveLength(1);
    expect(JSON.stringify(loaded)).not.toContain("cdn.example.com");
    expect(loaded.routes[0].userConfirmedAt).toBeNull();

    await store.wipeAccount(ACCOUNT_A);
    expect((await store.load(ACCOUNT_A)).routes).toEqual([]);
    expect([...secureMap.keys()].some((key) => key.includes(ACCOUNT_A) && key.startsWith("pr.url."))).toBe(false);
  });

  it("quarantines keychain routes when the install marker is gone", async () => {
    const bag = memory();
    const store = bag.repo(STRYMTV_ENCODING_GATE, null);
    await store.reconcileInstall();
    await store.setOptIn(ACCOUNT_A, true, true);
    await store.saveRoute(ACCOUNT_A, { feedId: "us.national.fox", label: "", streamUrl: STREAM }, true);
    bag.markerMap.value = null;
    expect(await store.reconcileInstall()).toBe("reinstall_quarantined");
    const loaded = await store.load(ACCOUNT_A);
    expect(loaded.reinstallLock).toBe(true);
    expect(loaded.routes[0].userConfirmedAt).toBeNull();
    expect(loaded.routes[0].quarantined).toBe(true);
    await store.deleteAll(ACCOUNT_A);
    expect((await store.load(ACCOUNT_A)).hasDeletableData).toBe(false);
  });

  it("rejects a stored preference that would override YouTube TV", async () => {
    const bag = memory();
    const store = bag.repo(STRYMTV_ENCODING_GATE, null);
    await store.setOptIn(ACCOUNT_A, true, true);
    const raw = bag.secureMap.get(`pr.index.${ACCOUNT_A}`);
    const index = JSON.parse(raw ?? "{}");
    index.preferOverCarriedProvider = true;
    bag.secureMap.set(`pr.index.${ACCOUNT_A}`, JSON.stringify(index));
    const loaded = await store.load(ACCOUNT_A);
    expect(loaded.routes).toEqual([]);
    expect(loaded.unavailableReason).toBe("corrupt");
  });

  it("refuses confirmation while the shipped encoding gate is closed", async () => {
    const open = jest.fn(async () => true);
    const store = memory().repo(STRYMTV_ENCODING_GATE, null, open);
    await store.setOptIn(ACCOUNT_A, true, true);
    const saved = await store.saveRoute(ACCOUNT_A, { feedId: "us.national.cbs", label: "", streamUrl: STREAM }, true);
    expect(productionHandoffPermitted(STRYMTV_ENCODING_GATE)).toBe(false);
    expect((await store.confirmRoute(ACCOUNT_A, saved.routeId ?? "")).reason).toBe("encoding_gate");
    const tested = await store.testRoute(ACCOUNT_A, saved.routeId ?? "");
    expect(tested).toEqual({ outcome: "blocked_unverified_encoding", handoffAccepted: false });
    expect(open).not.toHaveBeenCalled();
  });
});

describe("encoding gate and harness", () => {
  const contract = { id: "unit-only", embed: "percent-encoded" as const, deviceVerified: true };

  it("does not call open for the shipped gate", async () => {
    const open = jest.fn(async () => true);
    const result = await attemptStrymTvHandoff(STREAM, {
      gate: STRYMTV_ENCODING_GATE,
      contract,
      platform: "ios",
      open,
    });
    expect(result.handoffAccepted).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("cdn.example.com");
  });

  it("builds candidate strings without claiming the player decoded them", () => {
    const built = buildEncodingCandidates(STREAM);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.candidates.every((item) => item.deviceVerified === false && item.unverified === true)).toBe(true);
    const encoded = built.candidates.find((item) => item.id === "percent-encoded");
    expect(encoded?.launchUrl).toBe(`strymtv://player/${encodeURIComponent(STREAM)}`);
    expect(encoded?.launchUrl).toContain("a%252Fb");
    const raw = built.candidates.find((item) => item.id === "raw-nested");
    expect(raw?.launchUrl).toContain("y=a%2Fb");
    expect(raw?.launchUrl).not.toContain("a%252Fb");
  });

  it("an injected open gate records os acceptance only", async () => {
    const open = jest.fn(async () => true);
    const gate: EncodingGate = {
      status: "open",
      verified: true,
      contractId: "not-a-device-trial",
      blockedReason: "test double",
    };
    const result = await attemptStrymTvHandoff(STREAM, { gate, contract, platform: "ios", open });
    expect(result).toEqual({ outcome: "handoff_accepted", handoffAccepted: true });
    expect(open).toHaveBeenCalledWith(`strymtv://player/${encodeURIComponent(STREAM)}`);
    expect(JSON.stringify(result)).not.toContain("handoffAccepted\":true,\"played");
  });
});
