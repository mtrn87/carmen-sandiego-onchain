#!/usr/bin/env bash
# generate-cre-configs.sh — Regenerate CRE workflow config files from env vars
#
# Required env vars:
#   GAME_MASTER_ADDRESS
#   GAME_MASTER_PROXY_ADDRESS
#
# Optional env vars:
#   OPENAI_API_KEY   (for generate-briefing configs, default: YOUR_OPENAI_API_KEY)
#   OPENAI_MODEL     (for generate-briefing configs, default: gpt-4o-mini)
#   ACTIVE_MISSION_ID (for carmen-moves production config)
#
# Usage:
#   source .env && bash scripts/generate-cre-configs.sh
#   # or
#   GAME_MASTER_ADDRESS=0x... GAME_MASTER_PROXY_ADDRESS=0x... bash scripts/generate-cre-configs.sh

set -euo pipefail

if [[ -z "${GAME_MASTER_ADDRESS:-}" ]]; then
  echo "ERROR: GAME_MASTER_ADDRESS is not set" >&2
  exit 1
fi
if [[ -z "${GAME_MASTER_PROXY_ADDRESS:-}" ]]; then
  echo "ERROR: GAME_MASTER_PROXY_ADDRESS is not set" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
CRE_DIR="$ROOT_DIR/cre-workflows"

OPENAI_API_KEY="${OPENAI_API_KEY:-YOUR_OPENAI_API_KEY}"
OPENAI_MODEL="${OPENAI_MODEL:-gpt-4o-mini}"

# --- Base config (mission-start, carmen-moves) ---
write_base_config() {
  local file="$1"
  cat > "$file" <<EOF
{
  "chainSelectorName": "ethereum-testnet-sepolia",
  "gameMasterAddress": "$GAME_MASTER_ADDRESS",
  "proxyAddress": "$GAME_MASTER_PROXY_ADDRESS",
  "gasLimit": "500000"
}
EOF
  echo "  Generated: $file"
}

# --- Briefing config (generate-briefing — includes OpenAI fields) ---
write_briefing_config() {
  local file="$1"
  cat > "$file" <<EOF
{
  "chainSelectorName": "ethereum-testnet-sepolia",
  "gameMasterAddress": "$GAME_MASTER_ADDRESS",
  "proxyAddress": "$GAME_MASTER_PROXY_ADDRESS",
  "gasLimit": "500000",
  "openaiApiKey": "$OPENAI_API_KEY",
  "openaiModel": "$OPENAI_MODEL"
}
EOF
  echo "  Generated: $file"
}

echo "=== Generating CRE workflow configs ==="
echo "GameMaster:      $GAME_MASTER_ADDRESS"
echo "GameMasterProxy: $GAME_MASTER_PROXY_ADDRESS"
echo ""

# mission-start
write_base_config "$CRE_DIR/mission-start/config.staging.json"
write_base_config "$CRE_DIR/mission-start/config.production.json"

# carmen-moves
write_base_config "$CRE_DIR/carmen-moves/config.staging.json"
write_base_config "$CRE_DIR/carmen-moves/config.production.json"

# generate-briefing
write_briefing_config "$CRE_DIR/generate-briefing/config.staging.json"
write_briefing_config "$CRE_DIR/generate-briefing/config.production.json"

echo ""
echo "Done! All 6 CRE configs updated."
