import { renderHook, act, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useSubmitAlertFeedback } from "../useAlertFeedback";
import { supabase } from "../../lib/supabase";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockSupabase = supabase as jest.Mocked<typeof supabase>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function setupUpsert(result: { data: null; error: null | { message: string } }) {
  (mockSupabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: "user-abc" } },
    error: null,
  });

  const qb: Record<string, jest.Mock> = {};
  qb.upsert = jest.fn((_row: unknown, _opts: unknown) => qb);
  qb.then = jest.fn((resolve: (v: unknown) => void) =>
    Promise.resolve(result).then(resolve)
  );

  (mockSupabase.from as jest.Mock).mockReturnValue(qb);
  return qb;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

it("submits thumbs-up rating", async () => {
  const qb = setupUpsert({ data: null, error: null });

  const { result } = renderHook(() => useSubmitAlertFeedback(), {
    wrapper: createWrapper(),
  });

  await act(async () => {
    result.current.mutate({ alertId: 42, rating: "up" });
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockSupabase.from).toHaveBeenCalledWith("alert_feedback");
  expect(qb.upsert).toHaveBeenCalledWith(
    { alert_id: 42, user_id: "user-abc", rating: "up" },
    { onConflict: "alert_id,user_id" }
  );
});

it("submits thumbs-down rating", async () => {
  const qb = setupUpsert({ data: null, error: null });

  const { result } = renderHook(() => useSubmitAlertFeedback(), {
    wrapper: createWrapper(),
  });

  await act(async () => {
    result.current.mutate({ alertId: 7, rating: "down" });
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(qb.upsert).toHaveBeenCalledWith(
    { alert_id: 7, user_id: "user-abc", rating: "down" },
    { onConflict: "alert_id,user_id" }
  );
});

it("upserts (updates existing rating) — same alert_id+user_id, new rating", async () => {
  const qb = setupUpsert({ data: null, error: null });

  const { result } = renderHook(() => useSubmitAlertFeedback(), {
    wrapper: createWrapper(),
  });

  // First rating
  await act(async () => {
    result.current.mutate({ alertId: 5, rating: "up" });
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  // Re-rate with down — upsert handles the update
  qb.upsert.mockClear();
  await act(async () => {
    result.current.mutate({ alertId: 5, rating: "down" });
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(qb.upsert).toHaveBeenCalledWith(
    { alert_id: 5, user_id: "user-abc", rating: "down" },
    { onConflict: "alert_id,user_id" }
  );
});

it("throws when not authenticated", async () => {
  (mockSupabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: null },
    error: null,
  });

  const { result } = renderHook(() => useSubmitAlertFeedback(), {
    wrapper: createWrapper(),
  });

  await act(async () => {
    result.current.mutate({ alertId: 1, rating: "up" });
  });

  await waitFor(() => expect(result.current.isError).toBe(true));
  expect((result.current.error as Error).message).toBe("Not authenticated");
});

it("surfaces DB error", async () => {
  setupUpsert({ data: null, error: { message: "constraint violation" } });

  const { result } = renderHook(() => useSubmitAlertFeedback(), {
    wrapper: createWrapper(),
  });

  await act(async () => {
    result.current.mutate({ alertId: 3, rating: "up" });
  });

  await waitFor(() => expect(result.current.isError).toBe(true));
});
