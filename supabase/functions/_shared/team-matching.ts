// Team name normalization and matching across data sources.
// Uses a tiered scoring system to find the BEST match rather than
// the FIRST match, preventing city-name collisions (e.g., "Los Angeles"
// matching the wrong LA team).

const TEAM_ALIASES: Record<string, string[]> = {
  Connecticut: ["UConn", "CONN", "Huskies"],
  Kentucky: ["UK", "Wildcats"],
  "North Carolina": ["UNC", "N Carolina", "Tar Heels"],
  "Southern California": ["USC", "Trojans"],
  "Central Florida": ["UCF", "Knights"],
  "Louisiana State": ["LSU", "Tigers"],
  "Mississippi": ["Ole Miss", "Rebels"],
  "Mississippi State": ["Miss State", "Miss St", "Bulldogs"],
  "Texas Christian": ["TCU", "Horned Frogs"],
  "Southern Methodist": ["SMU", "Mustangs"],
  "Virginia Commonwealth": ["VCU", "Rams"],
  "Brigham Young": ["BYU", "Cougars"],
  "Pittsburgh": ["Pitt", "Panthers"],
  "Miami (FL)": ["Miami FL", "Miami Florida", "Miami"],
  "Miami (OH)": ["Miami OH", "Miami Ohio"],
  "St. John's": ["Saint John's", "St Johns", "St. John's (NY)", "St John's"],
  "St. Bonaventure": ["Saint Bonaventure", "St Bonaventure", "Bonnies"],
  "St. Joseph's": ["Saint Joseph's", "St Josephs", "Hawks"],
  "St. Mary's": ["Saint Mary's", "St Marys", "Gaels"],
  "St. Peter's": ["Saint Peter's", "St Peters", "Peacocks"],
  "Loyola Chicago": ["Loyola-Chicago", "Loyola (CHI)", "Ramblers"],
  "Loyola Marymount": ["Loyola-Marymount", "LMU", "Lions"],
  "Texas A&M": ["Texas AM", "TAMU", "Aggies"],
  "Hawai'i": ["Hawaii", "Rainbow Warriors"],
  "UNLV": ["Nevada-Las Vegas"],
  "UTEP": ["Texas-El Paso", "Miners"],
  "UAB": ["Alabama-Birmingham", "Blazers"],
  "UNC Greensboro": ["NC Greensboro", "UNCG", "Spartans"],
  "UNC Wilmington": ["NC Wilmington", "UNCW", "Seahawks"],
  "UNC Asheville": ["NC Asheville", "UNCA", "Bulldogs"],
  // Sportradar-specific name variants (market + name format)
  "Arizona State": ["ASU", "Sun Devils"],
  "Florida State": ["FSU", "Seminoles"],
  "Georgia Tech": ["GT", "Yellow Jackets", "Georgia Institute of Technology"],
  "Iowa State": ["ISU", "Cyclones"],
  "Kansas State": ["KSU", "K-State"],
  "Michigan State": ["MSU", "Spartans"],
  "Ohio State": ["OSU", "Buckeyes"],
  "Oklahoma State": ["OkSt", "Cowboys"],
  "Oregon State": ["OregonSt", "Beavers"],
  "Penn State": ["PSU", "Nittany Lions"],
  "San Diego State": ["SDSU", "Aztecs"],
  "Washington State": ["WashSt", "Cougars"],
  "Wichita State": ["Wichita St", "Shockers"],
  "Colorado State": ["ColSt", "CSU"],
  "Boise State": ["BoiseSt", "Broncos"],
  "Fresno State": ["FresnoSt", "Bulldogs"],

  // NBA — name variants seen in The Odds API / broadcast feeds
  "Los Angeles Lakers": ["LA Lakers", "Lakers"],
  "Los Angeles Clippers": ["LA Clippers", "Clippers"],
  "Golden State Warriors": ["GSW", "GS Warriors"],
  "Oklahoma City Thunder": ["OKC Thunder", "OKC"],
  "Philadelphia 76ers": ["Sixers", "76ers"],
  "Portland Trail Blazers": ["Trail Blazers", "Blazers"],
  "Minnesota Timberwolves": ["Timberwolves", "Minnesota Wolves"],
  "New Orleans Pelicans": ["Pelicans"],
  "Memphis Grizzlies": ["Grizzlies"],
  "Indiana Pacers": ["Pacers"],
  "San Antonio Spurs": ["SA Spurs"],
  "New York Knicks": ["NY Knicks"],
  "Brooklyn Nets": ["BK Nets"],

  // MLB — name variants seen in The Odds API / broadcast feeds
  "Arizona Diamondbacks": ["D-backs", "AZ Diamondbacks", "Arizona D-Backs"],
  "Chicago White Sox": ["White Sox", "Chi White Sox"],
  "Chicago Cubs": ["Cubs", "Chi Cubs"],
  "Cleveland Guardians": ["Guardians"],
  "Kansas City Royals": ["KC Royals"],
  "Los Angeles Angels": ["Angels", "LA Angels", "Los Angeles Angels of Anaheim"],
  "Los Angeles Dodgers": ["LA Dodgers"],
  "New York Yankees": ["NY Yankees"],
  "New York Mets": ["NY Mets"],
  "Oakland Athletics": ["A's", "Oakland A's", "Athletics"],
  "San Diego Padres": ["SD Padres"],
  "San Francisco Giants": ["SF Giants"],
  "St. Louis Cardinals": ["STL Cardinals", "St Louis Cardinals"],
  "Tampa Bay Rays": ["TB Rays"],
};

