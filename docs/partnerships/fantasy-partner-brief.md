# Fantasy Sports Partner Brief

**Platform:** NORMA — Real-time sports alerts for bettors and fantasy players  
**Version:** August 2026 (updated for football season launch)  
**Contact:** partnerships@norma-app.com

---

## What NORMA Does

NORMA sends push notifications to sports fans at the exact moment it matters. When a player you follow is having a breakout game, NORMA notifies you — with context: score, clock, line movement, and why you should tune in right now.

---

## The Fantasy Integration Concept

Fantasy sports and live sports viewing are deeply connected. A manager benching a player who ends up dropping 40 points, or missing a blowup performance from a waiver wire pick, is one of the most painful experiences in the format.

NORMA connects the dots:

1. A user imports their fantasy roster (DraftKings DFS, Yahoo Fantasy, Sleeper, ESPN Fantasy, Underdog, or any platform).
2. NORMA follows each player on that roster.
3. When any of those players hits a key in-game moment — 4th foul, scoring run, stat milestone, injury — NORMA sends a push notification immediately.

The result: fantasy managers stay informed about their players in real time, even when they are not watching every game.

---

## User Benefit

- **No manual tracking.** Paste your roster once. NORMA handles the rest.
- **Platform-agnostic.** Works for DFS lineups, season-long leagues, and best-ball formats.
- **Moment-specific alerts.** Not score updates — actual signal. Foul trouble on your center matters. A scoring run from your flex pick matters. NORMA surfaces those moments.
- **Multi-sport.** As NORMA expands from NCAA basketball into NBA, MLB, and NFL, the roster follow system travels with it.

---

## How Users Connect Today

The current implementation uses manual roster entry:

1. Open NORMA and go to **Connections**.
2. Under **Fantasy Sports**, tap **Import Roster**.
3. Select your fantasy platform (DraftKings DFS, Yahoo Fantasy, Sleeper, ESPN Fantasy, Underdog, or Other).
4. Paste player names from your lineup — one per line.
5. Tap **Import Roster**.

NORMA immediately begins following every player. The user sees a confirmation: "NORMA will now alert you when these players are having key moments."

This zero-friction path works today with no API agreement required.

---

## The Partnership Ask

Manual entry is the starting point. The full integration would be significantly more valuable with direct API access:

### 1. Roster Sync API

A read-only endpoint that returns a user's active roster (or DFS lineup) given an OAuth token. NORMA would auto-import rosters at lineup-lock time and keep them current throughout the season.

**Benefits for the partner:**
- Users stay engaged with their lineups in real time, increasing session frequency and retention on your platform.
- NORMA drives users back to your platform when players hit alert thresholds — a natural moment to adjust lineups or enter a new contest.

### 2. Co-Marketing

NORMA reaches an audience of active bettors and fantasy players who are demonstrably engaged enough to want real-time alerts. Co-marketing opportunities:

- In-app prompt at lineup-lock: "Get real-time alerts on your players in NORMA."
- Email or push from the partner platform: "You locked a lineup — follow your players in NORMA."
- Featured placement in NORMA's Connections screen for partner platforms with an active API integration.

### 3. Branded Alert Attribution

With an API-backed integration, NORMA can attribute alerts back to the platform:

> "Your DraftKings lineup: Jayson Tatum just scored 11 straight — he is on pace for 48 points."

This drives direct value perception for the partner in every alert.

---

## Integration Scope

| Capability | Manual Entry (Today) | API Integration (Partnership) |
|---|---|---|
| Roster import | User pastes names | Automatic at lineup lock |
| Roster refresh | User re-imports | Automatic throughout season |
| Platform attribution | User selects platform | API-verified |
| Branded alerts | Generic player alerts | Partner-branded moment alerts |
| Co-marketing | None | In-app + email/push |

---

## Technical Notes

- NORMA stores follows in a `follows` table with `entity_type = 'player'` and `source = 'fantasy'` for roster-imported players.
- The alert pipeline already supports player follows as first-class signal sources alongside team and game follows.
- An OAuth-based API integration would use NORMA's existing partner API scaffold (`connections.auth_mode = 'partner_api'`), requiring no architectural changes — only an adapter implementation.

