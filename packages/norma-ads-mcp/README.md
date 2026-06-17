# norma-ads-mcp

MCP server for NORMA's agentic advertising marketplace. Connects AI agents to NORMA's sports-bettor push notification inventory — second-price Vickrey auction, 11 moment types, real-time forecasting.

## Installation

```bash
npm install -g norma-ads-mcp
```

## Claude Desktop Configuration

Add this block to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "norma-ads": {
      "command": "norma-ads-mcp",
      "env": {
        "NORMA_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Get your API key at [getnorma.app/developers](https://getnorma.app/developers).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NORMA_API_KEY` | Yes | Your advertiser API key from getnorma.app/developers |
| `NORMA_API_BASE_URL` | No | Override API base URL (default: https://getnorma.app/api/ads) |

## Tools

### `list_moment_types`

Returns NORMA's full moment type taxonomy with floor prices and historical CTR ranges.

**Input**: none

**Example output**:
```json
[
  {
    "key": "bet_resolved",
    "display_name": "Bet Resolved",
    "description": "Fires when a user's active wager is settled",
    "floor_price_usd": 0.50,
    "typical_ctr_low": 8.0,
    "typical_ctr_high": 14.0,
    "available_sports": ["ncaa_basketball", "nfl", "nba"]
  }
]
```

---

### `get_inventory_forecast`

Projects available impressions for a moment type + date range, with win-rate guidance at different bid levels.

**Example input**:
```json
{
  "sport": "ncaa_basketball",
  "moment_type": "bet_resolved",
  "start_date": "2025-03-15",
  "end_date": "2025-04-05",
  "bid_cpm_usd": 1.50
}
```

**Example output**:
```json
{
  "sport": "ncaa_basketball",
  "moment_type": "bet_resolved",
  "date_range": { "start": "2025-03-15", "end": "2025-04-05" },
  "projected_impressions": 62000,
  "projected_games": 412,
  "bid_guidance": [
    { "bid_cpm_usd": 0.50, "estimated_win_rate": 0.28 },
    { "bid_cpm_usd": 1.00, "estimated_win_rate": 0.61 },
    { "bid_cpm_usd": 1.50, "estimated_win_rate": 0.84 }
  ]
}
```

---

### `create_campaign`

Creates a new campaign targeting sports-bettor push notifications.

**Example input**:
```json
{
  "name": "March Madness Q1",
  "advertiser_name": "DraftKings",
  "moment_types": ["bet_resolved", "close_game"],
  "sports": ["ncaa_basketball"],
  "bid_cpm_usd": 1.50,
  "daily_budget_usd": 500,
  "total_budget_usd": 10000,
  "target_cpa_usd": 2.00,
  "start_date": "2025-03-15",
  "end_date": "2025-04-07",
  "creative": {
    "headline": "Your Bet Just Resolved",
    "body": "Check your DraftKings balance and place your next bet.",
    "icon_url": "https://cdn.draftkings.com/icon.png",
    "action_url": "https://draftkings.com/lobby",
    "cta_text": "Open DraftKings"
  },
  "postback_url": "https://tracking.draftkings.com/norma/postback"
}
```

**Example output**:
```json
{
  "campaign_id": "cmp_abc123",
  "status": "pending_review",
  "estimated_daily_impressions": 4800,
  "estimated_daily_spend_usd": 487.20,
  "created_at": "2025-03-01T14:22:00Z"
}
```

---

### `get_campaign_performance`

Returns impressions, CTR, conversions, CPA, and spend for a campaign.

**Example input**:
```json
{
  "campaign_id": "cmp_abc123",
  "start_date": "2025-03-15",
  "end_date": "2025-04-05",
  "breakdown": "moment_type"
}
```

**Example output**:
```json
{
  "campaign_id": "cmp_abc123",
  "period": { "start": "2025-03-15", "end": "2025-04-05" },
  "totals": {
    "impressions": 89400,
    "clicks": 7152,
    "ctr": 0.08,
    "conversions": 1788,
    "cpa_usd": 1.86,
    "spend_usd": 3325.68,
    "win_rate": 0.71
  },
  "breakdown": [
    {
      "dimension": "moment_type",
      "value": "bet_resolved",
      "impressions": 54000,
      "clicks": 4860,
      "ctr": 0.09,
      "conversions": 1215,
      "cpa_usd": 1.65,
      "spend_usd": 2003.85,
      "win_rate": 0.78
    }
  ]
}
```

---

### `update_campaign`

Updates bid, budget, CPA target, status, or end date. All fields are optional.

**Example input**:
```json
{
  "campaign_id": "cmp_abc123",
  "bid_cpm_usd": 2.00,
  "status": "paused"
}
```

**Example output**:
```json
{
  "campaign_id": "cmp_abc123",
  "updated_fields": ["bid_cpm_usd", "status"],
  "updated_at": "2025-03-20T09:15:00Z"
}
```

---

## Learn More

[getnorma.app/developers](https://getnorma.app/developers)
