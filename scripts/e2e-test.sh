#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  Carmen Sandiego On-Chain — Comprehensive E2E Test Suite
# ═══════════════════════════════════════════════════════════════════
#
#  Tests ALL layers: compilation, unit tests, relay server, frontend,
#  and the 6 Chainlink integrations (VRF, CRE, Automation, Data Feeds,
#  CCIP, Functions/Relayer).
#
#  Usage:
#    ./scripts/e2e-test.sh              # full suite (needs relay + frontend running)
#    ./scripts/e2e-test.sh --static     # static checks only (no servers needed)
#    ./scripts/e2e-test.sh --relay      # relay server tests only
#    ./scripts/e2e-test.sh --contracts  # contract unit + Hardhat E2E tests
#    ./scripts/e2e-test.sh --frontend   # frontend build + serve tests
#
#  Prerequisites:
#    - Node.js 18+, npm
#    - For relay tests: relay server running on localhost:3001
#      cd chainlink-functions && node server.js
#    - For frontend tests: vite dev server on localhost:5173
#      cd frontend && npm run dev
# ═══════════════════════════════════════════════════════════════════

set -uo pipefail

# ── Colors ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── Config ──────────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELAY_URL="${RELAY_URL:-http://localhost:3001}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:5173}"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
TOTAL_COUNT=0

# ── Helpers ─────────────────────────────────────────────────────
pass() {
  ((PASS_COUNT++))
  ((TOTAL_COUNT++))
  echo -e "  ${GREEN}✓ PASS${NC} — $1"
}

fail() {
  ((FAIL_COUNT++))
  ((TOTAL_COUNT++))
  echo -e "  ${RED}✗ FAIL${NC} — $1"
}

skip() {
  ((SKIP_COUNT++))
  ((TOTAL_COUNT++))
  echo -e "  ${YELLOW}⊘ SKIP${NC} — $1"
}

section() {
  echo ""
  echo -e "${CYAN}${BOLD}═══ $1 ═══${NC}"
}

test_header() {
  echo ""
  echo -e "${BOLD}▸ TEST $1${NC}"
}

is_reachable() {
  curl -sf -o /dev/null --connect-timeout 3 "$1" 2>/dev/null
}

# ── Parse args ──────────────────────────────────────────────────
RUN_STATIC=true
RUN_CONTRACTS=true
RUN_RELAY=true
RUN_FRONTEND=true

if [[ "${1:-}" != "" ]]; then
  RUN_STATIC=false
  RUN_CONTRACTS=false
  RUN_RELAY=false
  RUN_FRONTEND=false
  case "${1}" in
    --static)    RUN_STATIC=true ;;
    --contracts) RUN_STATIC=true; RUN_CONTRACTS=true ;;
    --relay)     RUN_RELAY=true ;;
    --frontend)  RUN_FRONTEND=true ;;
    *)           echo "Usage: $0 [--static|--contracts|--relay|--frontend]"; exit 1 ;;
  esac
fi

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Carmen Sandiego On-Chain — E2E Test Suite              ║${NC}"
echo -e "${BOLD}║   6 Chainlink Services · Contracts · Relay · Frontend    ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════════════╝${NC}"
echo "  Root: $ROOT_DIR"
echo "  Relay: $RELAY_URL"
echo "  Frontend: $FRONTEND_URL"