---

## Next Steps

1. Schedule a 30-minute technical call to review the roster API specification.
2. NORMA provides a sandbox environment for integration testing.
3. Agree on co-marketing launch plan alongside the API go-live.

Contact: partnerships@norma-app.com

---

## PrizePicks & Underdog Integration (Shipped)

**Updated:** 2026-08-29 | **Integration tier:** C (import-only)

### What Shipped

PrizePicks and Underdog are now included in NORMA's fantasy roster import flow. This is a **Tier C** integration — meaning users manually paste their entry player names into NORMA. There is no live API connection to either platform.

**What works today:**

1. **Roster/entry import:** `lib/fantasy-platforms.ts` `FANTASY_PLATFORMS` includes PrizePicks and Underdog (also DraftKings DFS, Yahoo Fantasy, Sleeper, ESPN Fantasy). Users select their platform, paste player names (one per line), and tap "Import Roster." NORMA creates `follows` rows with `entity_type = 'player'`, `source = 'fantasy'`, and `fantasy_source` set to the selected platform. Migration `088` added `source`; migration `20260904183000_dfs_fantasy_integration_fixes.sql` added `fantasy_source` and the unique constraint required for upsert. `evaluate-alerts` treats those player follows as candidates when the player is in the current game.

2. **Deep-link scheme registration:** Both `"prizepicks"` and `"underdog"` are registered in `app.json` under `LSApplicationQueriesSchemes`. This allows iOS `Linking.canOpenURL` to correctly detect whether the PrizePicks or Underdog app is installed on the device, enabling the deep-link fallback chain to route to the native app instead of the web fallback.

3. **Provider registry:** PrizePicks and Underdog are seeded in the `provider_registry` table as `category = 'dfs_pickem'`. This category is distinct from `sportsbook`, which allows the geo-compliance layer (FX3) to treat DFS pick'em platforms separately from licensed sportsbooks in states where the two categories have different regulatory treatment.

4. **Constants:** `lib/constants.ts` includes `prizepicks: "PrizePicks"` and `underdog: "Underdog"` in `SPORTSBOOK_NAMES`. This ensures both platforms render correctly in any UI that uses this map for display names.

5. **Parse-bet-slip extension:** The `parse-bet-slip` Edge Function's vision prompt has been extended to recognize PrizePicks entry screenshots — player name, stat projection, more/less selection, entry fee, and payout multiplier. These are mapped to a wager with `market_type = 'player_prop'` and `provider_key = 'prizepicks'`. The `legs` JSONB column stores each projection leg.

### What This Is Not

This integration is **Tier C** (import-only), not Tier A (real-time API sync). Specifically:

- NORMA does **not** have a live connection to PrizePicks or Underdog servers.
- Roster data is not automatically refreshed. Users re-import when their lineup changes.
- Entry status (win/loss) is not tracked via a partner API. NORMA tracks the underlying player stats from ESPN and Sportradar.
- There is no OAuth flow. No user credentials are stored.

### Football-Season Relevance

With NFL and NCAAF now live in NORMA, PrizePicks and Underdog users can import their football pick'em entries and receive player-based alerts during games. A user who imports "Justin Jefferson, CeeDee Lamb, Lamar Jackson" receives alerts when any of those players hits a key in-game moment — the same pipeline that powers wager-based alerts now powers pick'em entry tracking.

### Path to Tier B / Tier A

A Tier B integration would extend `parse-bet-slip` and `ingest-email-wagers` to automatically parse PrizePicks or Underdog entry confirmation emails, removing the manual paste step.

A Tier A integration would require a partner API agreement providing a read-only roster/entry endpoint. The NORMA architecture supports this via the existing `BetIngestor` interface in `_shared/bet-ingestor.ts` and the `connections.auth_mode = 'partner_api'` pattern. No architectural changes are needed when a partnership is secured — only an adapter implementation.

**Next step:** Schedule a technical call to review PrizePicks and Underdog roster API specifications for a potential Tier B/A roadmap. Contact: partnerships@norma-app.com
