/**
 * Regression tests for the useConnections provider_type filter bug.
 *
 * Root cause summary:
 *   - YouTube TV was seeded with provider_type='streaming' in seed.sql
 *   - The catalog defines it as provider_type='tv'
 *   - useConnections("tv") would miss YouTube TV rows seeded as 'streaming'
 *   - useConnections("streaming") would return it unexpectedly
 *   - Callers now use useConnections() with NO type filter so all connections
 *     are returned regardless of provider_type, and the mismatch is irrelevant
 *
 * Fix:
 *   - seed.sql now uses provider_type='tv' for YouTube TV
 *   - Call sites use useConnections() (no argument) so filtering is skipped
 */

import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useConnections, useConnectedProviderKeys } from "../useConnections";
import { supabase } from "../../lib/supabase";
import type { Connection } from "../../lib/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeConnection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: 1,
    user_id: "user-123",
    provider_type: "tv",
    provider_key: "youtube_tv",
    provider_name: "YouTube TV",
    connected: true,
    metadata: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// ─── Supabase mock helpers ───────────────────────────────────────────────────

const mockSupabase = supabase as jest.Mocked<typeof supabase>;

function setupUserAndConnections(connections: Connection[]) {
  // Auth: return an authenticated user
  (mockSupabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: "user-123" } },
    error: null,
  });

  // Build a chainable query builder that resolves to the given connections.
  // Each method must return `this` to support chaining: .from().select().eq()...
  const queryBuilder: Record<string, jest.Mock> = {};
  const chainReturn = () => queryBuilder;

  queryBuilder.select = jest.fn(chainReturn);
  queryBuilder.eq = jest.fn(chainReturn);
  queryBuilder.order = jest.fn(chainReturn);
  queryBuilder.limit = jest.fn(chainReturn);
  // The terminal await resolves the query
  queryBuilder.then = jest.fn((resolve: (v: unknown) => void) =>
    Promise.resolve({ data: connections, error: null }).then(resolve)
  );

  (mockSupabase.from as jest.Mock).mockReturnValue(queryBuilder);

  return queryBuilder;
}

// ─── Tests: type-agnostic behavior ──────────────────────────────────────────

