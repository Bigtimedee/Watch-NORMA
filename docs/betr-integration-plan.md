# Betr (Betr Picks) Integration Plan

**Status:** Plan only — not implemented  
**Date:** 2026-09-08  
**Owner:** Eng + Dave (product / geo sign-off)  
**Canonical key:** `betr`  
**Category:** `dfs_pickem` (same bucket as PrizePicks / Underdog)

This document is the ticket-ready plan for adding **Betr Picks** as NORMA's third DFS pick'em provider. It does not claim a public consumer API, a custom URL scheme, affiliate query params, or an email format that we have not seen.

**Why this path:** There is no `docs/integrations/` folder. Partner briefs live under `docs/partnerships/`; engineering plans live next to `docs/NORMA-Partnership-Plan.md` and `docs/football-season-launch-plan.md`. This file is the engineering/product plan. Cross-links: [`04_DATA_AND_INTEGRATIONS.md`](watch-norma-context/04_DATA_AND_INTEGRATIONS.md), [`NORMA-Partnership-Plan.md`](NORMA-Partnership-Plan.md) Tier 5, [`09_ROADMAP_KNOWN_GAPS_AND_DECISIONS.md`](watch-norma-context/09_ROADMAP_KNOWN_GAPS_AND_DECISIONS.md), [`partnerships/fantasy-partner-brief.md`](partnerships/fantasy-partner-brief.md).

**Do not confuse with BetRivers.** BetRivers is already mapped in `email-parser.ts` (`"betrivers.com" → "betrivers"`). Betr is a different operator (`betr.app`). Domain matching uses `String.includes` — never register a substring like `"betr"` as a sender domain.

---

## 1. Goal and non-goals

### Goal (v1)

Ship Betr Picks as a **Tier B/C** `dfs_pickem` provider, mirroring the PrizePicks / Underdog path that already shipped:

- Connections → Pick'em & DFS: "I use Betr" (no OAuth, no credentials)
- Fantasy roster / entry paste with `follows.fantasy_source = 'betr'`
- Slip/screenshot parse heuristics via `parse-bet-slip`
- Email-forward parse **only if** we obtain a real confirmation email (otherwise domain stub + Claude fallback)
- Alert / sponsor CTAs that say **Play on Betr** / **Open Betr**, never **Bet Now on Betr**
- Auction CTA rewrite through `buildPickEmLink` / `contextualizeSponsorCtaUrl`
- `sportsbook_restrictions` row so `useSportsbookGeo` is not fail-closed for `betr`

v1 is the **Betr Picks** pick'em product (MORE/LESS player props, 2–10 pick entries, real-money in allowed states). That is the same user job as PrizePicks / Underdog.

### Non-goals (v1)

| Out of scope | Why |
|---|---|
| Public / partner consumer API for entries or rosters | No public developer program found. `api.betr.app` is a private backend (anonymous 403/500). Third-party odds aggregators (e.g. Betstamp) are not a NORMA data source and are not a user-roster API. Do not invent a `BetIngestor` adapter that pretends to sync. |
| Betr SSBK / licensed sportsbook sync | Separate product, different legal footprint (help-center matrix: Social Sports is live in states where Picks is **not**, e.g. OH). Optional later track — see §1.1. |
| Betr Arcade / Social Casino | Not pick'em. Not a NORMA alert surface. |
| GPS geofence | Existing policy: timezone → state via `inferStateFromTimezone`. Age minimums are not encoded in `sportsbook_restrictions` (same as PrizePicks / Underdog). |
| Claiming a `betr://` (or similar) custom scheme | Not observed in public docs. Mark TBD until device / IPA / AppsFlyer verification. |
| Copying PrizePicks or Underdog state lists | Betr's footprint is **not** the same (no NY; TN disputed across sources). |
| Treating planned work as shipped | This file is a plan. Do not update UX copy in `02_USER_EXPERIENCE_AND_FLOWS.md` as if Betr is live. |

### 1.1 Later / optional: SSBK sportsbook track

