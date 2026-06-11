// Sportradar Multi-Sport API Client
// Supports NCAAMB, NBA, and MLB via sport-specific base URLs and API keys.
// Each sport may have its own Sportradar product license and key.

export type SportKey = "ncaam" | "nba" | "mlb";

const SPORTRADAR_BASES: Record<SportKey, string> = {
  ncaam: "https://api.sportradar.com/ncaamb/production/v8/en",
  nba:   "https://api.sportradar.com/nba/production/v8/en",
  mlb:   "https://api.sportradar.com/mlb/production/v8/en",
};

// Each sport may have its own API key; fall back to the shared key
function getSportradarKey(sport: SportKey): string {
  if (sport === "nba") {
    return Deno.env.get("SPORTRADAR_NBA_API_KEY") ?? Deno.env.get("SPORTRADAR_API_KEY") ?? "";
  }
  if (sport === "mlb") {
    return Deno.env.get("SPORTRADAR_MLB_API_KEY") ?? Deno.env.get("SPORTRADAR_API_KEY") ?? "";
  }
  return Deno.env.get("SPORTRADAR_API_KEY") ?? "";
}

// Keep backward-compatible single-sport constants for callers that haven't migrated
const SPORTRADAR_BASE =
  "https://api.sportradar.com/ncaamb/production/v8/en";
const SPORTRADAR_KEY = Deno.env.get("SPORTRADAR_API_KEY") ?? "";

// Current NCAA season year
const SEASON_YEAR = 2026;

// Track API calls per invocation for quota awareness
let callCount = 0;

// Optional Supabase client for rate budget logging
// Set via setRateBudgetClient() at function startup
let _rateBudgetClient: any = null;

/** Set a Supabase client for rate budget tracking (optional) */
export function setRateBudgetClient(client: any): void {
  _rateBudgetClient = client;
}

/** Record a Sportradar API call in the rate budget log */
async function recordApiCall(): Promise<void> {
  if (!_rateBudgetClient) return;
  try {
    const windowStart = new Date(
      Math.floor(Date.now() / 60_000) * 60_000
    ).toISOString();

    // Try to insert a new row; if the window already exists, increment calls_made
    const { data: existing } = await _rateBudgetClient
      .from("api_rate_log")
      .select("id, calls_made")
      .eq("provider", "sportradar")
      .eq("window_start", windowStart)
      .maybeSingle();

    if (existing) {
      await _rateBudgetClient
        .from("api_rate_log")
        .update({ calls_made: existing.calls_made + 1 })
        .eq("id", existing.id);
    } else {
      await _rateBudgetClient
        .from("api_rate_log")
        .insert({ provider: "sportradar", window_start: windowStart, calls_made: 1 });
    }
  } catch {
    // Non-critical — don't block the API call
  }
}

/** Sport-aware Sportradar fetch — selects the correct base URL and API key */
async function sportradarFetchSport<T>(sport: SportKey, path: string): Promise<T> {
  const base = SPORTRADAR_BASES[sport];
  const key = getSportradarKey(sport);
  if (!key) {
    throw new Error(`No Sportradar API key configured for sport '${sport}'`);
  }
  const separator = path.includes("?") ? "&" : "?";
  const url = `${base}${path}${separator}api_key=${key}`;
  callCount++;
  console.log(`[Sportradar:${sport}] Call #${callCount}: GET ${path}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Sportradar API error ${res.status} for ${sport}/${path}: ${body}`
    );
  }

  recordApiCall().catch(() => {});
  return res.json() as Promise<T>;
}

async function sportradarFetch<T>(path: string): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${SPORTRADAR_BASE}${path}${separator}api_key=${SPORTRADAR_KEY}`;
  callCount++;
  console.log(`[Sportradar] Call #${callCount}: GET ${path}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Sportradar API error ${res.status} for ${path}: ${body}`
    );
  }

  // Record call for rate budget tracking (fire-and-forget)
  recordApiCall().catch(() => {});

  return res.json() as Promise<T>;
}

/** Reset call counter (call at start of each function invocation) */
export function resetCallCount(): void {
  callCount = 0;
}

/** Get current call count for logging */
export function getCallCount(): number {
  return callCount;
}

// --- API Helper Functions ---

/** Fetch daily schedule (legacy NCAA-only) */
export function fetchSchedule(
  year: number,
  month: number,
  day: number
): Promise<SportradarScheduleResponse> {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return sportradarFetch<SportradarScheduleResponse>(
    `/games/${year}/${mm}/${dd}/schedule.json`
  );
}

