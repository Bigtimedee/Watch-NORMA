import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useAlerts, useUnreadAlertCount } from "../useAlerts";
import { supabase } from "../../lib/supabase";
import {
  DEMO_ALERT_GAME_ID_OR,
  DEMO_ALERT_TITLE_ILIKE,
} from "../../lib/demo-guard";
import type { Alert } from "../../lib/types";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 1,
    user_id: "user-123",
    game_id: "espn-ncaaf-401856660",
    sport: "ncaaf",
    alert_type: "close_game",
    title: "Your spread is live",
    body: "Clemson / LSU is within a possession",
    why: null,
    push_sent: true,
    read: false,
    created_at: "2026-09-05T00:00:00Z",
    score: 50,
    explanation: null,
    suppressed_reason: null,
    sponsor_bid_id: null,
    sponsor_text: null,
    sponsor_cta_url: null,
    sponsor_logo_url: null,
    clearing_price_cents: null,
    ...overrides,
  };
}

function makeAlertsQuery(rows: Alert[] | null, count?: number) {
  const qb: Record<string, jest.Mock> = {};
  const chain = () => qb;
  qb.select = jest.fn(chain);
  qb.eq = jest.fn(chain);
  qb.order = jest.fn(chain);
  qb.limit = jest.fn(chain);
  qb.not = jest.fn(chain);
  qb.or = jest.fn(chain);
  qb.then = jest.fn((resolve: (v: unknown) => void) =>
    Promise.resolve({ data: rows, error: null, count: count ?? rows?.length ?? 0 }).then(
      resolve
    )
  );
  return qb;
}

describe("useAlerts — demo row exclusion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
  });

  it("applies DEMO SCREENSHOT + demo game_id filters and drops leftover rows", async () => {
    const qb = makeAlertsQuery([
      makeAlert({ id: 1, title: "Your spread is live" }),
      makeAlert({
        id: 2,
        game_id: "demo-ncaaf-clem-lsu-20260905",
        title: "Clemson / LSU is live",
      }),
      makeAlert({
        id: 3,
        game_id: "espn-nfl-401772829",
        title: "DEMO SCREENSHOT — fake live look",
        sport: "nfl",
      }),
    ]);
    (supabase.from as jest.Mock).mockReturnValue(qb);

    const { result, unmount } = renderHook(() => useAlerts(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(qb.not).toHaveBeenCalledWith("title", "ilike", DEMO_ALERT_TITLE_ILIKE);
    expect(qb.or).toHaveBeenCalledWith(DEMO_ALERT_GAME_ID_OR);
    expect(result.current.data?.map((a) => a.id)).toEqual([1]);
    unmount();
  });
});

describe("useUnreadAlertCount — demo row exclusion", () => {
  it("applies the same alert exclusion to the unread count query", async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    const qb = makeAlertsQuery(null, 2);
    (supabase.from as jest.Mock).mockReturnValue(qb);

    const { result, unmount } = renderHook(() => useUnreadAlertCount(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qb.not).toHaveBeenCalledWith("title", "ilike", DEMO_ALERT_TITLE_ILIKE);
    expect(qb.or).toHaveBeenCalledWith(DEMO_ALERT_GAME_ID_OR);
    unmount();
  });
});
