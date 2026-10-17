import { buildPushPayload, parseExpoTicket } from "./payload.ts";
function assertEq(a: unknown, b: unknown, m: string) { if (a !== b) throw new Error(`${m}: ${a} !== ${b}`); }
Deno.test("buildPushPayload is audible + time-sensitive", () => {
  const p = buildPushPayload({ to: "ExponentPushToken[x]", title: "t", body: "b", badge: 2, data: { gameId: "g" } });
  assertEq(p.sound, "default", "sound");
  assertEq(p.priority, "high", "priority");
  assertEq(p.interruptionLevel, "time-sensitive", "interruptionLevel");
  assertEq(p.channelId, "game-alerts", "channelId");
  assertEq(p.badge, 2, "badge");
});
Deno.test("parseExpoTicket reads array ticket + DeviceNotRegistered", () => {
  const ok = parseExpoTicket({ data: [{ status: "ok", id: "abc" }] });
  assertEq(ok.status, "ok", "ok status"); assertEq(ok.id, "abc", "ok id");
  const bad = parseExpoTicket({ data: [{ status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }] });
  assertEq(bad.status, "error", "bad status"); assertEq(bad.errorCode, "DeviceNotRegistered", "bad code");
});