/** Fetch daily schedule with sport selection */
export function fetchScheduleForSport(
  sport: SportKey,
  year: number,
  month: number,
  day: number
): Promise<SportradarScheduleResponse> {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return sportradarFetchSport<SportradarScheduleResponse>(
    sport,
    `/games/${year}/${mm}/${dd}/schedule.json`
  );
}

/** Fetch game boxscore */
export function fetchBoxscore(
  gameId: string
): Promise<SportradarBoxscoreResponse> {
  return sportradarFetch<SportradarBoxscoreResponse>(
    `/games/${gameId}/boxscore.json`
  );
}

/** Fetch game play-by-play (legacy NCAA-only) */
export function fetchPbp(
  gameId: string
): Promise<SportradarPbpResponse> {
  return sportradarFetch<SportradarPbpResponse>(
    `/games/${gameId}/pbp.json`
  );
}

/** Fetch game play-by-play with sport selection */
export function fetchPbpForSport(
  sport: SportKey,
  gameId: string
): Promise<SportradarPbpResponse> {
  return sportradarFetchSport<SportradarPbpResponse>(
    sport,
    `/games/${gameId}/pbp.json`
  );
}

/** Fetch game summary (rich stats) — legacy NCAA-only */
export function fetchSummary(
  gameId: string
): Promise<SportradarSummaryResponse> {
  return sportradarFetch<SportradarSummaryResponse>(
    `/games/${gameId}/summary.json`
  );
}

/** Fetch game summary with sport selection */
export function fetchSummaryForSport(
  sport: SportKey,
  gameId: string
): Promise<SportradarSummaryResponse> {
  return sportradarFetchSport<SportradarSummaryResponse>(
    sport,
    `/games/${gameId}/summary.json`
  );
}

/** Fetch MLB game summary (returns SportradarMLBSummaryResponse) */
export function fetchMLBSummary(
  gameId: string
): Promise<SportradarMLBSummaryResponse> {
  return sportradarFetchSport<SportradarMLBSummaryResponse>(
    "mlb",
    `/games/${gameId}/summary.json`
  );
}

/** Fetch MLB play-by-play */
export function fetchMLBPbp(
  gameId: string
): Promise<SportradarMLBPbpResponse> {
  return sportradarFetchSport<SportradarMLBPbpResponse>(
    "mlb",
    `/games/${gameId}/pbp.json`
  );
}

/** Fetch all teams for the current season */
export function fetchSeasonTeams(): Promise<SportradarTeamsResponse> {
  return sportradarFetch<SportradarTeamsResponse>(
    `/seasons/${SEASON_YEAR}/REG/teams.json`
  );
}

// --- Response Type Interfaces ---

export interface SportradarScheduleResponse {
  date: string;
  games: SportradarScheduleGame[];
}

export interface SportradarScheduleGame {
  id: string;
  status: string; // 'scheduled', 'inprogress', 'halftime', 'closed', etc.
  coverage: string; // 'full', 'extended_boxscore'
  scheduled: string; // ISO datetime
  home_points?: number;
  away_points?: number;
  title?: string;
  conference_game?: boolean;
  home: SportradarTeamRef;
  away: SportradarTeamRef;
  venue?: {
    id: string;
    name: string;
    city: string;
    state: string;
  };
  broadcast?: {
    network: string;
  };
}

export interface SportradarTeamRef {
  id: string;
  name: string;
  alias: string;
  market: string;
}

export interface SportradarTeamsResponse {
  season: { year: number; type: string };
  teams: SportradarTeamFull[];
}

export interface SportradarTeamFull {
  id: string;
  name: string;
  market: string;
  alias: string;
  conference: { id: string; name: string; alias: string };
}

export interface SportradarBoxscoreResponse {
  id: string;
  status: string;
  coverage: string;
  home: SportradarBoxscoreTeam;
  away: SportradarBoxscoreTeam;
  clock?: string;
  half?: number;
}

export interface SportradarBoxscoreTeam {
  id: string;
  name: string;
  market: string;
  points: number;
}

export interface SportradarPbpResponse {
  id: string;
  status: string;
  coverage: string;
  periods: SportradarPbpPeriod[];
}

export interface SportradarPbpPeriod {
  id: string;
  number: number;
  type: string; // 'half', 'overtime'
  events: SportradarPbpEvent[];
}

export interface SportradarPbpEvent {
  id: string;
  type: string; // 'turnover', 'twopointmade', 'threepointmade', 'freethrowmade', 'foul', etc.
  clock: string;
  description: string;
  attribution?: { id: string; name: string; market: string };
  player?: { full_name: string; jersey_number: string };
  scoring_play?: boolean;
  points?: number;
  home_points?: number;
  away_points?: number;
  updated?: string;
  wall_clock?: string;
  event_type?: string;
  number?: number;
}

