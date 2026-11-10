import { isCarriedOnYouTubeTV, isStreamingExclusiveBroadcast } from "../deep-links";
import { feedById, resolveCanonicalFeed } from "./canonical-feeds";
import type { StoredRouteMeta } from "./store-types";

export interface PlayerRouteSecondaryOffer {
  action: "secondary";
  routeId: string;
  feedId: string;
  feedLabel: string;
  youtubeTvRemainsDefault: boolean;
}

export interface PlayerRouteHidden {
  action: "hidden";
  reason: string;
  youtubeTvRemainsDefault: boolean;
}

export type ResolvePlayerRouteResult = PlayerRouteSecondaryOffer | PlayerRouteHidden;

export interface ResolvePlayerRouteInput {
  broadcast: string | null;
  platform: string;
  flagsAllowed: boolean;
  encodingGateOpen: boolean;
  optIn: boolean;
  reinstallLocked: boolean;
  routes: readonly StoredRouteMeta[];
  youtubeTvCarries: boolean;
  streamingExclusive: boolean;
}

function hidden(reason: string, youtubeTvCarries: boolean): PlayerRouteHidden {
  return { action: "hidden", reason, youtubeTvRemainsDefault: youtubeTvCarries };
}

/**
 * Optional secondary action only. This never selects the primary watch
 * provider and has no preference that overrides YouTube TV.
 */
export function resolvePlayerRouteOffer(input: ResolvePlayerRouteInput): ResolvePlayerRouteResult {
  const carries = input.youtubeTvCarries;
  if (input.platform !== "ios") return hidden("platform", carries);
  if (!input.flagsAllowed) return hidden("flag_off", carries);
  if (!input.encodingGateOpen) return hidden("encoding_gate", carries);
  if (!input.optIn) return hidden("opt_in", carries);
  if (input.reinstallLocked) return hidden("reinstall_lock", carries);
  if (input.streamingExclusive) return hidden("streaming_exclusive", carries);

  const resolved = resolveCanonicalFeed(input.broadcast);
  if (resolved.status === "unresolved") return hidden("unresolved_broadcast", carries);
  if (resolved.status === "ambiguous") return hidden("ambiguous_broadcast", carries);
  if (resolved.status === "exclusive") return hidden("streaming_exclusive", carries);

  const matches = input.routes.filter(
    (route) =>
      route.player === "strymtv" &&
      route.schemaVersion === 1 &&
      route.feedId === resolved.feed.id &&
      route.enabled &&
      !route.quarantined &&
      route.userConfirmedAt != null
  );
  if (matches.length === 0) {
    const sameFeed = input.routes.filter((route) => route.feedId === resolved.feed.id);
    if (sameFeed.length === 0) return hidden("no_route", carries);
    if (sameFeed.some((route) => route.quarantined)) return hidden("quarantined", carries);
    if (sameFeed.some((route) => !route.enabled)) return hidden("route_disabled", carries);
    return hidden("route_not_confirmed", carries);
  }
  if (matches.length > 1) return hidden("ambiguous_routes", carries);
  const route = matches[0];
  return {
    action: "secondary",
    routeId: route.id,
    feedId: route.feedId,
    feedLabel: feedById(route.feedId)?.label ?? resolved.feed.label,
    youtubeTvRemainsDefault: carries,
  };
}

export function resolveOfferForBroadcast(
  input: Omit<ResolvePlayerRouteInput, "youtubeTvCarries" | "streamingExclusive">
): ResolvePlayerRouteResult {
  const feed = resolveCanonicalFeed(input.broadcast);
  return resolvePlayerRouteOffer({
    ...input,
    youtubeTvCarries: isCarriedOnYouTubeTV(input.broadcast),
    streamingExclusive: isStreamingExclusiveBroadcast(input.broadcast) || feed.status === "exclusive",
  });
}