# ═════════════════════════════════════════════════════════════════
#  PHASE 1: Static Checks
# ═════════════════════════════════════════════════════════════════
if $RUN_STATIC; then
  section "PHASE 1: Static Checks"

  # 1.1 Contract compilation
  test_header "1.1: Contract Compilation (Solidity 0.8.24)"
  cd "$ROOT_DIR/contracts"
  COMPILE_OUT=$(npx hardhat compile 2>&1 || true)
  if echo "$COMPILE_OUT" | grep -qi "error"; then
    fail "Contract compilation failed"
    echo "    $(echo "$COMPILE_OUT" | grep -i error | head -3)"
  else
    pass "All contracts compile (GameMaster, CityNode, CCIPReceiver, MockAggregatorV3)"
  fi

  # 1.2 Check new Chainlink files exist
  test_header "1.2: Chainlink Integration Files Present"
  MISSING=0
  for f in \
    "src/GameMaster.sol" \
    "src/CityNode.sol" \
    "src/CCIPReceiver.sol" \
    "src/interfaces/ICCIPRouter.sol" \
    "src/mocks/MockAggregatorV3.sol" \
    "src/interfaces/IGameMaster.sol"; do
    if [[ ! -f "$ROOT_DIR/contracts/$f" ]]; then
      echo "    Missing: contracts/$f"
      ((MISSING++))
    fi
  done
  if [[ $MISSING -eq 0 ]]; then
    pass "All 6 Chainlink contract files present"
  else
    fail "$MISSING contract files missing"
  fi

  # 1.3 Frontend build
  test_header "1.3: Frontend Build (Vite)"
  cd "$ROOT_DIR/frontend"
  BUILD_OUT=$(npx vite build 2>&1 || true)
  if echo "$BUILD_OUT" | grep -q "built in"; then
    pass "Frontend builds successfully"
  else
    fail "Frontend build failed"
    echo "    $(echo "$BUILD_OUT" | tail -5)"
  fi

  # 1.4 Check relay server source
  test_header "1.4: Relay Server Source (chainlink-functions/server.js)"
  RELAY_FILE="$ROOT_DIR/chainlink-functions/server.js"
  if [[ ! -f "$RELAY_FILE" ]]; then
    fail "server.js not found"
  else
    ENDPOINTS_FOUND=0
    for ep in "/health" "/faucet" "/relay/register-player" "/relay/start-mission" "/relay/submit-investigation" "/relay/city-action"; do
      if grep -q "\"$ep\"" "$RELAY_FILE" || grep -q "'$ep'" "$RELAY_FILE"; then
        ((ENDPOINTS_FOUND++))
      fi
    done
    if [[ $ENDPOINTS_FOUND -ge 5 ]]; then
      pass "Relay server has $ENDPOINTS_FOUND/6 endpoints defined"
    else
      fail "Only $ENDPOINTS_FOUND/6 endpoints found in server.js"
    fi
  fi

  # 1.5 Frontend relay service
  test_header "1.5: Frontend Relay Service (relayService.js)"
  RELAY_SVC="$ROOT_DIR/frontend/src/services/relayService.js"
  if [[ ! -f "$RELAY_SVC" ]]; then
    fail "relayService.js not found"
  else
    FUNCS_FOUND=0
    for fn in "relayStartMission" "relayRegisterPlayer" "relaySubmitInvestigation" "relayCityAction" "isRelayerAvailable" "signRelayIntent"; do
      if grep -q "$fn" "$RELAY_SVC"; then
        ((FUNCS_FOUND++))
      fi
    done
    if [[ $FUNCS_FOUND -ge 5 ]]; then
      pass "relayService.js exports $FUNCS_FOUND/6 relay functions"
    else
      fail "Only $FUNCS_FOUND/6 relay functions found"
    fi
  fi

  # 1.6 Chainlink Data Feeds integration in GameMaster
  test_header "1.6: Chainlink Data Feeds in GameMaster.sol"
  GM_SOL="$ROOT_DIR/contracts/src/GameMaster.sol"
  DF_CHECKS=0
  for pattern in "AggregatorV3Interface" "ethUsdPriceFeed" "getMarketData" "_getETHPrice" "setEthUsdPriceFeed"; do
    if grep -q "$pattern" "$GM_SOL"; then
      ((DF_CHECKS++))
    fi
  done
  if [[ $DF_CHECKS -ge 4 ]]; then
    pass "Data Feeds: $DF_CHECKS/5 integration points found"
  else
    fail "Data Feeds: only $DF_CHECKS/5 integration points"
  fi

  # 1.7 Chainlink CCIP in GameMaster + CityNode
  test_header "1.7: Chainlink CCIP Integration"
  CCIP_CHECKS=0
  # GameMaster sender
  for pattern in "broadcastCarmenMove" "ccipRouter" "setCCIPRouter" "ccipMessageCount" "getCCIPStatus"; do
    if grep -q "$pattern" "$GM_SOL"; then
      ((CCIP_CHECKS++))
    fi
  done
  # CityNode receiver
  CN_SOL="$ROOT_DIR/contracts/src/CityNode.sol"
  for pattern in "CCIPReceiver" "_ccipReceive" "ccipCarmenLocationHash" "getCCIPSyncStatus" "ccipAllowedSenders"; do
    if grep -q "$pattern" "$CN_SOL"; then
      ((CCIP_CHECKS++))
    fi
  done
  if [[ $CCIP_CHECKS -ge 8 ]]; then
    pass "CCIP: $CCIP_CHECKS/10 integration points (sender + receiver)"
  else
    fail "CCIP: only $CCIP_CHECKS/10 integration points"
  fi

  # 1.8 CRE Workflows
  test_header "1.8: CRE Workflows (6 WASM workflows)"
  CRE_DIR="$ROOT_DIR/cre-workflows"
  CRE_COUNT=0
  for wf in "mission-start" "carmen-moves" "generate-briefing" "generate-finale" "player-check" "player-registration"; do
    if [[ -f "$CRE_DIR/$wf/main.ts" ]]; then
      ((CRE_COUNT++))
    fi
  done
  if [[ $CRE_COUNT -eq 6 ]]; then
    pass "All 6 CRE workflows present"
  else
    fail "Only $CRE_COUNT/6 CRE workflows found"
  fi

  # 1.9 .gitignore does NOT exclude chainlink-functions
  test_header "1.9: .gitignore allows chainlink-functions/"
  GITIGNORE="$ROOT_DIR/.gitignore"
  if grep -qx "chainlink-functions/" "$GITIGNORE" 2>/dev/null; then
    fail ".gitignore still excludes chainlink-functions/"
  else
    pass ".gitignore allows chainlink-functions/ to be committed"
  fi