// Build a reverse lookup: lowercased alias -> canonical name
const aliasMap = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
  aliasMap.set(canonical.toLowerCase(), canonical);
  for (const alias of aliases) {
    aliasMap.set(alias.toLowerCase(), canonical);
  }
}

/**
 * Normalize for exact matching: trim, collapse whitespace, normalize quotes/dots.
 */
function normalize(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/['']/g, "'")
    .replace(/\./g, "");
}

/**
 * Normalize for scored matching: lowercase, strip accents, remove punctuation.
 */
function normalizeForScoring(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents (é → e)
    .replace(/[^a-z0-9\s]/g, " ") // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Score how well a DB team matches an external name string.
 * Returns 0 for no match, higher = better match.
 *
 * Tier 100: Exact full name match ("Los Angeles Lakers" == "Los Angeles Lakers")
 * Tier 90:  Exact market-to-market match (DB market == input market portion)
 * Tier 70:  Multi-word market match with word-count validation
 *           (prevents "Purdue" matching "Purdue Fort Wayne")
 * Tier 0:   No match — substring/prefix matches are NOT accepted
 */
export function teamMatchScore(
  dbMarket: string,
  dbFullName: string,
  externalName: string
): number {
  const normDb = normalizeForScoring(dbMarket);
  const normFull = normalizeForScoring(dbFullName);
  const normExternal = normalizeForScoring(externalName);

  // Extract market portion from external name (drop mascot — last word)
  const externalWords = normExternal.split(" ");
  const externalMarket =
    externalWords.length > 1 ? externalWords.slice(0, -1).join(" ") : normExternal;
  const dbFullWords = normFull.split(" ");
  const dbFullMarket =
    dbFullWords.length > 1 ? dbFullWords.slice(0, -1).join(" ") : normFull;

  // Tier 100: Exact full-string match
  if (normFull === normExternal) return 100;

  // Tier 90: Exact market-to-market match (most reliable for "Market Mascot" format)
  if (normDb && normDb === externalMarket) return 90;
  if (dbFullMarket === externalMarket) return 90;

  // Tier 70: DB market matches external market with matching word counts
  //          Handles abbreviation differences while preventing partial city matches.
  //          e.g., "UNC Wilmington" (2 words) ≈ "UNC Wilmington" (2 words) ✓
  //          but "Los Angeles" (2 words) ≠ "Los Angeles Lakers" market portion requires mascot match too
  const dbMarketWords = normDb.split(" ").filter((w) => w.length > 1);
  const externalMarketWords = externalMarket.split(" ").filter((w) => w.length > 1);
  if (
    dbMarketWords.length === externalMarketWords.length &&
    dbMarketWords.length >= 2
  ) {
    const allDbInExternal = dbMarketWords.every((w) => externalMarket.includes(w));
    const allExternalInDb = externalMarketWords.every((w) => normDb.includes(w));
    if (allDbInExternal && allExternalInDb) return 70;
  }

  return 0;
}

// Minimum score required to accept a scored match
const MIN_SCORE_THRESHOLD = 70;

/**
 * Find the best matching team from our DB for an external team name.
 * Uses tiered scoring to find the BEST match, not just the first one.
 * Returns the team row or null.
 */
export function matchTeamName(
  externalName: string,
  dbTeams: Array<{ id: string; name: string; market: string | null; abbreviation: string | null }>
): (typeof dbTeams)[number] | null {
  const norm = normalize(externalName).toLowerCase();

  // Tier 1: Direct exact match on full name, market, or abbreviation
  const direct = dbTeams.find(
    (t) =>
      t.name.toLowerCase() === norm ||
      (t.market && t.market.toLowerCase() === norm) ||
      (t.abbreviation && t.abbreviation.toLowerCase() === norm)
  );
  if (direct) return direct;

  // Tier 2: Alias resolution → then exact match
  const canonical = aliasMap.get(norm);
  if (canonical) {
    const aliased = dbTeams.find(
      (t) =>
        t.name.toLowerCase() === canonical.toLowerCase() ||
        (t.market && t.market.toLowerCase() === canonical.toLowerCase())
    );
    if (aliased) return aliased;
  }

  // Tier 3: Scored matching — find the BEST match above threshold.
  // This replaces the old unsafe substring/fuzzy matching that caused
  // city-name collisions (e.g., "Los Angeles" matching the wrong team).
  let bestTeam: (typeof dbTeams)[number] | null = null;
  let bestScore = 0;

  for (const t of dbTeams) {
    const score = teamMatchScore(t.market ?? "", t.name, externalName);
    if (score > bestScore) {
      bestScore = score;
      bestTeam = t;
    }
  }

  if (bestScore >= MIN_SCORE_THRESHOLD) return bestTeam;

  return null;
}

/**
 * Match a game from external odds data to our games table.
 * Uses home and away team names to find the corresponding game_id.
 */
export function matchGame(
  homeTeamName: string,
  awayTeamName: string,
  dbTeams: Array<{ id: string; name: string; market: string | null; abbreviation: string | null }>,
  dbGames: Array<{ id: string; home_team_id: string | null; away_team_id: string | null; status: string }>
): string | null {
  const homeTeam = matchTeamName(homeTeamName, dbTeams);
  const awayTeam = matchTeamName(awayTeamName, dbTeams);

  if (!homeTeam || !awayTeam) return null;

  const game = dbGames.find(
    (g) => g.home_team_id === homeTeam.id && g.away_team_id === awayTeam.id
  );

  return game?.id ?? null;
}