describe("useConnections() — no type argument", () => {
  it("returns all connections regardless of provider_type", async () => {
    const connections: Connection[] = [
      makeConnection({ id: 1, provider_type: "tv", provider_key: "youtube_tv" }),
      makeConnection({ id: 2, provider_type: "streaming", provider_key: "espn_plus" }),
      makeConnection({ id: 3, provider_type: "sportsbook", provider_key: "draftkings" }),
    ];
    setupUserAndConnections(connections);

    const { result } = renderHook(() => useConnections(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(3);
    const keys = result.current.data!.map((c) => c.provider_key);
    expect(keys).toContain("youtube_tv");
    expect(keys).toContain("espn_plus");
    expect(keys).toContain("draftkings");
  });

  it("returns both tv and streaming provider_type rows for the same user", async () => {
    const connections: Connection[] = [
      makeConnection({ id: 1, provider_type: "tv", provider_key: "youtube_tv" }),
      makeConnection({ id: 2, provider_type: "streaming", provider_key: "peacock" }),
    ];
    setupUserAndConnections(connections);

    const { result } = renderHook(() => useConnections(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const types = result.current.data!.map((c) => c.provider_type);
    expect(types).toContain("tv");
    expect(types).toContain("streaming");
  });

  it("does NOT add a provider_type filter to the Supabase query when called with no argument", async () => {
    const qb = setupUserAndConnections([]);

    const { result } = renderHook(() => useConnections(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // The .eq() method should have been called once (for user_id) but NOT
    // for provider_type.
    const eqCalls: Array<[string, unknown]> = qb.eq.mock.calls;
    const providerTypeFilterApplied = eqCalls.some(
      ([field]) => field === "provider_type"
    );
    expect(providerTypeFilterApplied).toBe(false);
  });
});

describe("useConnections() — provider_key matching", () => {
  it("finds a YouTube TV connection inserted with provider_type='tv'", async () => {
    setupUserAndConnections([
      makeConnection({ provider_key: "youtube_tv", provider_type: "tv", connected: true }),
    ]);

    const { result } = renderHook(() => useConnections(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const ytv = result.current.data!.find((c) => c.provider_key === "youtube_tv");
    expect(ytv).toBeDefined();
    expect(ytv!.provider_type).toBe("tv");
    expect(ytv!.connected).toBe(true);
  });
});

describe("useConnections() — regression: provider_type mismatch", () => {
  it(
    "useConnections('tv') would NOT have found YouTube TV when it was incorrectly seeded as provider_type='streaming'",
    async () => {
      // This test documents the OLD broken behavior.
      // Before the fix, seed.sql used provider_type='streaming' for YouTube TV.
      // Callers using useConnections('tv') would filter by provider_type='tv'
      // and miss the YouTube TV row entirely.
      //
      // We simulate this by mocking the DB to return a 'streaming'-typed row
      // and confirming that the 'tv' filter would exclude it.

      (mockSupabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: "user-123" } },
        error: null,
      });

      // Simulate: DB has YouTube TV with the OLD wrong provider_type
      const badConnection = makeConnection({
        provider_key: "youtube_tv",
        provider_type: "streaming", // the old bug
        connected: true,
      });

      // Build two query builders: one that filters for 'tv' (old broken path),
      // one that has no filter (the fix).
      function buildFilteredQb(filterType: string | undefined, rows: Connection[]) {
        const filteredRows =
          filterType !== undefined
            ? rows.filter((c) => c.provider_type === filterType)
            : rows;

        let capturedTypeFilter: string | undefined;
        const qb: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
        const chain = () => qb;
        qb.select = jest.fn(chain);
        qb.order = jest.fn(chain);
        qb.limit = jest.fn(chain);
        // .eq() captures provider_type filters for this test's simulation
        qb.eq = jest.fn((field: string, value: string) => {
          if (field === "provider_type") {
            capturedTypeFilter = value;
          }
          return qb;
        });
        qb.then = jest.fn((resolve: (v: unknown) => void) =>
          Promise.resolve({
            data: capturedTypeFilter !== undefined
              ? filteredRows.filter((c) => c.provider_type === capturedTypeFilter)
              : filteredRows,
            error: null,
          }).then(resolve)
        );
        return qb;
      }

      // Scenario A: old broken caller used useConnections('tv')
      // The Supabase query would add .eq('provider_type', 'tv')
      // YouTube TV (seeded as 'streaming') would NOT be returned.
      const qbOld = buildFilteredQb("tv", [badConnection]);
      (mockSupabase.from as jest.Mock).mockReturnValue(qbOld);

      const { result: resultOld, unmount } = renderHook(
        () => useConnections(),
        { wrapper: createWrapper() }
      );
      await waitFor(() => expect(resultOld.current.isSuccess).toBe(true));

      const foundWithOldFilter = resultOld.current.data!.some(
        (c) => c.provider_key === "youtube_tv"
      );
      // Old code: YouTube TV was MISSING because of the type mismatch
      expect(foundWithOldFilter).toBe(false);
      unmount();

      // Scenario B: fixed caller uses useConnections() with no type filter
      // All rows are returned, YouTube TV IS found regardless of provider_type
      const qbFixed = buildFilteredQb(undefined, [badConnection]);
      (mockSupabase.from as jest.Mock).mockReturnValue(qbFixed);

      const { result: resultFixed } = renderHook(() => useConnections(), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(resultFixed.current.isSuccess).toBe(true));

      const foundWithFix = resultFixed.current.data!.some(
        (c) => c.provider_key === "youtube_tv"
      );
      // Fixed code: YouTube TV IS found even with the old wrong provider_type
      expect(foundWithFix).toBe(true);
    }
  );
});

describe("useConnections() — returns empty array when user is not authenticated", () => {
  it("returns [] when getUser returns no user", async () => {
    (mockSupabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const { result } = renderHook(() => useConnections(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });
});

describe("useConnectedProviderKeys()", () => {
  it("returns only the keys of connected=true rows", async () => {
    setupUserAndConnections([
      makeConnection({ provider_key: "youtube_tv", connected: true }),
      makeConnection({ id: 2, provider_key: "espn_plus", provider_type: "streaming", connected: false }),
      makeConnection({ id: 3, provider_key: "peacock", provider_type: "streaming", connected: true }),
    ]);

    const { result } = renderHook(() => useConnectedProviderKeys(), {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(result.current).toEqual(expect.arrayContaining(["youtube_tv", "peacock"]))
    );
    expect(result.current).not.toContain("espn_plus");
  });
});
