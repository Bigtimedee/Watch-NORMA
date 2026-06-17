# NORMA Agentic Advertising — CLI Action Prompts

This folder contains a sequenced series of prompts for use with the Claude CLI (`claude`).
Each file is a complete, copy-paste-ready task. Run them in order for a full implementation.

## How to Use

From your terminal, inside the NORMA project directory:

```bash
# Option A — paste the prompt interactively
claude
# Then paste the contents of the prompt file

# Option B — pipe the prompt directly
cat agentic-ads-cli-prompts/P01_audit_ad_engine.md | claude

# Option C — one-shot execution (non-interactive)
claude -p "$(cat agentic-ads-cli-prompts/P01_audit_ad_engine.md)"
```

## Execution Order

| File | What It Does | Phase | Status |
|------|-------------|-------|--------|
| P01_audit_ad_engine.md | Audit existing ad engine code and APIs | Before anything else | Done |
| P02_build_mcp_server.md | Build the norma-ads MCP server (5 tools) | Phase 1 | Done |
| P03_create_adagents_json.md | Create AdCP discovery file | Phase 1 | Done |
| P04_implement_oauth.md | Add OAuth 2.0 for machine clients | Phase 1 | Done |
| P05_campaign_api.md | Build campaign lifecycle REST API | Phase 1 | Done |
| P06_reporting_api.md | Build programmatic reporting API | Phase 1 | Done |
| P07_postback_webhooks.md | Add conversion postback/webhook system | Phase 1 | Done |
| P08_openapi_spec.md | Generate OpenAPI 3.0 spec for the ads API | Phase 1 | Done |
| P09_developer_page.md | Build getnorma.app/developers landing page | Phase 2 | Done |
| P10_iab_registry_package.md | Prepare IAB Agent Registry submission | Phase 2 | Done |
| P11_platform_outreach.md | Draft outreach to Yahoo DSP, TTD, Kochava, AdMaven | Phase 3 | Done |
| P12_nlp_brief_handler.md | Natural language brief → campaign (AdCP Media Buy Protocol) | Phase 4 | Done |

All 12 prompts have been implemented and tested. CI is green on main.

## Context

These prompts implement the strategy from `norma-agentic-advertising-brief.md`.
The core insight: NORMA's moment-typed inventory and Vickrey auction are already
agent-native primitives. The gap is discoverability. An MCP server + adagents.json
puts NORMA in the discovery layer of every major agentic buying platform.

Each prompt is self-contained and includes the context Claude needs to do the work correctly.
P01 should always be run first — it produces the audit that all subsequent prompts reference.
