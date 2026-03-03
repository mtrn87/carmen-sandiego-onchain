#!/usr/bin/env bash
# ================================================================
#  simulate-all.sh
#  Runs CRE CLI simulations for all Carmen Sandiego workflows.
#  Saves timestamped logs to ./logs/ for hackathon video evidence.
#
#  Usage: bash simulate-all.sh
# ================================================================

set -e

# Ensure cre CLI is in PATH (Git Bash: /c/  |  WSL: /mnt/c/)
export PATH="/c/Users/MTulio/AppData/Local/Programs/cre:/mnt/c/Users/MTulio/AppData/Local/Programs/cre:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# ── TX Hashes (pre-recorded on Sepolia) ──────────────────────────
TX_GENERATE_BRIEFING="0x3fba49f92846035e3c65e703af12b9755c168287b9ada2f4e9cb749bb0019f0c"
TX_MISSION_START="0xafe53d52de5ced22ae861f84e37b5fb13323b20cc6973f45f6be3628c23f3f13"
TX_GENERATE_FINALE="0xb88e671b9b63cd67fd06c1ebb61cbb63e30e919c61f882f26cd74eb941512494"
TX_PLAYER_REGISTRATION="0x19f9aa5b53dd277ccf5e064bf18e155125890dd71137117f9edacf3ca9899ee4"
TX_PLAYER_CHECK="0x6aecf68f4ffdbe2b3f0281ad3e8a30d52eec9f414f614c297f80be066a4a4038"

PASS=0
FAIL=0
FAILED_WORKFLOWS=()

run_sim() {
  local name="$1"
  local logfile="$LOG_DIR/${TIMESTAMP}_${name}.log"
  shift
  echo ""
  echo "════════════════════════════════════════════════════════════════════"
  echo "  Simulating: $name"
  echo "  Log: $logfile"
  echo "════════════════════════════════════════════════════════════════════"
  {
    echo "=== Carmen Sandiego — CRE Simulation: $name ==="
    echo "=== $(date) ==="
    echo ""
  } | tee "$logfile"

  # Capture output AND exit code correctly (avoid pipe masking exit code)
  local tmp_out
  tmp_out=$(mktemp)
  cre workflow simulate "$@" > "$tmp_out" 2>&1
  local exit_code=$?
  cat "$tmp_out" | tee -a "$logfile"
  rm -f "$tmp_out"

  echo "" | tee -a "$logfile"
  if [ "$exit_code" -eq 0 ]; then
    echo "✅ [$name] SIMULATION PASSED" | tee -a "$logfile"
    PASS=$((PASS + 1))
  else
    echo "❌ [$name] SIMULATION FAILED (exit $exit_code)" | tee -a "$logfile"
    FAIL=$((FAIL + 1))
    FAILED_WORKFLOWS+=("$name")
  fi
}

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║   Carmen Sandiego On-Chain — CRE Workflow Simulations           ║"
echo "║   $(date)                              ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "Logs directory: $LOG_DIR"
echo ""

# ── 1. carmen-moves (Cron trigger — no TX) ─────────────────────
run_sim "carmen-moves" \
  ./carmen-moves -T staging-settings -e .env --non-interactive \
  --trigger-index 0

# ── 2. generate-briefing (MissionStarted, log idx 1) ───────────
run_sim "generate-briefing" \
  ./generate-briefing -T staging-settings -e .env --non-interactive \
  --trigger-index 0 \
  --evm-tx-hash "$TX_GENERATE_BRIEFING" \
  --evm-event-index 1

# ── 3. mission-start (InvestigationSubmitted, log idx 0) ────────
run_sim "mission-start" \
  ./mission-start -T staging-settings -e .env --non-interactive \
  --trigger-index 0 \
  --evm-tx-hash "$TX_MISSION_START" \
  --evm-event-index 0

# ── 4. generate-finale (CarmenCaptured, log idx 1) ──────────────
run_sim "generate-finale" \
  ./generate-finale -T staging-settings -e .env --non-interactive \
  --trigger-index 0 \
  --evm-tx-hash "$TX_GENERATE_FINALE" \
  --evm-event-index 1

# ── 5. player-registration (RegistrationRequested, log idx 0) ───
run_sim "player-registration" \
  ./player-registration -T staging-settings -e .env --non-interactive \
  --trigger-index 0 \
  --evm-tx-hash "$TX_PLAYER_REGISTRATION" \
  --evm-event-index 0

# ── 6. player-check (PlayerCheckRequested, log idx 0) ───────────
run_sim "player-check" \
  ./player-check -T staging-settings -e .env --non-interactive \
  --trigger-index 0 \
  --evm-tx-hash "$TX_PLAYER_CHECK" \
  --evm-event-index 0

# ── Summary ──────────────────────────────────────────────────────
SUMMARY_LOG="$LOG_DIR/${TIMESTAMP}_SUMMARY.log"
{
  echo ""
  echo "════════════════════════════════════════════════════════════════════"
  echo "  SIMULATION SUMMARY — $(date)"
  echo "════════════════════════════════════════════════════════════════════"
  echo "  ✅ Passed: $PASS"
  echo "  ❌ Failed: $FAIL"
  if [ ${#FAILED_WORKFLOWS[@]} -gt 0 ]; then
    echo ""
    echo "  Failed workflows:"
    for w in "${FAILED_WORKFLOWS[@]}"; do
      echo "    - $w"
    done
  fi
  echo ""
  echo "  Log files:"
  ls "$LOG_DIR"/${TIMESTAMP}_*.log 2>/dev/null | while read -r f; do
    echo "    $(basename "$f")"
  done
  echo "════════════════════════════════════════════════════════════════════"
} | tee "$SUMMARY_LOG"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
