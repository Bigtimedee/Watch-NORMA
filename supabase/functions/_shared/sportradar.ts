// Sportradar NCAAMB v8 API Client
// Supplementary data source for richer PBP events and Game Summary stats

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

async function sportradarFetch<T>(path: string): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${SPORTRADAR_BASE}${path}${separator}api_key=${SPORTRADAR_KEY}`;
  callCount++;
  console.log(`[Sportradar] Call #${callCount}: GET ${path}`);

  const res = await fetch(url);
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

/** Fetch daily schedule */
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

/** Fetch game boxscore */
export function fetchBoxscore(
  gameId: string
): Promise<SportradarBoxscoreResponse> {
  return sportradarFetch<SportradarBoxscoreResponse>(
    `/games/${gameId}/boxscore.json`
  );
}

/** Fetch game play-by-play */
export function fetchPbp(
  gameId: string
): Promise<SportradarPbpResponse> {
  return sportradarFetch<SportradarPbpResponse>(
    `/games/${gameId}/pbp.json`
  );
}

/** Fetch game summary (rich stats) */
export function fetchSummary(
  gameId: string
): Promise<SportradarSummaryResponse> {
  return sportradarFetch<SportradarSummaryResponse>(
    `/games/${gameId}/summary.json`
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
