#!/usr/bin/env bash
# Manual end-to-end test script for the NORMA MCP HTTP/SSE server.
#
# Usage:
#   NORMA_API_KEY=<your-key> ./scripts/test-e2e.sh [base-url]
#
# Examples:
#   NORMA_API_KEY=sk-norma-xxx ./scripts/test-e2e.sh
#   NORMA_API_KEY=sk-norma-xxx ./scripts/test-e2e.sh https://mcp.getnorma.app
#
# Note: make the script executable first:
#   chmod +x scripts/test-e2e.sh

set -euo pipefail

# ─── configuration ────────────────────────────────────────────────────────────

BASE_URL="${1:-http://localhost:3001}"

if [[ -z "${NORMA_API_KEY:-}" ]]; then
  echo "ERROR: NORMA_API_KEY environment variable is not set."
  echo "Usage: NORMA_API_KEY=<key> $0 [base-url]"
  exit 1
fi

PASS=0
FAIL=0

# ─── helpers ──────────────────────────────────────────────────────────────────

green() { printf "\033[0;32m%s\033[0m\n" "$*"; }
red()   { printf "\033[0;31m%s\033[0m\n" "$*"; }

pass() {
  PASS=$((PASS + 1))
  green "  PASS: $1"
}

fail() {
  FAIL=$((FAIL + 1))
  red   "  FAIL: $1"
  if [[ -n "${2:-}" ]]; then
    echo "        $2"
  fi
}

# ─── test 1: health check ─────────────────────────────────────────────────────

echo ""
echo "=== 1. GET /health (no auth required) ==="

HEALTH_RESPONSE=$(curl --silent --show-error \
  --write-out "\n__STATUS__%{http_code}" \
  "${BASE_URL}/health" 2>&1) || true

HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | grep '__STATUS__' | sed 's/__STATUS__//')
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | sed '/__STATUS__/d')

echo "  Response: $HEALTH_BODY"
echo "  HTTP status: $HEALTH_STATUS"

if [[ "$HEALTH_STATUS" == "200" ]]; then
  pass "HTTP 200 received"
else
  fail "Expected HTTP 200" "Got $HEALTH_STATUS"
fi

if echo "$HEALTH_BODY" | grep -q '"status":"ok"'; then
  pass 'Body contains "status":"ok"'
else
  fail 'Body should contain "status":"ok"'
fi

if echo "$HEALTH_BODY" | grep -q '"service":"norma-ads-mcp"'; then
  pass 'Body contains "service":"norma-ads-mcp"'
else
  fail 'Body should contain "service":"norma-ads-mcp"'
fi

if echo "$HEALTH_BODY" | grep -q '"transport":"http-sse"'; then
  pass 'Body contains "transport":"http-sse"'
else
  fail 'Body should contain "transport":"http-sse"'
fi

# ─── test 2: /sse without auth returns 401 ───────────────────────────────────

echo ""
echo "=== 2. GET /sse without Authorization header (expect 401) ==="

SSE_NO_AUTH_STATUS=$(curl --silent --output /dev/null \
  --write-out "%{http_code}" \
  "${BASE_URL}/sse" 2>&1) || true

echo "  HTTP status: $SSE_NO_AUTH_STATUS"

if [[ "$SSE_NO_AUTH_STATUS" == "401" ]]; then
  pass "HTTP 401 returned without auth"
else
  fail "Expected HTTP 401 without auth" "Got $SSE_NO_AUTH_STATUS"
fi

# ─── tests 3-5: SSE connection + tools/list round-trip ───────────────────────
# Strategy: open SSE in a background curl (keeps the session alive), extract
# sessionId, POST tools/list while the connection is still open, read result.

echo ""
echo "=== 3-5. SSE round-trip: connect → sessionId → tools/list ==="

SSE_TMP=$(mktemp)
SSE_RESULT_TMP=$(mktemp)
trap 'rm -f "$SSE_TMP" "$SSE_RESULT_TMP"; kill "$SSE_BG_PID" 2>/dev/null || true' EXIT

# Open SSE in background — keeps the session alive for the POST
curl --silent \
  --no-buffer \
  --header "Authorization: Bearer ${NORMA_API_KEY}" \
  --header "Accept: text/event-stream" \
  --output "$SSE_TMP" \
  "${BASE_URL}/sse" 2>&1 &
SSE_BG_PID=$!

# Wait for the server to send the endpoint event with sessionId
sleep 2

SSE_INITIAL=$(cat "$SSE_TMP")
echo "  SSE initial data: $(echo "$SSE_INITIAL" | head -3)"

# Extract sessionId (URL form: data: /message?sessionId=xxx)
SESSION_ID=""
URL_MATCH=$(echo "$SSE_INITIAL" | grep -oE 'sessionId=[^[:space:]&\n]+' | head -1 || true)
if [[ -n "$URL_MATCH" ]]; then
  SESSION_ID=$(echo "$URL_MATCH" | sed 's/sessionId=//')
