#!/bin/bash
#
# Runs all Next viewport Playwright tests (legacy vs Next GPU vs Next CPU).
#
# Usage:
#   ./tests/run-next-test.sh              # run all tests
#   ./tests/run-next-test.sh --update     # update baseline screenshots
#   ./tests/run-next-test.sh tests/ecgNext.spec.ts  # run a single spec
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

SPECS=(
  "tests/labelmapRenderingNext.spec.ts"
  "tests/labelmapOverlapNext.spec.ts"
  "tests/labelmapSegToolsNext.spec.ts"
  "tests/volumeAnnotationNext.spec.ts"
  "tests/stackManipulationToolsNext.spec.ts"
  "tests/multiVolumeAPINext.spec.ts"
  "tests/stackAPINext.spec.ts"
  "tests/wsiNext.spec.ts"
  "tests/videoNext.spec.ts"
  "tests/ecgNext.spec.ts"
)

SERIAL_SPECS=(
  "tests/stackLabelmapSegNext.spec.ts"
)

# Only build the examples these tests actually use (8 out of ~120)
EXAMPLES="labelmapRendering labelmapOverlapPlayground labelmapSegmentationTools stackLabelmapSegmentation volumeAnnotationTools stackManipulationTools multiVolumeAPI stackAPI wsi video ecg"

PROJECT="chromium"
UPDATE_FLAG=""
PORT=3333
SERVER_PID=""

# ── Parse args ──────────────────────────────────────────────────────
CUSTOM_SPECS=()
for arg in "$@"; do
  case "$arg" in
    --update) UPDATE_FLAG="--update-snapshots" ;;
    *)        CUSTOM_SPECS+=("$arg") ;;
  esac
done

if [[ ${#CUSTOM_SPECS[@]} -gt 0 ]]; then
  SPECS=("${CUSTOM_SPECS[@]}")
  SERIAL_SPECS=()
fi

# ── Kill existing server on our port ────────────────────────────────
LISTENER_PID="$(lsof -tiTCP:${PORT} -sTCP:LISTEN || true)"
if [[ -n "$LISTENER_PID" ]]; then
  echo "-- Stopping existing process on :${PORT} --"
  kill "$LISTENER_PID"
  sleep 1
fi

# ── Build only the needed examples, then serve ──────────────────────
cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "-- Building ${EXAMPLES// /, } --"
NODE_OPTIONS=--max_old_space_size=32896 \
  node ./utils/ExampleRunner/build-all-examples-cli.js --build --fromRoot $EXAMPLES

echo "-- Serving on :${PORT} --"
npx serve .static-examples --listen ${PORT} &>/dev/null &
SERVER_PID=$!

# Wait for server (poll every 1s, max 120s)
for _ in $(seq 1 120); do
  if curl -fsS "http://localhost:${PORT}" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Server failed to start."
    exit 1
  fi
  sleep 1
done

if ! curl -fsS "http://localhost:${PORT}" >/dev/null 2>&1; then
  echo "Timed out waiting for server on :${PORT}."
  exit 1
fi

# ── Run all specs in a single parallel Playwright invocation ────────
if [[ -n "$UPDATE_FLAG" ]]; then
  echo "-- Updating baseline screenshots --"
fi

echo ""
echo "-- Running ${#SPECS[@]} spec(s) in parallel --"
echo ""

PLAYWRIGHT_REUSE_EXISTING_SERVER=true \
  npx playwright test "${SPECS[@]}" \
  --project="$PROJECT" \
  --reporter=list \
  $UPDATE_FLAG

if [[ ${#SERIAL_SPECS[@]} -gt 0 ]]; then
  echo ""
  echo "-- Running ${#SERIAL_SPECS[@]} spec(s) sequentially --"
  echo ""

  PLAYWRIGHT_REUSE_EXISTING_SERVER=true \
    npx playwright test "${SERIAL_SPECS[@]}" \
    --project="$PROJECT" \
    --reporter=list \
    $UPDATE_FLAG
fi