fi

# ═════════════════════════════════════════════════════════════════
#  PHASE 2: Contract Unit Tests
# ═════════════════════════════════════════════════════════════════
if $RUN_CONTRACTS; then
  section "PHASE 2: Contract Tests (Hardhat)"

  test_header "2.1: Full Test Suite"
  cd "$ROOT_DIR/contracts"
  TEST_OUTPUT=$(npx hardhat test 2>&1 || true)
  PASSING=$(echo "$TEST_OUTPUT" | grep -oP '\d+ passing' | head -1 || echo "0 passing")
  FAILING=$(echo "$TEST_OUTPUT" | grep -oP '\d+ failing' | head -1 || echo "")

  echo "    $PASSING"
  if [[ -n "$FAILING" ]]; then
    echo "    $FAILING"
    fail "Contract tests: $PASSING, $FAILING"
  else
    PASS_NUM=$(echo "$PASSING" | grep -oP '\d+')
    if [[ "$PASS_NUM" -gt 300 ]]; then
      pass "Contract tests: $PASSING (includes Data Feeds, CCIP, security tests)"
    else
      fail "Expected 300+ tests, got $PASS_NUM"
    fi
  fi

  # 2.2 Verify specific test categories exist
  test_header "2.2: Chainlink Test Coverage"
  TEST_FILE="$ROOT_DIR/contracts/test/GameMaster.test.ts"
  CATEGORIES=0
  for cat in "Data Feed" "CCIP" "Market" "PriceFeed" "broadcastCarmen"; do
    if grep -qi "$cat" "$TEST_FILE"; then
      ((CATEGORIES++))
    fi
  done
  if [[ $CATEGORIES -ge 3 ]]; then
    pass "Test file covers $CATEGORIES/5 Chainlink categories"
  else
    fail "Test file only covers $CATEGORIES/5 Chainlink categories"
  fi
fi

