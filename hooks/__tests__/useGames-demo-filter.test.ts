import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useFollowedGames, useGames } from "../useGames";
import { useGameDetail } from "../useGameDetail";
import { supabase } from "../../lib/supabase";
import {
  DEMO_ALERT_GAME_ID_OR,
  DEMO_GAME_ID_LIKE,
} from "../../lib/demo-guard";
import type { Game } from "../../lib/types";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "espn-ncaaf-401856660",
    sport: "ncaaf",
    sportsdataio_id: null,
    espn_id: "401856660",
    sportradar_id: null,
    status: "scheduled",
    title: "Clemson at LSU",
    home_team_id: "lsu",
    away_team_id: "clemson",
    home_score: 0,
    away_score: 0,
    clock: null,
    period: null,
    scheduled_at: "2026-09-05T23:30:00Z",
    venue: null,
    broadcast: null,
    coverage: null,
    coverage_level: null,
    tournament_round: null,
    snapshot_hash: null,
    last_pbp_source: null,
    last_summary_source: null,
    updated_at: "2026-09-05T00:00:00Z",
    ...overrides,
  };
}

function makeGamesQuery(rows: Game[]) {
  const qb: Record<string, jest.Mock> = {};
  const chain = () => qb;
  qb.select = jest.fn(chain);
  qb.gte = jest.fn(chain);
  qb.lte = jest.fn(chain);
  qb.not = jest.fn(chain);
  qb.or = jest.fn(chain);
  qb.in = jest.fn(chain);
  qb.eq = jest.fn(chain);
  qb.order = jest.fn(chain);
  qb.then = jest.fn((resolve: (v: unknown) => void) =>
    Promise.resolve({ data: rows, error: null }).then(resolve)
  );
  return qb;
}

describe("useGames — demo row exclusion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.removeChannel as jest.Mock | undefined)?.mockReturnValue?.(undefined);
  });

  it("applies id ILIKE demo-% exclusion and drops leftover demo rows", async () => {
    const qb = makeGamesQuery([
      makeGame({ id: "espn-ncaaf-401856660" }),
      makeGame({
        id: "demo-ncaaf-clem-lsu-20260905",
        espn_id: null,
        title: "DEMO Clemson / LSU",
        status: "inprogress",
      }),
    ]);
    (supabase.from as jest.Mock).mockReturnValue(qb);

    const { result, unmount } = renderHook(() => useGames("2026-09-05", "ncaaf"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(qb.not).toHaveBeenCalledWith("id", "ilike", DEMO_GAME_ID_LIKE);
    expect(result.current.data?.map((g) => g.id)).toEqual([
      "espn-ncaaf-401856660",
    ]);
    unmount();
  });
});

describe("useFollowedGames — demo row exclusion", () => {
  it("excludes demo game ids from the followed list query", async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    const followsQb: Record<string, jest.Mock> = {};
    const chainFollows = () => followsQb;
    followsQb.select = jest.fn(chainFollows);
    followsQb.eq = jest.fn(chainFollows);
    followsQb.not = jest.fn(chainFollows);

    const gamesQb = makeGamesQuery([
      makeGame({ id: "espn-ncaaf-401856660" }),
      makeGame({ id: "demo-nfl-sf-lar-20260910", sport: "nfl" }),
    ]);

    let fromCalls = 0;
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      fromCalls += 1;
      if (table === "follows") {
        followsQb.then = jest.fn((resolve: (v: unknown) => void) => {
          const payload =
            fromCalls === 1
              ? {
                  data: [
                    { game_id: "espn-ncaaf-401856660" },
                    { game_id: "demo-ncaaf-clem-lsu-20260905" },
                  ],
                  error: null,
                }
              : { data: [], error: null };
          return Promise.resolve(payload).then(resolve);
        });
        return followsQb;
      }
      return gamesQb;
    });

    const { result, unmount } = renderHook(() => useFollowedGames(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(gamesQb.not).toHaveBeenCalledWith("id", "ilike", DEMO_GAME_ID_LIKE);
    expect(gamesQb.in).toHaveBeenCalledWith("id", ["espn-ncaaf-401856660"]);
    expect(result.current.data?.map((g) => g.id)).toEqual([
      "espn-ncaaf-401856660",
    ]);
    expect(DEMO_ALERT_GAME_ID_OR).toContain("demo-%");
    unmount();
  });
});

describe("useGameDetail — demo ids", () => {
  it("does not fetch screenshot-seeded game ids", async () => {
    const from = supabase.from as jest.Mock;
    from.mockClear();

    const { result } = renderHook(
      () => useGameDetail("demo-ncaaf-clem-lsu-20260905"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(from).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });
});
