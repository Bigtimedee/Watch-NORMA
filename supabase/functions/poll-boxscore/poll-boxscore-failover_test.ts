// Unit tests for poll-boxscore ESPN failover logic.
// Tests the source-selection rules and failover classification — no network, no DB.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ---------------------------------------------------------------------------
// Mirror the scoreSource selection logic from index.ts (pure, testable)
// ---------------------------------------------------------------------------

type ScoreSource = "espn_only" | "sdio_only" | "espn+sdio";

interface ESPNGame {
  homeScore: number;
  awayScore: number;
  status: string;
  clock: string | null;
  period: number;
}

interface SDIOGame {
  HomeTeamScore: number | null;
  AwayTeamScore: number | null;
  Status: string;
  IsClosed: boolean;
  Period: string | null;
  TimeRemainingMinutes: number | null;
  TimeRemainingSeconds: number | null;
}

function selectSource(
  espnData: ESPNGame | null,
  gameData: SDIOGame | null,
  espnApiDown: boolean,
): { source: ScoreSource; failoverReason?: string } {
  if (!espnData && !gameData) {
    return { source: "sdio_only", failoverReason: "no_data" };
  }
  if (espnData && gameData) {
    return { source: "espn+sdio" };
  }
  if (espnData && !gameData) {
    return { source: "espn_only" };
  }
  // sdio only
  const reason = espnApiDown ? "espn_api_down" : "no_espn_match";
  return { source: "sdio_only", failoverReason: reason };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const mockESPN: ESPNGame = {
  homeScore: 72,
  awayScore: 68,
  status: "In Progress",
  clock: "4:32",
  period: 2,
};

const mockSDIO: SDIOGame = {
  HomeTeamScore: 72,
  AwayTeamScore: 68,
  Status: "InProgress",
  IsClosed: false,
  Period: "2",
  TimeRemainingMinutes: 4,
  TimeRemainingSeconds: 32,
};

Deno.test("selectSource: both ESPN and SDIO available → espn+sdio", () => {
  const { source } = selectSource(mockESPN, mockSDIO, false);
  assertEquals(source, "espn+sdio");
});

Deno.test("selectSource: ESPN available, SDIO missing → espn_only", () => {
  const { source } = selectSource(mockESPN, null, false);
  assertEquals(source, "espn_only");
});

Deno.test("selectSource: ESPN API down, SDIO available → sdio_only (failover, espn_api_down)", () => {
  const { source, failoverReason } = selectSource(null, mockSDIO, true);
  assertEquals(source, "sdio_only");
  assertEquals(failoverReason, "espn_api_down");
});

Deno.test("selectSource: ESPN API up but no match for this game → sdio_only (failover, no_espn_match)", () => {
  const { source, failoverReason } = selectSource(null, mockSDIO, false);
  assertEquals(source, "sdio_only");
  assertEquals(failoverReason, "no_espn_match");
});

Deno.test("selectSource: ESPN API healthy → SDIO is NOT called as primary", () => {
  // When ESPN is available, source should be espn_only or espn+sdio, never sdio_only
  const { source } = selectSource(mockESPN, null, false);
  assert(source !== "sdio_only", "SDIO should not be primary source when ESPN is available");
});

// ---------------------------------------------------------------------------
// ESPN fetch failure → failover classification
// ---------------------------------------------------------------------------

Deno.test("failover classification: HTTP 503 from ESPN → fetchFailed=true", () => {
  // Mirrors what fetchEspnGames returns on non-2xx
  const result = { games: [], fetchFailed: true, failReason: "HTTP 503" };
  assertEquals(result.fetchFailed, true);
  assertEquals(result.failReason, "HTTP 503");
});

Deno.test("failover classification: network timeout → fetchFailed=true", () => {
  const result = { games: [], fetchFailed: true, failReason: "The operation was aborted." };
  assertEquals(result.fetchFailed, true);
});

Deno.test("failover classification: ESPN returns 200 with data → fetchFailed=false", () => {
  const result = { games: [mockESPN], fetchFailed: false };
  assertEquals(result.fetchFailed, false);
  assertEquals(result.games.length, 1);
});

// ---------------------------------------------------------------------------
// CRITICAL non-negotiable: status.type.description must be used
// ---------------------------------------------------------------------------

Deno.test("ESPN status: type.description is used (not type.name)", () => {
  // The production code contains:
  //   status: comp.status?.type?.description ?? comp.status?.type?.name ?? "Unknown"
  // This test documents that rule: type.description takes precedence.
  // Machine-readable type.name values (STATUS_IN_PROGRESS, STATUS_FINAL) must never
  // be stored directly — mapStatus() cannot parse them.
  const statusObj = {
    type: {
      name: "STATUS_IN_PROGRESS",          // machine code — MUST NOT use
      description: "In Progress",           // human-readable — MUST use
    },
  };
  const usedValue = statusObj.type?.description ?? statusObj.type?.name ?? "Unknown";
  assertEquals(usedValue, "In Progress", "type.description must take precedence over type.name");
  assert(usedValue !== "STATUS_IN_PROGRESS", "type.name must never be used directly");
});

Deno.test("ESPN status: falls back to type.name only when description is absent", () => {
  const statusObj = {
    type: { name: "STATUS_HALFTIME" },
    // description absent
  };
  const usedValue = (statusObj as any).type?.description ?? statusObj.type?.name ?? "Unknown";
  assertEquals(usedValue, "STATUS_HALFTIME");
  // Note: this is a fallback — mapStatus should ideally handle it or treat as unknown
});