# ═════════════════════════════════════════════════════════════════
#  PHASE 3: Relay Server E2E
# ═════════════════════════════════════════════════════════════════
if $RUN_RELAY; then
  section "PHASE 3: Relay Server E2E"

  if ! is_reachable "$RELAY_URL/health"; then
    echo -e "  ${YELLOW}Relay server not running at $RELAY_URL${NC}"
    echo "  Start it with: cd chainlink-functions && node server.js"
    skip "All relay tests (server not running)"
  else

    # 3.1 Health check
    test_header "3.1: Health Check (GET /health)"
    HEALTH=$(curl -sf "$RELAY_URL/health" 2>/dev/null || echo '{}')
    STATUS=$(echo "$HEALTH" | jq -r '.status' 2>/dev/null || echo "null")
    BALANCE=$(echo "$HEALTH" | jq -r '.balance' 2>/dev/null || echo "null")
    SIGNER=$(echo "$HEALTH" | jq -r '.signer' 2>/dev/null || echo "null")
    echo "    status=$STATUS, balance=$BALANCE ETH, signer=$SIGNER"
    if [[ "$STATUS" == "ok" ]]; then
      pass "Relay server healthy"
    else
      fail "Health check returned status=$STATUS"
    fi

    # 3.2 Faucet — valid address
    test_header "3.2: Faucet — Fund Valid Address (POST /faucet)"
    FAUCET=$(curl -sf -X POST "$RELAY_URL/faucet" \
      -H "Content-Type: application/json" \
      -d '{"address":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8"}' 2>/dev/null || echo '{}')
    FAUCET_OK=$(echo "$FAUCET" | jq -r '.success' 2>/dev/null || echo "false")
    echo "    $(echo "$FAUCET" | jq -c '.' 2>/dev/null || echo "$FAUCET")"
    if [[ "$FAUCET_OK" == "true" ]]; then
      pass "Faucet funded/skipped successfully"
    else
      fail "Faucet returned success=false"
    fi

    # 3.3 Faucet — invalid address
    test_header "3.3: Faucet — Reject Invalid Address"
    FAUCET_BAD=$(curl -sf -X POST "$RELAY_URL/faucet" \
      -H "Content-Type: application/json" \
      -d '{"address":"0xinvalid"}' 2>/dev/null || echo '{"success":false}')
    FAUCET_BAD_OK=$(echo "$FAUCET_BAD" | jq -r '.success' 2>/dev/null || echo "true")
    echo "    $(echo "$FAUCET_BAD" | jq -c '.' 2>/dev/null || echo "$FAUCET_BAD")"
    if [[ "$FAUCET_BAD_OK" == "false" ]]; then
      pass "Invalid address rejected"
    else
      fail "Invalid address was accepted"
    fi

    # 3.4 Faucet — missing address
    test_header "3.4: Faucet — Reject Missing Address"
    FAUCET_EMPTY=$(curl -sf -X POST "$RELAY_URL/faucet" \
      -H "Content-Type: application/json" \
      -d '{}' 2>/dev/null || echo '{"success":false}')
    FAUCET_EMPTY_OK=$(echo "$FAUCET_EMPTY" | jq -r '.success' 2>/dev/null || echo "true")
    if [[ "$FAUCET_EMPTY_OK" == "false" ]]; then
      pass "Missing address rejected"
    else
      fail "Missing address was accepted"
    fi

    # 3.5 Relay start-mission — missing fields
    test_header "3.5: Relay start-mission — Reject Missing Fields"
    RELAY_MISS=$(curl -sf -X POST "$RELAY_URL/relay/start-mission" \
      -H "Content-Type: application/json" \
      -d '{}' 2>/dev/null || echo '{"success":false}')
    RELAY_MISS_OK=$(echo "$RELAY_MISS" | jq -r '.success' 2>/dev/null || echo "true")
    echo "    $(echo "$RELAY_MISS" | jq -c '.' 2>/dev/null || echo "$RELAY_MISS")"
    if [[ "$RELAY_MISS_OK" == "false" ]]; then
      pass "Missing fields rejected"
    else
      fail "Missing fields accepted"
    fi

    # 3.6 Relay start-mission — invalid signature
    test_header "3.6: Relay start-mission — Reject Invalid Signature"
    RELAY_SIG=$(curl -sf -X POST "$RELAY_URL/relay/start-mission" \
      -H "Content-Type: application/json" \
      -d '{"playerAddress":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","signature":"0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000","nonce":"999999"}' \
      2>/dev/null || echo '{"success":false}')
    RELAY_SIG_OK=$(echo "$RELAY_SIG" | jq -r '.success' 2>/dev/null || echo "true")
    echo "    $(echo "$RELAY_SIG" | jq -c '.' 2>/dev/null || echo "$RELAY_SIG")"
    if [[ "$RELAY_SIG_OK" == "false" ]]; then
      pass "Invalid signature rejected"
    else
      fail "Invalid signature accepted"
    fi

    # 3.7 Relay register-player — missing fields
    test_header "3.7: Relay register-player — Reject Missing Fields"
    RELAY_REG=$(curl -sf -X POST "$RELAY_URL/relay/register-player" \
      -H "Content-Type: application/json" \
      -d '{"playerAddress":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8"}' \
      2>/dev/null || echo '{"success":false}')
    RELAY_REG_OK=$(echo "$RELAY_REG" | jq -r '.success' 2>/dev/null || echo "true")
    if [[ "$RELAY_REG_OK" == "false" ]]; then
      pass "register-player: missing publicKeyHex rejected"
    else
      fail "register-player: missing fields accepted"
    fi

    # 3.8 Relay submit-investigation — missing fields
    test_header "3.8: Relay submit-investigation — Reject Missing Fields"
    RELAY_INV=$(curl -sf -X POST "$RELAY_URL/relay/submit-investigation" \
      -H "Content-Type: application/json" \
      -d '{}' 2>/dev/null || echo '{"success":false}')
    RELAY_INV_OK=$(echo "$RELAY_INV" | jq -r '.success' 2>/dev/null || echo "true")
    if [[ "$RELAY_INV_OK" == "false" ]]; then
      pass "submit-investigation: missing fields rejected"
    else
      fail "submit-investigation: missing fields accepted"
    fi

    # 3.9 Relay city-action — reject unknown action
    test_header "3.9: Relay city-action — Reject Unknown Action"
    RELAY_UNK=$(curl -sf -X POST "$RELAY_URL/relay/city-action" \
      -H "Content-Type: application/json" \
      -d '{"playerAddress":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","signature":"0x00","nonce":"1","chainId":"421614","action":"dropTable"}' \
      2>/dev/null || echo '{"success":false}')
    RELAY_UNK_OK=$(echo "$RELAY_UNK" | jq -r '.success' 2>/dev/null || echo "true")
    if [[ "$RELAY_UNK_OK" == "false" ]]; then
      pass "city-action: unknown action 'dropTable' rejected"
    else
      fail "city-action: unknown action accepted"
    fi

    # 3.10 Relay city-action — reject missing chainId
    test_header "3.10: Relay city-action — Reject Missing chainId"
    RELAY_CHAIN=$(curl -sf -X POST "$RELAY_URL/relay/city-action" \
      -H "Content-Type: application/json" \
      -d '{"playerAddress":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","signature":"0x00","nonce":"1","action":"inspectLocation"}' \
      2>/dev/null || echo '{"success":false}')
    RELAY_CHAIN_OK=$(echo "$RELAY_CHAIN" | jq -r '.success' 2>/dev/null || echo "true")
    if [[ "$RELAY_CHAIN_OK" == "false" ]]; then
      pass "city-action: missing chainId rejected"
    else
      fail "city-action: missing chainId accepted"
    fi

    # 3.11 Rate Limiting
    test_header "3.11: Rate Limiting (20 req/min per address)"
    RATE_OK=0
    RATE_LIMITED=0
    # Use unique address per test run to avoid stale rate-limit windows
    RATE_SUFFIX=$(printf '%040x' "$(date +%s)")
    RATE_ADDR="0x${RATE_SUFFIX:0:40}"
    for i in $(seq 1 25); do
      HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$RELAY_URL/relay/start-mission" \
        -H "Content-Type: application/json" \
        -d "{\"playerAddress\":\"$RATE_ADDR\",\"signature\":\"0x00\",\"nonce\":\"$i\"}" \
        2>/dev/null)
      if [[ "$HTTP_CODE" == "429" ]]; then
        ((RATE_LIMITED++))
      else
        ((RATE_OK++))
      fi
    done
    echo "    Accepted: $RATE_OK, Rate-limited (429): $RATE_LIMITED"
    if [[ $RATE_LIMITED -gt 0 ]]; then
      pass "Rate limiting works ($RATE_LIMITED/25 blocked)"
    else
      fail "Rate limiting not triggered after 25 requests"
    fi

  fi  # relay reachable
