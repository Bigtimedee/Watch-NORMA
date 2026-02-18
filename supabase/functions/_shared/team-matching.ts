// Team name normalization for matching across data sources
// Maps common variations to canonical names used in our teams table
// Includes SportsDataIO and Sportradar naming conventions

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
};

// Build a reverse lookup: lowercased alias -> canonical name
const aliasMap = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
  aliasMap.set(canonical.toLowerCase(), canonical);
  for (const alias of aliases) {
    aliasMap.set(alias.toLowerCase(), canonical);
  }
}

function normalize(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/['']/g, "'")
    .replace(/\./g, "");
}

/**
 * Find the best matching team from our DB for an external team name.
 * Returns the team row or null.
 */
export function matchTeamName(
  externalName: string,
  dbTeams: Array<{ id: string; name: string; market: string | null; abbreviation: string | null }>
): (typeof dbTeams)[number] | null {
  const norm = normalize(externalName).toLowerCase();

  // Direct match on name or market
  const direct = dbTeams.find(
    (t) =>
      t.name.toLowerCase() === norm ||
      (t.market && t.market.toLowerCase() === norm) ||
      (t.abbreviation && t.abbreviation.toLowerCase() === norm)
  );
  if (direct) return direct;

  // Check alias map
  const canonical = aliasMap.get(norm);
  if (canonical) {
    const aliased = dbTeams.find(
      (t) =>
        t.name.toLowerCase() === canonical.toLowerCase() ||
        (t.market && t.market.toLowerCase() === canonical.toLowerCase())
    );
    if (aliased) return aliased;
  }

  // Fuzzy: check if external name contains or is contained in a team name
  const fuzzy = dbTeams.find((t) => {
    const tName = t.name.toLowerCase();
    const tMarket = t.market?.toLowerCase() ?? "";
    return (
      norm.includes(tName) ||
      tName.includes(norm) ||
      norm.includes(tMarket) ||
      tMarket.includes(norm)
    );
  });
  if (fuzzy) return fuzzy;

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
