// Pure payload/ticket helpers for send-push (unit-tested, no I/O).
export function buildPushPayload(args: {
  to: string; title: string; body: string; badge: number;
  data: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    to: args.to,
    title: args.title,
    body: args.body,
    data: args.data,
    // Audible, banner-presenting delivery. sound+high priority were already
    // sent before alert 116; interruptionLevel is the iOS Focus breakthrough.
    // Expo Push API spelling is hyphenated 'time-sensitive' (not the local
    // notification 'timeSensitive'). Takes effect for Focus/DND only once the
    // native build carrying the time-sensitive entitlement ships (1.9.x) and
    // the user enables Time Sensitive Notifications for NORMA; on earlier
    // builds APNS ignores it and sound:'default' still applies.
    sound: "default",
    priority: "high",
    interruptionLevel: "time-sensitive",
    channelId: "game-alerts",
    badge: args.badge,
    ttl: 86400,
  };
}
export type ExpoTicket = { id: string | null; status: string | null; message: string | null; errorCode: string | null };
export function parseExpoTicket(pushResult: unknown): ExpoTicket {
  const r = pushResult as any;
  const ticket = Array.isArray(r?.data) ? r.data[0] : r?.data;
  return {
    id: ticket?.id ?? r?.id ?? null,
    status: ticket?.status ?? null,
    message: ticket?.message ?? null,
    errorCode: ticket?.details?.error ?? null,
  };
}