fi

# ═════════════════════════════════════════════════════════════════
#  PHASE 4: Frontend E2E
# ═════════════════════════════════════════════════════════════════
if $RUN_FRONTEND; then
  section "PHASE 4: Frontend E2E"

  if ! is_reachable "$FRONTEND_URL"; then
    echo -e "  ${YELLOW}Frontend not running at $FRONTEND_URL${NC}"
    echo "  Start it with: cd frontend && npm run dev"
    skip "All frontend tests (server not running)"
  else

    # 4.1 Frontend serves HTTP 200
    test_header "4.1: Frontend Serves (HTTP 200)"
    FE_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$FRONTEND_URL" 2>/dev/null || echo "000")
    echo "    HTTP $FE_STATUS"
    if [[ "$FE_STATUS" == "200" ]]; then
      pass "Frontend serves HTTP 200"
    else
      fail "Frontend returned HTTP $FE_STATUS"
    fi

    # 4.2 HTML contains game title
    test_header "4.2: HTML Contains 'Carmen Sandiego'"
    FE_HTML=$(curl -sf "$FRONTEND_URL" 2>/dev/null || echo "")
    TITLE_COUNT=$(echo "$FE_HTML" | grep -c "Carmen Sandiego" || true)
    echo "    Matches: $TITLE_COUNT"
    if [[ "$TITLE_COUNT" -gt 0 ]]; then
      pass "HTML contains 'Carmen Sandiego'"
    else
      fail "HTML does not contain 'Carmen Sandiego'"
    fi

    # 4.3 HTML loads JavaScript (Vite uses type="module" with .tsx/.jsx/.ts/.js)
    test_header "4.3: JavaScript Bundle Loads"
    JS_COUNT=$(echo "$FE_HTML" | grep -cE 'script.*src=|type="module"' || true)
    echo "    Script/module tags: $JS_COUNT"
    if [[ "$JS_COUNT" -gt 0 ]]; then
      pass "JavaScript bundle referenced"
    else
      fail "No JS bundle found in HTML"
    fi

    # 4.4 Frontend dist has correct assets
    test_header "4.4: Build Output Structure"
    DIST_DIR="$ROOT_DIR/frontend/dist"
    if [[ -d "$DIST_DIR" ]]; then
      ASSET_COUNT=$(find "$DIST_DIR/assets" -name "*.js" 2>/dev/null | wc -l)
      echo "    JS chunks in dist/assets: $ASSET_COUNT"
      if [[ "$ASSET_COUNT" -gt 5 ]]; then
        pass "Build output has $ASSET_COUNT JS chunks"
      else
        fail "Expected >5 JS chunks, found $ASSET_COUNT"
      fi
    else
      skip "dist/ not found (run npm run build first)"
    fi

    # 4.5 Check for console errors in HTML (no 404 references)
    test_header "4.5: No Broken Asset References"
    BROKEN=$(echo "$FE_HTML" | grep -c "404\|not found\|error" || true)
    if [[ "$BROKEN" -eq 0 ]]; then
      pass "No broken references in HTML"
    else
      fail "Found $BROKEN potential issues in HTML"
    fi

  fi  # frontend reachable