fi
# Also try JSON form: data: {"sessionId":"xxx"}
if [[ -z "$SESSION_ID" ]]; then
  JSON_MATCH=$(echo "$SSE_INITIAL" | grep -oE '"sessionId":"[^"]+"' | head -1 || true)
  if [[ -n "$JSON_MATCH" ]]; then
    SESSION_ID=$(echo "$JSON_MATCH" | sed 's/"sessionId":"//;s/"//')
  fi
fi

if [[ -z "$SESSION_ID" ]]; then
  fail "Could not extract sessionId from SSE stream"
  echo "  Raw SSE data:"
  echo "$SSE_INITIAL" | head -10 | sed 's/^/    /'
else
  pass "Extracted sessionId: $SESSION_ID"

  # ─── test 4: POST tools/list to the live session ────────────────────────────

  echo ""
  echo "=== 4. POST tools/list to /message?sessionId=<id> ==="

  RPC_PAYLOAD='{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

  MSG_RESPONSE=$(curl --silent --show-error \
    --write-out "\n__STATUS__%{http_code}" \
    --request POST \
    --header "Content-Type: application/json" \
    --header "Authorization: Bearer ${NORMA_API_KEY}" \
    --data "$RPC_PAYLOAD" \
    "${BASE_URL}/message?sessionId=${SESSION_ID}" 2>&1) || true

  MSG_STATUS=$(echo "$MSG_RESPONSE" | grep '__STATUS__' | sed 's/__STATUS__//')
  MSG_BODY=$(echo "$MSG_RESPONSE" | sed '/__STATUS__/d')

  echo "  HTTP status: $MSG_STATUS"
  echo "  Response body: $MSG_BODY"

  if [[ "$MSG_STATUS" == "200" || "$MSG_STATUS" == "202" ]]; then
    pass "POST /message accepted (HTTP $MSG_STATUS)"
  else
    fail "Expected 200 or 202 from POST /message" "Got $MSG_STATUS"
  fi

  # ─── test 5: tools/list response arrives on the open SSE stream ─────────────

  echo ""
  echo "=== 5. tools/list response on SSE stream ==="

  # Give the server a moment to write the response to the SSE stream
  sleep 2

  SSE_RESULT=$(cat "$SSE_TMP")
  kill "$SSE_BG_PID" 2>/dev/null || true
  SSE_BG_PID=""

  EXPECTED_TOOLS=(
    "list_moment_types"
    "get_inventory_forecast"
    "create_campaign"
    "get_campaign_performance"
    "update_campaign"
    "submit_brief"
  )

  TOOLS_MISSING=()
  for TOOL in "${EXPECTED_TOOLS[@]}"; do
    if ! echo "$SSE_RESULT" | grep -q "\"$TOOL\""; then
      TOOLS_MISSING+=("$TOOL")
    fi
  done

  if [[ ${#TOOLS_MISSING[@]} -eq 0 ]]; then
    pass "All 6 tools found in SSE response: ${EXPECTED_TOOLS[*]}"
  else
    fail "Some tools missing from SSE response" "Missing: ${TOOLS_MISSING[*]}"
    echo "  SSE result (truncated):"
    echo "$SSE_RESULT" | head -30 | sed 's/^/    /'
  fi
fi

# ─── test 6: /sse with invalid Bearer token returns 401 ──────────────────────

echo ""
echo "=== 6. GET /sse with wrong Bearer token (expect 401) ==="

SSE_BAD_AUTH_STATUS=$(curl --silent --output /dev/null \
  --write-out "%{http_code}" \
  --header "Authorization: Bearer totally-wrong-key" \
  "${BASE_URL}/sse" 2>&1) || true

echo "  HTTP status: $SSE_BAD_AUTH_STATUS"

if [[ "$SSE_BAD_AUTH_STATUS" == "401" ]]; then
  pass "HTTP 401 returned with wrong Bearer token"
else
  fail "Expected HTTP 401 with wrong Bearer token" "Got $SSE_BAD_AUTH_STATUS"
fi

# ─── test 7: POST /message with unknown sessionId returns 404 ────────────────

echo ""
echo "=== 7. POST /message with unknown sessionId (expect 404) ==="

UNKNOWN_SESSION="nonexistent-session-00000"
RPC_PAYLOAD='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

UNKNOWN_STATUS=$(curl --silent --output /dev/null \
  --write-out "%{http_code}" \
  --request POST \
  --header "Content-Type: application/json" \
  --header "Authorization: Bearer ${NORMA_API_KEY}" \
  --data "$RPC_PAYLOAD" \
  "${BASE_URL}/message?sessionId=${UNKNOWN_SESSION}" 2>&1) || true

echo "  HTTP status: $UNKNOWN_STATUS"

if [[ "$UNKNOWN_STATUS" == "404" ]]; then
  pass "HTTP 404 returned for unknown sessionId"
else
  fail "Expected HTTP 404 for unknown sessionId" "Got $UNKNOWN_STATUS"
fi

# ─── summary ─────────────────────────────────────────────────────────────────

echo ""
echo "============================================"
echo "Results: $PASS passed, $FAIL failed"
echo "============================================"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
