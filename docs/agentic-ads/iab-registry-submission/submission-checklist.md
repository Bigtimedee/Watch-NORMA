# IAB AAMP Registry Submission Checklist

## Status: Ready to submit

All technical files are complete. Steps below require manual action by Dave Maloney.

---

## Step 1: Apply for TAG (Trustworthy Accountability Group) ID

**URL:** https://www.tagtoday.net/  
**Contact:** support@tagtoday.net  
**Cost:** Free for publishers under $1M annual revenue; tiered pricing above

Once issued, update `public/sellers.json`:
```json
{
  "identifiers": [
    { "name": "TAG-ID", "value": "<YOUR_TAG_ID>" }
  ]
}
```

---

## Step 2: Publish `sellers.json`

`public/sellers.json` is already committed and will be served at `getnorma.app/sellers.json` on next deploy. Verify by visiting:

```
https://getnorma.app/sellers.json
```

No additional submission is required — IAB-compliant buyers crawl sellers.json directly from the domain.

---

## Step 3: Submit to IAB Tech Lab AAMP Agent Registry

The AAMP Agent Registry is open and free:

**Registry URL:** https://iabtechlab.com/standards/aamp-agentic-advertising-management-protocols/  
**Contact:** techlab@iabtechlab.com  
**GitHub:** https://github.com/IABTechLab/AAMP

Steps:
1. Sign up at the IAB Tech Lab AAMP registry (link on the page above)
2. Submit the seller profile — use the contents of `docs/agentic-ads/iab-registry-submission/aamp-seller-profile.json`
3. Reference these endpoints in the submission:
   - Agent endpoint: `https://mcp.getnorma.app`
   - Discovery: `https://getnorma.app/adagents.json`
   - OpenAPI spec: `https://api.getnorma.app/api/ads/openapi.json`
   - Seller profile: `https://getnorma.app/aamp-seller-profile.json`

**Note:** The aamp-seller-profile.json schema in this package is based on AAMP 2.0 (released April 2026). Verify field names against the official spec before submission — the standard is still evolving.

---

## Step 4: Send Working Group Participation Letter

**To:** techlab@iabtechlab.com  
**Subject:** AAMP Working Group Participation Interest — NORMA (Push Notification Ad Unit)  
**Body:** Use `docs/agentic-ads/iab-registry-submission/working-group-letter.md`

---

## Step 5: Confirm Registry Listing

After submission (~5–10 business days), verify the listing by searching the public AAMP registry:

```
https://iabtechlab.com/standards/aamp-agentic-advertising-management-protocols/
```

Or contact techlab@iabtechlab.com to confirm the listing is live.

---

## Step 6: Test Agent Discovery

Test that a sample buyer agent can discover NORMA:

```bash
# Verify sellers.json
curl https://getnorma.app/sellers.json

# Verify AAMP seller profile
curl https://getnorma.app/aamp-seller-profile.json

# Verify AdCP discovery
curl https://getnorma.app/adagents.json
curl https://getnorma.app/.well-known/adagents.json

# Verify OpenAPI spec
curl https://api.getnorma.app/api/ads/openapi.json
curl https://getnorma.app/.well-known/openapi.json

# Verify MCP server responds
# (requires norma-ads-mcp installed and API key configured)
```

---

## Files in this package

| File | Location | Serves at |
|------|----------|-----------|
| `sellers.json` | `web/public/sellers.json` | `getnorma.app/sellers.json` |
| `aamp-seller-profile.json` | `web/public/aamp-seller-profile.json` | `getnorma.app/aamp-seller-profile.json` |
| Working group letter | `docs/agentic-ads/iab-registry-submission/working-group-letter.md` | — |
| This checklist | `docs/agentic-ads/iab-registry-submission/submission-checklist.md` | — |