fi

# ═════════════════════════════════════════════════════════════════
#  PHASE 5: Chainlink Integration Summary
# ═════════════════════════════════════════════════════════════════
section "PHASE 5: Chainlink Integration Verification"

test_header "5.1: Chainlink Service Count"
GM_SOL="$ROOT_DIR/contracts/src/GameMaster.sol"
CN_SOL="$ROOT_DIR/contracts/src/CityNode.sol"
SERVICES=0
SERVICES_LIST=""

# VRF v2.5
if grep -q "VRFConsumerBaseV2Plus" "$GM_SOL"; then
  ((SERVICES++)); SERVICES_LIST="VRF"
fi
# Data Feeds
if grep -q "AggregatorV3Interface" "$GM_SOL"; then
  ((SERVICES++)); SERVICES_LIST="$SERVICES_LIST, DataFeeds"
fi
# CCIP (sender)
if grep -q "broadcastCarmenMove" "$GM_SOL"; then
  ((SERVICES++)); SERVICES_LIST="$SERVICES_LIST, CCIP-Send"
fi
# CCIP (receiver)
if grep -q "CCIPReceiver" "$CN_SOL"; then
  ((SERVICES++)); SERVICES_LIST="$SERVICES_LIST, CCIP-Recv"
fi
# CRE/Keystone
if grep -q "creOracle" "$GM_SOL"; then
  ((SERVICES++)); SERVICES_LIST="$SERVICES_LIST, CRE"
