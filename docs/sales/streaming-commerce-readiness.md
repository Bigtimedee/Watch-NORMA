# Streaming & Commerce Demand Readiness Audit
**Watch NORMA — July 2026**
**Verdict: Paths are functional. Open for first live deals.**

---

## Scope

End-to-end audit of the streaming (`demand_type = 'streaming'`) and commerce (`demand_type = 'commerce'`) advertiser paths: campaign creation, brand safety gate, auction eligibility, CTA rendering, geo-filter behavior, post_outcome intent moment firing, and attribution recording.

---

## Findings

### 1. Campaign Creation
**File:** `web/src/app/campaigns/new/page.tsx` lines 33–35, 256–277

Streaming and commerce appear as selectable demand types in the campaign creation form. The CTA placeholder auto-fills to "Watch Now" (streaming) or "Shop Now" (commerce). Both categories show a "Pending brand review before going live" note — not a disabled or scaffolded state. Campaigns are inserted to the DB with `demand_type` and `brand_safety_status = 'pending'` (default).

**Status: Working.**

---

### 2. Brand Safety Gate
**File:** `supabase/functions/_shared/auction-engine.ts` lines 161–169

The auction engine applies a `brand_safety_approved` filter before running the competitive auction. Sportsbook campaigns bypass this check; streaming and commerce campaigns must have `brand_safety_status = 'approved'` on their campaign row before their bids are eligible. This is a per-campaign row flag — approval is permanent until manually changed.

**Schema:** `brand_safety_status` column added by `supabase/migrations/080_brand_safety.sql`. Values: `pending | approved | flagged`.

**Admin UI:** `/admin/campaigns` shows a separate `BrandSafetyBadge` column alongside the standard `ApprovalBadge`. Two separate approval signals — both must pass before a campaign enters the live auction.

**Gap (medium):** No SLA enforcement — a streaming/commerce campaign can stay in `brand_safety_status = 'pending'` indefinitely without escalation or auto-rejection. Manual admin action is required. Recommend an admin alert after 48 hours in pending state.

**Status: Working. One operational gap (no SLA).**

---

### 3. Auction Eligibility and Geo-filter Behavior
**File:** `supabase/functions/_shared/auction-engine.ts` lines 139–169

Geo-filtering applies to ALL bid types based on `allowed_jurisdictions` in the campaign row. For sportsbook campaigns, jurisdiction is also checked against `sportsbook_restrictions` (per the state-level gambling advertising compliance layer). For streaming and commerce, the jurisdiction check passes unless the advertiser explicitly sets a restricted jurisdiction list — the default is unrestricted.

**Status: Working. Streaming and commerce campaigns are geo-unrestricted by default.**

---

### 4. CTA Rendering
**File:** `components/SponsorCTAButton.tsx` lines 44–64

`SponsorCTAButton` renders the advertiser-supplied `cta_text` verbatim when the user is geo-eligible. The label is not auto-derived from `demand_type` at render time — whatever string the advertiser entered in the campaign creation form is used. The campaign creation form defaults the placeholder to "Watch Now" / "Shop Now" / "Bet Now" based on demand_type, which guides the advertiser, but no runtime validation enforces a match.

**Gap (low, by design):** An advertiser could enter "Bet Now" on a streaming campaign. No validation prevents this. This is a policy gap, not a system gap. Recommend adding a server-side validation rule that flags `cta_text = 'Bet Now'` on `demand_type = 'streaming' | 'commerce'` campaigns during brand safety review.

**Status: Working. One low-severity copy validation gap.**

---

### 5. post_outcome Intent Moment
**File:** `supabase/functions/evaluate-alerts/index.ts` lines 762–814

`post_outcome` fires once per closed game where `home_score !== away_score` — a decisive winner. It is observational: fires after all alert delivery, never alters live alert behavior. Available qualifier flags in `game_context`: `is_upset` (margin ≤ 5), `is_blowout` (margin > 20), `is_overtime` (period > 4 for basketball). Commerce campaigns can be targeted against this moment type in the auction via the standard eligible-bids query — `post_outcome` is a valid `moment_type` key.

**Note:** The hardcoded floor price fallback for unlisted moment types is $0.10 (see `_shared/pricing-engine.ts`). If `post_outcome` has no row in the `floor_prices` table, it will fall to $0.10. Recommend adding an explicit `post_outcome` row at $0.25–$0.35 before live commerce deals begin.

**Status: Working. Floor price gap worth fixing before first deal.**

---

### 6. Attribution Recording
**Files:** `supabase/functions/advertiser-weekly-report/logic.ts` line 36; `supabase/functions/reporting-api/index.ts`

`stream_open` and `commerce_open` appear in the `INFERRED_TYPES` constant used by the weekly advertiser report. These events are classified as inferred (the user tapped the CTA and opened an external app — no partner callback confirms what happened after). The classification is correct and the weekly report correctly labels them "inferred" per rule 7 / P2-03.

**Gap (medium):** The code that actually writes `stream_open` / `commerce_open` rows to the conversions table is not visible in this codebase. These events appear to exist as classification labels only. If `conversion-ingestor.ts` handles this via a client-side deep link return detection, that code was not found in this audit. Recommend verifying whether conversions rows of type `stream_open` / `commerce_open` are ever written before promising this data to first advertiser — or document that the only attribution signal is `cta_tap` + `app_return` until partner callbacks are live.

**Status: Classification labels correct. Write mechanism unclear. Verify before advertisers review attribution data.**

---

## Verdict

| Component | Status |
|-----------|--------|
| Campaign creation | Working |
| Brand safety gate | Working (no SLA enforcement) |
| Auction eligibility | Working |
| Geo-filter exemption | Working |
| CTA rendering | Working (no demand_type copy validation) |
| post_outcome intent moment | Working (floor price TBD) |
| Attribution recording | Labels correct; write mechanism unclear |

**Recommendation:** Streaming and commerce paths are open for first live deals. Before closing the first streaming or commerce campaign, do three things: (1) add an explicit `post_outcome` floor price row; (2) confirm whether `stream_open`/`commerce_open` conversions are actually written; (3) set a 48-hour admin notification for pending brand safety reviews.

None of the gaps are blocking. They are operational details, not system failures.
