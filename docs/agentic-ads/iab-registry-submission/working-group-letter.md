# IAB Tech Lab AAMP Working Group — Participation Interest

**To:** IAB Tech Lab AAMP Working Group  
**Contact:** techlab@iabtechlab.com  
**From:** Dave Maloney, NORMA  
**Email:** dtmaloney@gmail.com  
**Date:** June 2026

---

Dear IAB Tech Lab AAMP Working Group,

I am writing on behalf of NORMA (getnorma.app), a push notification advertising platform built specifically for sports bettors and prediction market participants. We have implemented both an MCP server and an AdCP `adagents.json` discovery manifest, and are preparing our submission to the AAMP Agent Registry.

We would like to formally express interest in participating in the AAMP 2.0 working group, specifically in the Publisher/Seller Agent subgroup.

**What NORMA offers that is underrepresented in current AAMP drafts:**

NORMA operates a moment-typed push notification ad unit — an ad format that does not map cleanly to existing OpenRTB inventory types. Our ads are triggered exclusively by specific real-world events (e.g., a user's sports wager settling, a game entering overtime) rather than by page load or session targeting. This creates a semantically new inventory class: *intent-verified, moment-triggered impressions*.

We believe the AAMP framework would benefit from explicit taxonomy support for this format, and we are prepared to contribute:

- A formal IAB content category proposal for moment-typed push notification inventory
- Reference implementation of the AdCP `adagents.json` manifest for non-web ad units
- Technical feedback on how the AAMP seller profile schema handles floor prices and moment-type targeting

**What we have already implemented:**

- MCP server at `mcp.getnorma.app` with five tools: `list_moment_types`, `get_inventory_forecast`, `create_campaign`, `get_campaign_performance`, and `get_market_data`
- AdCP discovery at `getnorma.app/adagents.json` and `getnorma.app/.well-known/adagents.json`
- OpenAPI 3.0.3 spec at `getnorma.app/api-docs` and `getnorma.app/.well-known/openapi.json`
- `sellers.json` at `getnorma.app/sellers.json`
- AAMP seller profile at `getnorma.app/aamp-seller-profile.json`

We are a small team operating in a high-intent, high-CTR niche. Our interest in the working group is technical, not commercial — we want to help the standard handle novel ad unit types correctly so that future agent-driven buyers can transact with sellers like us without requiring custom integrations.

Please let me know how to proceed with formal working group participation.

Regards,  
Dave Maloney  
NORMA  
dtmaloney@gmail.com