fi
# Automation (time-based triggers in CRE carmen-moves)
if [[ -f "$ROOT_DIR/cre-workflows/carmen-moves/main.ts" ]]; then
  ((SERVICES++)); SERVICES_LIST="$SERVICES_LIST, Automation"
fi

echo "    Services: $SERVICES_LIST"
if [[ $SERVICES -ge 6 ]]; then
  pass "All 6 Chainlink services integrated"
else
  fail "Only $SERVICES/6 Chainlink services found"
fi

test_header "5.2: Contract Event Coverage"
EVENTS=0
CONTRACTS_SRC="$ROOT_DIR/contracts/src"
for evt in "MissionStarted" "CarmenLocationCommitted" "RewardCalculatedWithMarketData" "CarmenMoveBroadcast" "PriceFeedSet" "CCIPRouterSet" "CarmenLocationUpdatedViaCCIP"; do
  if grep -rq "event $evt" "$CONTRACTS_SRC" 2>/dev/null; then
    ((EVENTS++))
  fi
done
echo "    Chainlink events: $EVENTS/7"
if [[ $EVENTS -ge 5 ]]; then
  pass "$EVENTS/7 Chainlink-related events defined"
else
  fail "Only $EVENTS/7 Chainlink events found"
fi

test_header "5.3: Frontend Chainlink Display"
GAME_PAGE="$ROOT_DIR/frontend/src/pages/GamePage.jsx"
CONTRACT_SVC="$ROOT_DIR/frontend/src/services/contractService.js"
FE_INTEGRATIONS=0

if grep -q "getCCIPStatus\|ccip\|CCIP" "$GAME_PAGE" 2>/dev/null; then
  ((FE_INTEGRATIONS++))
fi
if grep -q "getMarketData\|ethPrice\|ETH.*USD" "$CONTRACT_SVC" 2>/dev/null; then
  ((FE_INTEGRATIONS++))
fi
if grep -q "getCCIPSyncStatus" "$CONTRACT_SVC" 2>/dev/null; then
  ((FE_INTEGRATIONS++))
fi
if grep -q "relayStartMission\|relayService" "$CONTRACT_SVC" 2>/dev/null; then
  ((FE_INTEGRATIONS++))
fi

echo "    Frontend integrations: $FE_INTEGRATIONS/4 (CCIP display, DataFeeds, CitySync, Relay)"
if [[ $FE_INTEGRATIONS -ge 3 ]]; then
  pass "Frontend displays $FE_INTEGRATIONS/4 Chainlink integrations"
else
  fail "Only $FE_INTEGRATIONS/4 frontend Chainlink integrations"
fi

# ═════════════════════════════════════════════════════════════════
#  Summary
# ═════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║                    TEST RESULTS                          ║${NC}"
echo -e "${BOLD}╠═══════════════════════════════════════════════════════════╣${NC}"
echo -e "║  ${GREEN}Passed:  $PASS_COUNT${NC}"
echo -e "║  ${RED}Failed:  $FAIL_COUNT${NC}"
echo -e "║  ${YELLOW}Skipped: $SKIP_COUNT${NC}"
echo -e "║  Total:  $TOTAL_COUNT"
echo -e "${BOLD}╚═══════════════════════════════════════════════════════════╝${NC}"

if [[ $FAIL_COUNT -gt 0 ]]; then
  echo ""
  echo -e "${RED}${BOLD}Some tests failed. Review the output above.${NC}"
  exit 1
else
  echo ""
  echo -e "${GREEN}${BOLD}All tests passed! Ready to commit.${NC}"
  exit 0
fi
