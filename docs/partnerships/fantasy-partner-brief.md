# Fantasy Sports Partner Brief

**Platform:** NORMA — Real-time sports alerts for bettors and fantasy players  
**Version:** June 2026  
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