Betr's consumer app is a "super app": **Picks · Sportsbook · Casino · Arcade** ([betr.app/picks](https://www.betr.app/picks)). Play Store copy (updated 2026-09-04) describes **Betr SSBK** as social sports games. The help-center matrix (updated week of 2026-09-08) splits **Picks** vs **Social Sports** vs Arcade vs Social Casino per state.

If NORMA later adds SSBK as a traditional sportsbook:

- Use a **different** `provider_key` (recommend `betr_ssbk` or `betr_sportsbook`). Do not reuse `betr`.
- Seed a **different** `sportsbook_restrictions` row from the Social Sports column, not the Picks column.
- Category = `sportsbook`, not `dfs_pickem`.
- CTA copy may then be "Bet Now" **only** for that key — never for `betr` (Picks).

v1 does not implement this.

---

## 2. User journeys

All journeys reuse existing screens. Betr should appear wherever PrizePicks / Underdog already appear — including a few places that **hardcode** those two keys instead of reading `PICKEM_PROVIDER_KEYS`.

### 2.1 Connections picker (Tier C)

1. User opens Connections → **Pick'em & DFS** (`app/(tabs)/connections/pickem.tsx`).
2. Catalog query is already `useStreamingProviders("sportsbook", { category: "dfs_pickem" })` plus `isPickEmProvider(p.key)`.
3. User toggles Betr connected. Row lands in `connections` with `provider_key = 'betr'`. No credentials.

**Hardcoded gaps to fix in the implementation PR (not this PR):**

- `app/(tabs)/connections/index.tsx` counts pick'em with `provider_key === "prizepicks" || "underdog"` and excludes those keys from the sportsbook count. Must switch to `isPickEmProvider`.
- Same file subtitle: `"PrizePicks, Underdog, and daily fantasy"` — add Betr.
- `pickem.tsx` body copy names only PrizePicks / Underdog.

### 2.2 Roster / player-follow import (Tier C)

1. Connections → Import Roster (`ImportRosterSheet`).
2. Platform picker reads `FANTASY_PLATFORMS`. Add `{ value: "betr", label: "Betr" }` (or `"Betr Picks"` — see §3).
3. `buildRosterFollowRows()` writes `source: "fantasy"`, `fantasy_source: "betr"`.
4. `evaluate-alerts` Stage 0 already loads `entity_type = 'player'` follows. No new alert rule is required if the player name matches Sportradar summary / ESPN boxscore.

### 2.3 Slip / screenshot parse (Tier B)

`parse-bet-slip` vision prompt currently enumerates `"prizepicks", "underdog"`. Add `"betr"`. Betr slips are MORE/LESS player props with an entry fee and a payout multiplier — same shape as PrizePicks. Map to `market_type = 'player_prop'`, `provider_key = 'betr'`, legs in `wagers.legs`.

`ReviewScannedWagersSheet` `ALL_BOOKS` **hardcodes** `prizepicks` / `underdog` instead of spreading `PICKEM_PROVIDER_KEYS`. Add `betr` (or, better, derive the list from the constant so the next operator is one edit).

### 2.4 Email forward parse (Tier B, gated on fixtures)

`ingest-email-wagers` → `email-parser.ts`:

1. Add sender domains **only after** a real sample (candidates to verify: `betr.app`, possibly `noreply@…`). **Do not** add the bare token `betr`.
2. Route `case "betr": return parsePickEmEntry(...)` once we confirm the body looks like MORE/LESS legs. Existing `PICKEM_LEG_RE` may work; do not assume it does.
3. Until a sample exists: leave domain unmapped and document the capture steps in §6. Claude fallback can still run if the user forwards mail and we later add the domain.

### 2.5 Alert CTAs / BetNow-equivalent

`defaultCtaLabel` already uses style `"open"` for `isPickEmProvider` → `"Open PrizePicks"`, never `"Bet Now on PrizePicks"`. For Betr:

- Eligible: **"Play on Betr"** (product ask) or **"Open Betr"** (current pick'em convention). Implementation PR should pick one and test it. Do not ship `"Bet Now on Betr"`.
- Ineligible / unknown geo: `"Not available in your region"` (existing fail-closed copy).

`SponsorCTAButton` already forces `style: "open"`. `BetNowButton` inherits pick'em style from `isPickEmProvider`. Adding `betr` to `PICKEM_PROVIDER_KEYS` is the load-bearing change.

`useSportsbookGeo("betr")` is fail-closed without a `sportsbook_restrictions` row. Phase A must seed that row or every Betr CTA is dead.

### 2.6 Auction sponsor URL rewrite

`contextualizeSponsorCtaUrl` → `detectPickEmProviderFromUrl` → `buildPickEmLink`. Today detection is `url.includes("prizepicks")` / `"underdog"`. Add hosts we actually observe (`betr.app`, `picks.betr.app`, `betr.onelink.me`) — not a guessed path.

Sport-scoped board URLs (PrizePicks ` /board?sport=NFL`, Underdog `/picks?sport=nfl`) are **not confirmed** for Betr. v1 rewrite target is the best **verified** landing URL (likely OneLink or `https://www.betr.app/picks`), with sport as a query **only if** we confirm Betr honors it.

---

## 3. Data model / keys

| Field | v1 value | Notes |
|---|---|---|
| `provider_key` | **`betr`** | Short, matches store/package branding. Prefer over `betr_picks` so `PICKEM_PROVIDER_KEYS` stays one token. Reserve `betr_ssbk` / `betr_sportsbook` for the later sportsbook track. |
| `provider_registry.category` | `dfs_pickem` | Same as PrizePicks / Underdog (migration 092). |
| `provider_registry.provider_type` | `sportsbook` | Existing pick'em rows use this + category discriminator. Do not invent a new `provider_type`. |
| `provider_registry.name` | `Betr` | UI short name. Connections subtitle / picker can say "Betr Picks". |
| `SPORTSBOOK_NAMES.betr` | `"Betr"` | `defaultCtaLabel` → "Play on Betr" / "Open Betr". |
| `FANTASY_PLATFORMS` | `{ value: "betr", label: "Betr Picks" }` | Picker label can be the longer product name. |
| `follows.fantasy_source` | `betr` | Column already exists (`20260904183000`). Comment on that column should add `betr`. |
| `sportsbook_restrictions.sportsbook_key` | `betr` | Required or geo is fail-closed. |
| `auth_mode` | `deep_link_only` | No OAuth. |

Display: **"Betr"** in CTAs and brand maps; **"Betr Picks"** in the fantasy picker and Connections subtitle. Both refer to the same `betr` key.

---

## 4. What already exists (do not rebuild)

Verified on `main` 2026-09-08:

| Surface | File | How Betr plugs in |
|---|---|---|
| Platform list | `lib/fantasy-platforms.ts` | Append to `FANTASY_PLATFORMS` + `PICKEM_PROVIDER_KEYS` |
| Brand + CTA | `lib/sportsbook-brands.ts` | Colors + `isPickEmProvider` already blocks "Bet Now" |
| Server brand twin | `supabase/functions/_shared/sportsbook-links.ts` | `PICKEM_TEMPLATES`, `SPORTSBOOK_BRAND_COLORS`, `detectPickEmProviderFromUrl`, `contextualizeSponsorCtaUrl` |
| Geo hook | `hooks/useSportsbookGeo.ts` | Fail-closed; needs restrictions row |
| Roster import | `components/ImportRosterSheet.tsx`, `lib/roster-import.ts` | Reads `FANTASY_PLATFORMS` |
| Pick'em connections | `app/(tabs)/connections/pickem.tsx` | Queries `category: "dfs_pickem"` |
| Slip OCR | `supabase/functions/parse-bet-slip/index.ts` | Prompt enumeration |
| Email parse | `supabase/functions/_shared/email-parser.ts` | Domain map + `parsePickEmEntry` |
| Wager picker | `components/AddWagerSheet.tsx` | Spreads `PICKEM_PROVIDER_KEYS` (good) |
| Scan review | `components/ReviewScannedWagersSheet.tsx` | Hardcoded `ALL_BOOKS` (must update) |
| iOS schemes | `app.json` `LSApplicationQueriesSchemes` | Add **only** a verified scheme |
| Sync tests | `__tests__/prizepicks-integration.test.ts`, `lib/__tests__/sportsbook-brands.test.ts`, `sportsbook-links_test.ts` | Extend or add `betr-integration.test.ts` |
| PP/UD seed | `092_prizepicks_underdog_dfs_pickem.sql`, `20260904183000_dfs_fantasy_integration_fixes.sql` | **New** timestamped migration; do not edit applied files |

No client feature flag gates PrizePicks / Underdog. No `EXPO_PUBLIC_*` pick'em flag exists. Analytics is `trackEvent` → `app_events` (`first_connection_added`, `bet_now_tap`, etc.).

---

## 5. Work breakdown (phased tickets)

Implementation is a **later PR**. Each phase below is one ticket (or a tight pair) with acceptance criteria.

### Phase A — Provider seed, brands, keys, geo, store / OneLink

**Files (expected):** new timestamped migration (run `ls supabase/migrations/ | sort | tail -5` first; prefer `YYYYMMDDHHMMSS_betr_dfs_pickem.sql`); `lib/fantasy-platforms.ts`; `lib/constants.ts`; `lib/sportsbook-brands.ts`; `_shared/sportsbook-links.ts`; `app/(tabs)/connections/index.tsx`; `pickem.tsx`; `app.json` only if a scheme is verified.

**A1. `provider_registry` seed**

Insert `betr` into `streaming_providers` (compat view = `provider_registry`) with `category = 'dfs_pickem'`, `auth_mode = 'deep_link_only'`.

Verified public URLs (2026-09-08):

| Slot | Value | Source |
|---|---|---|
| `web_url` / marketing | `https://www.betr.app/picks` | Official Picks page |
| Board / app-web | `https://picks.betr.app` | Partner page "I already have an account"; page is an app shell, not a full web board |
| iOS store | `https://apps.apple.com/us/app/betr-picks-daily-fantasy/id1635215598` | App Store id **1635215598** (task + live page title "Betr - Sports & Gaming") |
| Android package | `app.instabet.betr` | [Play Store](https://play.google.com/store/apps/details?id=app.instabet.betr) |
| OneLink (marketing) | `https://betr.onelink.me/VZxy/betrapp` | Observed on Betr partner landing (`picks-partner`) in public crawl; treat as **store/app open**, not a sport-scoped board |
| Native `ios_scheme` | **TBD** | Do not invent `betr://`. See §6. |
| `universal_link` | OneLink **or** `https://www.betr.app/picks` until a documented Universal Link is confirmed | Prefer the URL that actually opens the installed app |
| Affiliate query key | **TBD** | Partner page uses `promocode=` on a **web** form, not confirmed as an in-app attribution param. Do not copy PrizePicks `promo` or Underdog `ref`. |

**A2. Brand maps**

Add `betr` to client `SPORTSBOOK_BRAND_COLORS` and server twin. **Hex values TBD** — pull from Betr brand kit, app icon, or a screenshot; do not guess. Keep both maps in sync (`prizepicks-integration.test.ts` pattern).

**A3. `FANTASY_PLATFORMS` / `PICKEM_PROVIDER_KEYS`**

`PICKEM_PROVIDER_KEYS = ["prizepicks", "underdog", "betr"]`.

**A4. Geo restrictions seed**

`useSportsbookGeo` fail-closes when no row exists. Seed `sportsbook_restrictions` for `betr` from **cited** sources. Do not copy PrizePicks / Underdog arrays.

**Primary source (product matrix, updated week of 2026-09-08):**  
[Which states does Betr operate in?](https://help.betr.app/en/articles/9461963-which-states-allow-betr-picks) — table columns Picks / Arcade / Social Sports / Social Casino.

**Picks = Yes (candidate seed, 33 states + DC):**

```
AK AL AR AZ CA CO DC DE FL GA IL IN KS KY MA MN
NC ND NE NH NM OK OR RI SC SD TN TX UT VA VT WI WV WY
```

Asterisk in that article = **Group Play (peer-to-peer) only** (not house pick'em):  
`AL AR AZ CO DC DE FL GA IL KS KY NH TN VA WV WY`  
NORMA still deep-links to Picks in those states — the user can play Group Play. Same policy as Underdog "classic Pick'em OR Champions" (we exclude drafts-only, we do **not** exclude peer-to-peer-only).

**Cross-check — Play Store + App Store listing (Play updated 2026-09-04):**  
"33 states & DC" enumerated as:

```
AL AK AR AZ CA CO DC DE FL GA IL IN KS KY MA MN
NE NM NH NC ND OK OR RI SC SD TX UT VT VA WV WI WY
```

That list is **32 states + DC** (marketing count is off by one) and **omits TN**. Help center includes TN.

**Recommended seed for the implementation PR:** help-center **Picks = Yes** list above, with a migration comment citing both URLs and this note:

> TN is Yes on help.betr.app (retrieved 2026-09-08) and absent from the Play/App Store "Where To Play" enumeration (Play updated 2026-09-04). Confirm in-app from a TN account before treating TN as final. If uncertain at ship time, **drop TN** (fail-closed is safer than advertising a banned state).

**Do not seed:** CT, HI, IA, ID, LA, MD, ME, MI, MO, MS, MT, NJ, NV, NY, OH, PA, WA (Picks = No on the help-center matrix). Several of those still have Arcade or Social Sports — irrelevant for `betr`.

Age notes (help center identity article, not encoded in the table — same as PP/UD): 18+ general; 19+ AL & CO; 21+ AZ, MA, VA.

College-sport subset is **narrower** ([help article](https://help.betr.app/en/articles/9828611-which-states-does-betr-picks-offer-college-sports)). `sportsbook_restrictions` is state-only today. Do not encode per-sport blocks in v1; call it out in the migration comment.

**Verification checklist (required before merge of the implementation PR):**

1. Re-open the help-center matrix; screenshot / quote the Picks column date.
2. Re-read Play Store and App Store "Where To Play" strings.
3. Resolve TN (include vs omit).
4. Confirm Group Play-only states should remain eligible (recommended: yes).
5. Dave sign-off on the array in the migration comment.

**A5. Deep-link / OneLink strategy (v1)**

Fallback chain (existing `deep-links.ts` policy):

1. Native scheme **if verified** via `LSApplicationQueriesSchemes` + `Linking.canOpenURL`.
2. Else Universal Link / OneLink (`betr.onelink.me/...`).
3. Else App Store / Play Store URLs above.

v1 is expected to be **store/OneLink-heavy**. Do not register a guessed scheme in `app.json` — a bad scheme does not crash, but it pollutes `canOpenURL` and the PrizePicks test's "registers schemes" assertions.

`buildPickEmLink("betr", …)`:

- `web_fallback`: `https://www.betr.app/picks` (verified).
- `universal_link`: OneLink or `https://www.betr.app/picks` until a sport path is verified.
- `native_scheme`: empty string or omitted until verified (existing builder already returns blanks for unknown templates — do not ship a fake scheme).
- `affiliate_param_key`: omit or use a clearly marked `TODO` that appends **nothing** until Betr BD gives a param. Empty affiliate params are better than inventing `?promo=NORMA`.

**Phase A acceptance**

- [ ] `betr` row in `provider_registry` with `category = dfs_pickem`
- [ ] `sportsbook_restrictions` row cited to help center + store listings; TN decision documented
- [ ] `PICKEM_PROVIDER_KEYS` includes `betr`; Connections counts use `isPickEmProvider`
- [ ] Brand maps exist on client + edge (hex from a cited asset)
- [ ] No fabricated scheme or affiliate param in production code
- [ ] Pick'em screen lists Betr after migration apply; sportsbooks screen still excludes `dfs_pickem`

---

### Phase B — Email domain + slip heuristics

**B1. Email**

Capture a real Betr entry-confirmation (or "your picks are in") email:

1. Place a tiny entry on a test account in a legal state, or ask Dave / a teammate who already uses Betr.
2. Save sender, subject, and a redacted body under a fixture path used by `email-parser` tests (same pattern as other books — **no live PII**).
3. Map the **full domain** (`betr.app` or whatever the From header uses) → `betr`.
4. Add `case "betr": return parsePickEmEntry(...)` only if the fixture matches `PICKEM_LEG_RE`; otherwise a Betr-specific parser.
5. Unit-test: `detectSportsbook("noreply@betr.app") === "betr"` **and** `detectSportsbook("hello@betrivers.com") === "betrivers"` (regression).

If no email exists after a good-faith ask: ship domain **unmapped**, leave a stub comment, and rely on slip scan + paste. Do not guess `noreply@betr.app`.

Known public mailboxes (support / BD, **not** confirmed transactional): `support@betr.app`, `ask@betr.app` (contact-support page), `partnerships@betr.app` (media partner page), `support.escalations@betr.app` (Play Store replies).

**B2. Slip / screenshot**

Extend the `parse-bet-slip` prompt: Betr Picks entry screens show player, MORE/LESS (or Over/Under), projection, entry fee, multiplier. Add `"betr"` to the sportsbook enum. Add a Deno source test (mirror `parse-bet-slip_test.ts`). A real screenshot fixture is preferred; if we cannot obtain one, prompt + enum tests are the v1 bar (same as much of the PP/UD coverage).

**Phase B acceptance**

- [ ] BetRivers still maps only `betrivers.com`
- [ ] Either a redacted Betr fixture + passing parser test, **or** an explicit "no email in v1" note in this plan's follow-up ticket
- [ ] Vision prompt lists `betr`; scanned slips can be assigned provider `betr` in `ReviewScannedWagersSheet`

---

### Phase C — ImportRosterSheet / `fantasy_source` + alert eligibility

Mostly falls out of Phase A constants.

- [ ] Picker shows "Betr Picks"; save writes `fantasy_source = 'betr'`
- [ ] `lib/__tests__/import-roster.test.ts` covers `buildRosterFollowRows(..., "betr")`
- [ ] `evaluate-alerts` needs **no new Stage 0 query** if player follows already flow through `userFollowPlayerMap` / `followMatchesGamePlayers`
- [ ] Manual QA: import 3 NFL names → those users are candidates on a live/test game whose boxscore contains those names
- [ ] Connections fantasy-follow count includes Betr-sourced rows (already filters `source === "fantasy"`)

No live roster API. Re-import on lineup change. Same limits as PP/UD: if neither Sportradar summary nor ESPN boxscore has the player name, the follow does not become an alert candidate.

---

### Phase D — Auction / CTA copy + compliance

- [ ] `isPickEmProvider("betr")` is true → `defaultCtaLabel` is **not** `"Bet Now on Betr"`
- [ ] Product copy: **"Play on Betr"** (or documented "Open Betr" if we keep one pattern for all pick'em). Update `sportsbook-brands.test.ts` accordingly. If we change only Betr to "Play on" and leave PP/UD as "Open", say so in the test name.
- [ ] `detectPickEmProviderFromUrl` matches `betr.app`, `picks.betr.app`, `betr.onelink.me` — **must not** match `betrivers.com` (write that test first)
- [ ] `contextualizeSponsorCtaUrl` rewrites those hosts through `buildPickEmLink`; traditional sportsbook URLs unchanged
- [ ] Auction-engine already calls `contextualizeSponsorCtaUrl` on both return paths — no second wiring if detection works
- [ ] Sponsor creatives that still say "Bet Now" in `ctaText` should be rejected or rewritten at campaign review (ops), not silently shown

---

### Phase E — Tests, analytics, flag

**Tests (minimum):**

| Area | Extend |
|---|---|
| Constant / migration sync | `__tests__/prizepicks-integration.test.ts` or new `__tests__/betr-integration.test.ts` |
| Brand hex parity | `lib/__tests__/sportsbook-brands.test.ts` + edge source assert |
| Link builder | `sportsbook-links_test.ts` — Betr fallback URL; blank scheme if TBD; no BetRivers collision |
| Geo | Migration contains `sportsbook_restrictions` + `'betr'` + cited states; **not** NY |
| Roster | `import-roster.test.ts` |
| Email | Domain + BetRivers regression; fixture if obtained |
| Slip | `parse-bet-slip_test.ts` enumerates `betr` |

**Analytics:** No new pipeline. Existing `first_connection_added` (`provider_key`) and `bet_now_tap` (`provider`) already distinguish Betr once the key exists. Optional: add `style: "play"` or event name `pickem_cta_tap` if we want pick'em dashboards without filtering `bet_now_tap`. Not required for v1.

**Feature flag:** None exists for PP/UD. Prefer **no flag**. Kill switch = `provider_registry.active = false` and/or omit the restrictions row (CTA fail-closed). `LSApplicationQueriesSchemes` still needs an App Store binary if/when a native scheme is added — that is a store-release constraint, not a remote flag.

**Phase E acceptance**

- [ ] CI Jest + Deno tests covering the rows above
- [ ] `npx expo install --check` unchanged (no new native deps)
- [ ] Docs in `04` / partnership plan flipped from **Planned** to **Tier B/C** in the **implementation** PR, not this one

---

## 6. Risks

| Risk | Detail | Mitigation |
|---|---|---|
| App-only UX | `picks.betr.app` is a thin shell; marketing site is Webflow. Users without the app hit Store/OneLink, not a usable web board. | Set expectations in Connections copy. Prefer OneLink → store. Do not promise a web slate. |
| OneLink vs custom scheme | Scheme unknown. OneLink template `VZxy` / path `betrapp` is a **marketing** link, not a documented sport deep link. | Verify on device (§7). Ship store/OneLink first. |
| State-list drift | Help center vs store listings disagree on **TN**. Third-party reviews disagree further (some add MO/CT/MD). | Cite official sources only. Re-verify at implementation. Prefer fail-closed on disputed states. |
| Group Play vs house | ~16 Picks states are peer-to-peer only. A "Play on Betr" CTA is still valid; payout copy must not assume house multipliers. | Do not mention 10,000x in NORMA CTA copy. |
| College subset | Some Picks states block college or in-state colleges. | State-only geo in v1; do not deep-link a "CFB board" until a sport URL is real. |
| BetRivers collision | `includes("betr")` would steal BetRivers mail and URLs. | Domain = `betr.app` / `onelink.me` hosts; tests for `betrivers.com`. |
| SSBK vs Picks | Same app icon, different products and state maps. | One key (`betr`) = Picks only. Document SSBK as a later key. |
| No partner API | Same as DK/FD/PP/UD. | Tier B/C only. No "synced" UI. |
| Hardcoded PP/UD lists | Connections counts, scan-review books, URL detect, empty-state copy. | Implementation checklist in Phase A–D. Prefer `isPickEmProvider` over new hardcoded triples. |
| Store URL title drift | App Store title is now "Betr - Sports & Gaming"; id **1635215598** is stable. | Key off id, not slug. |

---

## 7. Open questions / TBD — verification steps

Concrete asks for Dave / eng before or during the implementation PR.

### Deep links

1. Install Betr on a physical iPhone. In a scratch Expo build or Shortcuts, test `Linking.canOpenURL` for candidates **only after** inspecting the IPA / `Info.plist` `CFBundleURLSchemes` (do not spray-guess schemes in production `app.json`).
2. Fetch `https://betr.onelink.me/apple-app-site-association` and `https://picks.betr.app/.well-known/apple-app-site-association` (and Android assetlinks). Record what exists.
3. Tap `https://betr.onelink.me/VZxy/betrapp` with the app installed vs not. Note landing (home vs Picks tab).
4. Ask Betr BD (`partnerships@betr.app` / `ask@betr.app`) for a NORMA OneLink with documented `deep_link_value` (e.g. picks tab / sport). Until they reply, no sport slug.

### Email / slips

5. Forward one real entry-confirmation email (redact stake if needed) to eng. Record `From`, subject, and whether MORE/LESS legs are plaintext.
6. Screenshot one 2–5 pick entry (NFL or NCAAF) for `parse-bet-slip` prompt tuning.

### Geo

7. Re-verify the help-center matrix and both store listings on the implementation week. Decide **TN**.
8. Optional: open Betr from a TN network / account (or ask a TN user) and confirm Picks is offered.
9. Confirm Group Play-only states stay eligible (recommended yes).

### Brand / CTA

10. Official hex + wordmark: "Betr" vs "Betr Picks" on the button.
11. Confirm CTA string: **Play on Betr** vs **Open Betr**.

### Partnership / API

12. No public consumer API as of 2026-09-08 (marketing site, help center, `api.betr.app` unauthenticated). If Betr later offers a read-only entries API, that is Tier A via `BetIngestor` — new ticket, not v1.
13. Affiliate / promo param for paid or sponsor CTAs — wait for BD. Do not invent.

### SSBK

14. Out of v1. If sales wants a sportsbook tile, open a separate ticket with the Social Sports column as the geo source.

---

## 8. Estimate

**Rough sizing: ~the same as adding a third pick'em operator after PrizePicks / Underdog already shipped** — not the original combined F1 ticket.

The expensive part of F1 was inventing `dfs_pickem`, `fantasy_source`, `buildPickEmLink`, geo rows, and the test harness. Those exist. Betr is mostly:

- One migration (registry + restrictions)
- Constant / brand / hardcoded-list sweep
- Geo source reconciliation (TN + Group Play)
- OneLink-first linking (more discovery than PP/UD's known `prizepicks://` / `underdog://`)
- Email/slip fixtures **if** we can get them (this is the main schedule risk)

**Smaller than F1** if we ship OneLink + paste + prompt enum without email fixtures.  
**Larger than a one-line picker add** because of geo citation, BetRivers tests, and hardcoded key lists.

Suggested implementation shape: one PR for Phases A+C+D+E (connect, import, CTA, tests), follow-up PR for Phase B if email/slip samples arrive late.

---

## 9. Public facts used in this plan (retrieved 2026-09-08)

| Fact | Source |
|---|---|
| MORE/LESS pick'em, multi-pick, real-money, live projections | [betr.app/picks](https://www.betr.app/picks) |
| Super-app: Picks · Sportsbook · Casino · Arcade | Same |
| App Store id 1635215598 | [App Store](https://apps.apple.com/us/app/betr-picks-daily-fantasy/id1635215598) |
| Android package `app.instabet.betr`; Play "Where To Play" state list; update 2026-09-04 | [Play Store](https://play.google.com/store/apps/details?id=app.instabet.betr) |
| Picks vs Arcade vs Social Sports vs Casino matrix; Group Play asterisks; TN = Picks Yes | [help.betr.app — Which states does Betr operate in?](https://help.betr.app/en/articles/9461963-which-states-allow-betr-picks) (updated week of 2026-09-08) |
| College-sport state subset; IL/VA in-state team ban | [help.betr.app — college sports](https://help.betr.app/en/articles/9828611-which-states-does-betr-picks-offer-college-sports) |
| Age 18+ / 19 AL&CO / 21 AZ, MA, VA | [help.betr.app — identity](https://help.betr.app/en/articles/9461786-do-i-need-to-verify-my-identity) |
| Must be physically in an eligible state to enter | [help.betr.app](https://help.betr.app/en/articles/9461971-can-i-play-if-i-am-not-physically-in-an-eligible-state) |
| OneLink `betr.onelink.me/VZxy/betrapp` | Public Betr partner landing crawl |
| `picks.betr.app` account destination | Partner landing "I already have an account" |
| Contacts | `ask@betr.app` (contact-support), `support@betr.app`, `partnerships@betr.app` (media) |
| No public developer API | No OpenAPI/docs on marketing/help; `api.betr.app` not a consumer program |

Third-party reviews (Sportsline, GamblingSitesUSA, etc.) were used only to notice drift — **not** as seed sources.

---

## 10. Closing checklist (this docs PR)

- [x] Plan written; unknowns marked TBD with verification steps
- [x] Betr is not treated as implemented
- [x] BetRivers called out as unrelated
- [x] Cross-links from `04_DATA_AND_INTEGRATIONS.md`, partnership Tier 5, roadmap, fantasy partner brief
- [ ] Implementation PR (separate) follows Phases A–E