export interface SportradarSummaryResponse {
  id: string;
  status: string;
  coverage: string;
  home: SportradarSummaryTeam;
  away: SportradarSummaryTeam;
  clock?: string;
  half?: number;
}

export interface SportradarSummaryTeam {
  id: string;
  name: string;
  market: string;
  points: number;
  statistics: SportradarTeamStatistics;
  players: SportradarSummaryPlayer[];
}

export interface SportradarTeamStatistics {
  field_goals_made: number;
  field_goals_att: number;
  field_goals_pct: number;
  three_points_made: number;
  three_points_att: number;
  three_points_pct: number;
  free_throws_made: number;
  free_throws_att: number;
  free_throws_pct: number;
  rebounds: number;
  offensive_rebounds: number;
  defensive_rebounds: number;
  assists: number;
  turnovers: number;
  steals: number;
  blocks: number;
  personal_fouls: number;
  bench_points?: number;
  points_off_turnovers?: number;
  biggest_lead?: number;
  fast_break_points?: number;
  second_chance_points?: number;
  possessions?: number;
  true_shooting_pct?: number;
  effective_fg_pct?: number;
}

export interface SportradarSummaryPlayer {
  id: string;
  full_name: string;
  jersey_number: string;
  starter: boolean;
  played: boolean;
  on_court: boolean;
  fouled_out: boolean;
  ejected: boolean;
  statistics: {
    minutes: string;
    field_goals_made: number;
    field_goals_att: number;
    three_points_made: number;
    three_points_att: number;
    free_throws_made: number;
    free_throws_att: number;
    rebounds: number;
    assists: number;
    turnovers: number;
    steals: number;
    blocks: number;
    personal_fouls: number;
    points: number;
  };
}

// --- MLB-Specific Response Types ---

export interface SportradarMLBPbpEvent {
  id: string;
  type: string; // 'pitch', 'at_bat_start', 'at_bat_complete', 'run_scored', 'inning_start', 'inning_end', 'game_over', 'pitching_substitution', 'stolen_base'
  inning: number;
  half_inning: "T" | "B"; // T = top (away bats), B = bottom (home bats)
  pitcher?: { id: string; full_name: string; pitch_count: number };
  batter?: { id: string; full_name: string };
  pitch_type?: string;     // "FF", "SL", "CH", etc.
  pitch_speed?: number;
  pitch_result?: string;   // "ball", "strike", "foul", "in_play"
  count?: { balls: number; strikes: number };
  outs?: number;
  runners?: Array<{ starting_base: number; ending_base: number; player: { full_name: string } }>;
  description?: string;
  home_runs?: number;
  away_runs?: number;
}

export interface SportradarMLBPbpInning {
  number: number;
  sequence: number;
  events: SportradarMLBPbpEvent[];
}

export interface SportradarMLBPbpResponse {
  id: string;
  status: string;
  coverage: string;
  innings: SportradarMLBPbpInning[];
}

export interface SportradarMLBPitcher {
  id: string;
  full_name: string;
  win: boolean;
  loss: boolean;
  save: boolean;
  statistics: {
    pitching: {
      pitch_count: number;
      innings_pitched: number; // fractional, e.g., 6.666 = 6 and 2/3 innings
      earned_runs: number;
      runs: number;
      hits: number;
      walks: number;
      strikeouts: number;
      era: number;
      whip: number;
    };
  };
}

export interface SportradarMLBBatter {
  id: string;
  full_name: string;
  statistics: {
    hitting: {
      at_bats: number;
      runs: number;
      hits: number;
      rbi: number;
      home_runs: number;
      walks: number;
      strikeouts: number;
      avg: number;
      ops: number;
    };
  };
}

export interface SportradarMLBTeamSummary {
  id: string;
  name: string;
  market: string;
  runs: number;
  hits: number;
  errors: number;
  starting_pitcher: SportradarMLBPitcher;
  pitchers: SportradarMLBPitcher[];
  batters: SportradarMLBBatter[];
}

export interface SportradarMLBSummaryResponse {
  id: string;
  status: string;
  coverage: string;
  inning: number;
  inning_half: "T" | "B";
  outs: number;
  home: SportradarMLBTeamSummary;
  away: SportradarMLBTeamSummary;
  runners_on_base: Array<{ base: number; player: { full_name: string } }>;
}
