// bet-ingestor.ts — Interface for partner API wager import (Tier A)
// Adapters are implemented when partnerships are secured.
// Currently only a stub adapter exists.

/** Normalized wager from any external source */
export interface NormalizedWager {
  external_bet_id: string;
  provider_key: string;
  description: string;
  wager_type: string;         // spread | moneyline | over_under | prop | parlay
  market_type: string;
  team_name?: string;         // For entity mapping
  player_name?: string;       // For player props
  line?: number;
  odds?: string;
  stake?: number;
  potential_payout?: number;
  placed_at?: string;         // ISO timestamp
  legs?: Array<{
    description: string;
    market_type: string;
    team_name?: string;
    line?: number;
    odds?: string;
  }>;
  mapped_entities?: {
    game_ids: string[];
    team_ids: string[];
    player_names: string[];
  };
}

/** Interface for partner API wager importers */
export interface BetIngestor {
  /** Provider key (e.g., 'draftkings', 'fanduel') */
  provider_key: string;

  /** Fetch open/active wagers for a user */
  fetchOpenWagers(accessToken: string): Promise<NormalizedWager[]>;

  /** Fetch recently settled wagers for reconciliation */
  fetchSettledWagers(accessToken: string, since: Date): Promise<NormalizedWager[]>;
}

// --- Stub Adapters ---

/** DraftKings stub — no public consumer API exists */
export class DraftKingsIngestor implements BetIngestor {
  provider_key = "draftkings";

  async fetchOpenWagers(_accessToken: string): Promise<NormalizedWager[]> {
    console.log("[BetIngestor] DraftKings adapter not yet available — no public consumer API");
    return [];
  }

  async fetchSettledWagers(_accessToken: string, _since: Date): Promise<NormalizedWager[]> {
    console.log("[BetIngestor] DraftKings adapter not yet available — no public consumer API");
    return [];
  }
}

/** FanDuel stub — no public consumer API exists */
export class FanDuelIngestor implements BetIngestor {
  provider_key = "fanduel";

  async fetchOpenWagers(_accessToken: string): Promise<NormalizedWager[]> {
    console.log("[BetIngestor] FanDuel adapter not yet available — no public consumer API");
    return [];
  }

  async fetchSettledWagers(_accessToken: string, _since: Date): Promise<NormalizedWager[]> {
    console.log("[BetIngestor] FanDuel adapter not yet available — no public consumer API");
    return [];
  }
}

/** Registry of available ingestors */
const ingestors: Record<string, BetIngestor> = {
  draftkings: new DraftKingsIngestor(),
  fanduel: new FanDuelIngestor(),
};

/** Get an ingestor by provider key, or null if not available */
export function getIngestor(providerKey: string): BetIngestor | null {
  return ingestors[providerKey] ?? null;
}
